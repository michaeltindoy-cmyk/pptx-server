/**
 * PPTX → PNG Conversion Server (No Firebase — returns base64 directly)
 * Deploy on Render.com free tier
 *
 * POST /convert  →  receives .pptx, returns PNG slides as base64 data URLs
 */

const express   = require("express");
const multer    = require("multer");
const cors      = require("cors");
const { exec }  = require("child_process");
const fs        = require("fs");
const path      = require("path");
const os        = require("os");
const { promisify } = require("util");
const execAsync = promisify(exec);

const app    = express();
const upload = multer({ dest: os.tmpdir() });

app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// ── Main conversion endpoint ──────────────────────────────────────────────────
// POST /convert
// Body: multipart/form-data { file: .pptx }
// Returns: { slides: [{ id, index, title, imageUrl, notes, bodyText }] }
app.post("/convert", upload.single("file"), async (req, res) => {
  const tmpDir   = path.join(os.tmpdir(), `pptx_${Date.now()}`);
  const pptxPath = req.file?.path;

  if (!pptxPath) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // 1. Create temp working dir
    fs.mkdirSync(tmpDir, { recursive: true });

    // 2. Copy uploaded file with .pptx extension
    const pptxWork = path.join(tmpDir, "presentation.pptx");
    fs.copyFileSync(pptxPath, pptxWork);

    console.log(`[convert] Converting: ${req.file.originalname}`);

    // 3. LibreOffice: convert pptx → PNG (one PNG per slide)
    await execAsync(
      `libreoffice --headless --convert-to png --outdir ${tmpDir} ${pptxWork}`,
      { timeout: 120000 }
    );

    // 4. Collect PNGs sorted by slide number
    const pngFiles = fs.readdirSync(tmpDir)
      .filter(f => f.endsWith(".png"))
      .sort((a, b) => {
        const numA = parseInt(a.match(/(\d+)\.png$/)?.[1] || "1");
        const numB = parseInt(b.match(/(\d+)\.png$/)?.[1] || "1");
        return numA - numB;
      });

    if (pngFiles.length === 0) {
      throw new Error("No slides were generated. Is LibreOffice installed?");
    }

    console.log(`[convert] ${pngFiles.length} slides rendered`);

    // 5. Read each PNG and convert to base64 data URL
    const slides = pngFiles.map((file, i) => {
      const filePath = path.join(tmpDir, file);
      const b64 = fs.readFileSync(filePath).toString("base64");
      return {
        id:       `slide_${Date.now()}_${i}`,
        index:    i,
        title:    `Slide ${i + 1}`,
        imageUrl: `data:image/png;base64,${b64}`,
        notes:    "",
        bodyText: "",
      };
    });

    // 6. Clean up temp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlinkSync(pptxPath);

    console.log(`[convert] Done — returning ${slides.length} slides`);
    res.json({ slides });

  } catch (err) {
    console.error("[convert] Error:", err.message);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(pptxPath); } catch (_) {}
    res.status(500).json({ error: err.message || "Conversion failed" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`✅ PPTX Server running on port ${PORT} — no Firebase needed`)
);