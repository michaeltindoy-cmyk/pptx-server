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

    // Step 1: Convert to PDF first (LibreOffice handles this reliably)
    await execAsync(
      `libreoffice --headless --convert-to pdf --outdir "${tmpDir}" "${pptxWork}"`,
      { timeout: 120000 }
    );

    const pdfPath = path.join(tmpDir, "presentation.pdf");

    if (!fs.existsSync(pdfPath)) {
      throw new Error("PDF conversion failed — LibreOffice did not produce a PDF.");
    }

    console.log(`[convert] PDF created, now converting to PNG per page...`);

    // Step 2: Use pdftoppm to convert each PDF page to PNG
    // pdftoppm is more reliable for multi-page conversion
    await execAsync(
      `pdftoppm -png -r 150 "${pdfPath}" "${path.join(tmpDir, "slide")}"`  ,
      { timeout: 120000 }
    );

    // Collect all PNGs
    const allFiles = fs.readdirSync(tmpDir);
    console.log(`[convert] All files:`, allFiles);

    const pngFiles = allFiles
      .filter(f => f.toLowerCase().endsWith(".png"))
      .sort((a, b) => {
        const getNum = n => parseInt(n.match(/(\d+)/)?.[1] || "0");
        return getNum(a) - getNum(b);
      });

    console.log(`[convert] PNG files:`, pngFiles);

    if (pngFiles.length === 0) {
      throw new Error("No PNG slides generated.");
    }

    const slides = pngFiles.map((file, i) => {
      const b64 = fs.readFileSync(path.join(tmpDir, file)).toString("base64");
      return {
        id:       `slide_${Date.now()}_${i}`,
        index:    i,
        title:    `Slide ${i + 1}`,
        imageUrl: `data:image/png;base64,${b64}`,
        notes:    "",
        bodyText: "",
      };
    });

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
