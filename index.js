const express = require("express");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const cors = require("cors");

const app = express();

// Middleware
app.use(express.json());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
  })
);

// Health check
app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

// Generate certificate
app.post("/generate-certificate", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    // ✅ FIXED PATHS (Render safe)
    const templatePath = path.resolve("template/certificate.pdf");
    const fontPath = path.resolve("fonts/LibreBaskerville-VariableFont_wght.ttf");

    // ✅ DEBUG LOGS (VERY IMPORTANT)
    console.log("Template path:", templatePath);
    console.log("Font path:", fontPath);
    console.log("Template exists:", fs.existsSync(templatePath));
    console.log("Font exists:", fs.existsSync(fontPath));

    // Load template
    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);

    pdfDoc.registerFontkit(fontkit);

    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    // Load font
    const fontBytes = fs.readFileSync(fontPath);
    const font = await pdfDoc.embedFont(fontBytes);

    // Layout calculations
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
      fontSize -= 1;
      textWidth = font.widthOfTextAtSize(name, fontSize);
      textHeight = font.heightAtSize(fontSize);
    }

    const xOffset = 10;
    const x = lineStartX + (lineWidth - textWidth) / 2 + xOffset;

    const baseY = height * 0.455;
    const y = baseY - textHeight * 0.2;

    const textColor = rgb(0.11, 0.21, 0.24);

    // Draw name
    page.drawText(name.trim(), {
      x,
      y,
      size: fontSize,
      font,
      color: textColor,
    });

    const pdfBytes = await pdfDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="certificate.pdf"'
    );

    res.send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error("🔥 FULL ERROR:", error);
    res.status(500).json({ error: "Failed to generate certificate" });
  }
});

// PORT
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
