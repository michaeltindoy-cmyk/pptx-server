/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PPTX → PNG Conversion Server
 * Deploy on Railway / Render / any Ubuntu VPS
 *
 * What it does:
 *   1. Receives a .pptx file upload from Pastor Monitor
 *   2. Runs LibreOffice headless to convert each slide → PNG
 *   3. Uploads each PNG to Firebase Storage
 *   4. Returns an array of public download URLs
 *
 * Setup:
 *   npm install
 *   Set environment variables (see .env.example)
 *   Deploy to Railway / Render
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express    = require("express");
const multer     = require("multer");
const cors       = require("cors");
const { exec }   = require("child_process");
const fs         = require("fs");
const path       = require("path");
const os         = require("os");
const { promisify } = require("util");
const execAsync  = promisify(exec);

// Firebase Admin SDK
const admin = require("firebase-admin");

// ── Firebase init ─────────────────────────────────────────────────────────────
// Expects FIREBASE_SERVICE_ACCOUNT env var = JSON string of your service account key
// OR place serviceAccountKey.json in the same folder
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require("./serviceAccountKey.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET, // e.g. "your-app.appspot.com"
});

const bucket = admin.storage().bucket();

// ── Express setup ─────────────────────────────────────────────────────────────
const app    = express();
const upload = multer({ dest: os.tmpdir() });

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "*", // restrict to your domain in production
}));

app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// ── Main conversion endpoint ──────────────────────────────────────────────────
/**
 * POST /convert
 * Body: multipart/form-data  { file: .pptx, sessionId: string (optional) }
 * Returns: { slides: [{ index, title, imageUrl }] }
 */
app.post("/convert", upload.single("file"), async (req, res) => {
  const tmpDir   = path.join(os.tmpdir(), `pptx_${Date.now()}`);
  const pptxPath = req.file?.path;

  if (!pptxPath) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // sessionId groups slides in Firebase Storage (defaults to timestamp)
  const sessionId = req.body?.sessionId || `sermon_${Date.now()}`;

  try {
    // 1. Create temp working dir
    fs.mkdirSync(tmpDir, { recursive: true });

    // 2. Copy uploaded file to working dir with .pptx extension
    const pptxWork = path.join(tmpDir, "presentation.pptx");
    fs.copyFileSync(pptxPath, pptxWork);

    console.log(`[convert] Converting ${req.file.originalname} — session: ${sessionId}`);

    // 3. LibreOffice: convert pptx → PNG (one PNG per slide)
    //    --impress flag targets presentations
    //    Output files named: presentation1.png, presentation2.png, ...
    const loCmd = [
      "libreoffice",
      "--headless",
      "--convert-to", "png",
      "--outdir", tmpDir,
      pptxWork,
    ].join(" ");

    await execAsync(loCmd, { timeout: 120000 }); // 2 min timeout

    // 4. Collect generated PNGs sorted by slide number
    const pngFiles = fs.readdirSync(tmpDir)
      .filter(f => f.endsWith(".png"))
      .sort((a, b) => {
        // LibreOffice names them: presentation.png (1 slide) or
        // presentation1.png, presentation2.png, etc.
        const numA = parseInt(a.match(/(\d+)\.png$/)?.[1] || "1");
        const numB = parseInt(b.match(/(\d+)\.png$/)?.[1] || "1");
        return numA - numB;
      });

    if (pngFiles.length === 0) {
      throw new Error("LibreOffice produced no PNG output. Is LibreOffice installed?");
    }

    console.log(`[convert] ${pngFiles.length} slides rendered`);

    // 5. Upload each PNG to Firebase Storage
    const slideResults = [];

    for (let i = 0; i < pngFiles.length; i++) {
      const localPath   = path.join(tmpDir, pngFiles[i]);
      const storagePath = `sermon_slides/${sessionId}/slide_${i + 1}.png`;

      await bucket.upload(localPath, {
        destination: storagePath,
        metadata: {
          contentType: "image/png",
          cacheControl: "public, max-age=31536000",
        },
      });

      // Make public and get URL
      const fileRef = bucket.file(storagePath);
      await fileRef.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      slideResults.push({
        index:    i,
        title:    `Slide ${i + 1}`,
        imageUrl: publicUrl,
        notes:    "",
        bodyText: "",
        id:       `slide_${sessionId}_${i}`,
      });

      console.log(`[convert] Uploaded slide ${i + 1}/${pngFiles.length}`);
    }

    // 6. Clean up temp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlinkSync(pptxPath);

    // 7. Return results
    res.json({ slides: slideResults, sessionId });

  } catch (err) {
    console.error("[convert] Error:", err);

    // Clean up on error
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(pptxPath); } catch (_) {}

    res.status(500).json({
      error: err.message || "Conversion failed",
      hint: err.message?.includes("libreoffice") 
        ? "Make sure LibreOffice is installed: sudo apt install libreoffice"
        : undefined,
    });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ PPTX Conversion Server running on port ${PORT}`);
  console.log(`   Firebase bucket: ${process.env.FIREBASE_STORAGE_BUCKET}`);
});
