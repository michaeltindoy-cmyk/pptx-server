/**
 * PPTX → PNG Conversion Server (No Firebase — returns base64 directly)
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

app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

app.post("/convert", upload.single("file"), async (req, res) => {
  const tmpDir   = path.join(os.tmpdir(), `pptx_${Date.now()}`);
  const pptxPath = req.file?.path;

  if (!pptxPath) return res.status(400).json({ error: "No file uploaded" });

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    const pptxWork = path.join(tmpDir, "presentation.pptx");
    fs.copyFileSync(pptxPath, pptxWork);

    console.log(`[convert] Converting: ${req.file.originalname}`);

    // Convert to PNG
    await execAsync(
      `libreoffice --headless --convert-to png --outdir "${tmpDir}" "${pptxWork}"`,
      { timeout: 120000 }
    );

    // Log ALL files in tmpDir for debugging
    const allFiles = fs.readdirSync(tmpDir);
    console.log(`[convert] All files in tmpDir:`, allFiles);

    // Collect PNGs — exclude the source pptx
    const pngFiles = allFiles
      .filter(f => f.toLowerCase().endsWith(".png"))
      .sort((a, b) => {
        // Extract any number from filename for sorting
        // Handles: presentation.png, presentation1.png, presentation2.png
        // Also handles: presentation-1.png, slide1.png, etc.
        const getNum = (name) => {
          const m = name.match(/(\d+)/);
          return m ? parseInt(m[1]) : 0;
        };
        return getNum(a) - getNum(b);
      });

    console.log(`[convert] PNG files found:`, pngFiles);

    if (pngFiles.length === 0) {
      throw new Error("No PNG slides generated. LibreOffice may have failed silently.");
    }

    // Convert each PNG to base64
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

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlinkSync(pptxPath);

    console.log(`[convert] Done — ${slides.length} slides returned`);
    res.json({ slides });

  } catch (err) {
    console.error("[convert] Error:", err.message);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(pptxPath); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`✅ PPTX Server running on port ${PORT} — no Firebase needed`)
);
