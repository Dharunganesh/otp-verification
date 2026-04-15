const express = require("express");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();

/* ===================== RATE LIMIT ===================== */
const certificateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // max 20 requests per IP per minute
  message: {
    error: "Too many requests. Please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/* ===================== MIDDLEWARE ===================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "OPTIONS"],
  })
);

/* ===================== HEALTH ===================== */
app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

/* ===================== CERTIFICATE ===================== */
app.post("/generate-certificate", certificateLimiter, async (req, res) => {
  try {
    const name = req.body?.name;

    if (!name || name.length > 50) {
      return res.status(400).json({ error: "Invalid name" });
    }

    const basePath = __dirname;

    const templatePath = path.join(basePath, "template", "certificate.pdf");
    const fontPath = path.join(
      basePath,
      "fonts",
      "LibreBaskerville-VariableFont_wght.ttf"
    );

    console.log("Template:", templatePath);
    console.log("Font:", fontPath);

    if (!fs.existsSync(templatePath)) {
      throw new Error("Template PDF not found");
    }

    if (!fs.existsSync(fontPath)) {
      throw new Error("Font file not found");
    }

    // ❗ Still sync (we’ll optimize later if needed)
    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    pdfDoc.registerFontkit(fontkit);

    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    const fontBytes = fs.readFileSync(fontPath);
    const font = await pdfDoc.embedFont(fontBytes);

    const lineStartX = width * 0.30;
    const lineEndX = width * 0.78;
    const lineWidth = lineEndX - lineStartX;

    const maxHeight = height * 0.06;

    let fontSize = 36;
    let textWidth = font.widthOfTextAtSize(name, fontSize);
    let textHeight = font.heightAtSize(fontSize);

    while (
      (textWidth > lineWidth || textHeight > maxHeight) &&
      fontSize > 18
    ) {
      fontSize--;
      textWidth = font.widthOfTextAtSize(name, fontSize);
      textHeight = font.heightAtSize(fontSize);
    }

    const x = lineStartX + (lineWidth - textWidth) / 2 + 10;
    const y = height * 0.455 - textHeight * 0.2;

    page.drawText(name.trim(), {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.11, 0.21, 0.24),
    });

    const pdfBytes = await pdfDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="certificate.pdf"'
    );

    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error("🔥 CERTIFICATE ERROR:", error.message || error);

    return res.status(500).json({
      error: "Failed to generate certificate",
      debug: error.message,
    });
  }
});

/* ===================== START SERVER ===================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
