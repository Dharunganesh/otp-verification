require("regenerator-runtime/runtime");

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { createCanvas, registerFont } = require("canvas");
const { createClient } = require("@supabase/supabase-js");

process.env.FONTCONFIG_PATH = "/etc/fonts";

registerFont(
  path.resolve(__dirname, "..", "fonts", "NotoSansTamil-VariableFont_wdth,wght.ttf"),
  { family: "TamilFont" }
);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "certificates";
const certificateTable = process.env.SUPABASE_CERTIFICATE_TABLE || "certificate_files";

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

function containsTamil(text) {
  return /[\u0B80-\u0BFF]/.test(text);
}

function getTamilFontSize(text, maxWidth, ctx) {
  const len = text.trim().length;
  let fontSize;

  if (len <= 3) {
    fontSize = 60;
  } else if (len <= 6) {
    fontSize = 46;
  } else if (len <= 10) {
    fontSize = 40;
  } else if (len <= 16) {
    fontSize = 34;
  } else {
    fontSize = 28;
  }

  while (fontSize > 20) {
    ctx.font = `${fontSize}px "TamilFont"`;
    const metrics = ctx.measureText(text);

    const width = metrics.width;
    const height =
      (metrics.actualBoundingBoxAscent || fontSize * 0.8) +
      (metrics.actualBoundingBoxDescent || fontSize * 0.2);

    if (width <= maxWidth * 0.84 && height <= 30) {
      break;
    }

    fontSize -= 2;
  }

  return fontSize;
}

function getEnglishFontSize(text, maxWidth, font) {
  const nameLength = text.trim().length;
  let fontSize;

  if (nameLength <= 6) {
    fontSize = 26;
  } else if (nameLength <= 10) {
    fontSize = 28;
  } else if (nameLength <= 16) {
    fontSize = 30;
  } else {
    fontSize = 18;
  }

  while (fontSize > 18) {
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    if (textWidth <= maxWidth * 0.88 && textHeight <= 60) {
      break;
    }

    fontSize -= 1;
  }

  return fontSize;
}

async function generateCertificatePdf(name) {
  const cleanName = name.trim();
  const templatePath = path.join(__dirname, "..", "template", "certificate.pdf");
  if (!fs.existsSync(templatePath)) {
    throw new Error("Template file not found");
  }

  const existingPdfBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  pdfDoc.registerFontkit(fontkit);

  const page = pdfDoc.getPages()[0];
  const { width, height } = page.getSize();

  const engFontPath = path.join(
    __dirname,
    "..",
    "fonts",
    "LibreBaskerville-VariableFont_wght.ttf"
  );
  if (!fs.existsSync(engFontPath)) {
    throw new Error("English font file not found");
  }

  const engFontBytes = fs.readFileSync(engFontPath);
  const engFont = await pdfDoc.embedFont(engFontBytes);
  const collectorFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const lineStartX = width * 0.3;
  const lineEndX = width * 0.78;
  const lineWidth = lineEndX - lineStartX;
  const maxHeight = height * 0.06;
  const xOffset = 10;
  const baseY = height * 0.46;
  const textColor = rgb(0.11, 0.21, 0.24);

  const collectorText = "Dr.J. U. Chandrakala, I.A.S.";
  const collectorFontSize = 18;
  const collectorWidth = collectorFont.widthOfTextAtSize(
    collectorText,
    collectorFontSize
  );

  page.drawText(collectorText, {
    x: width * 0.7 - collectorWidth / 2,
    y: height * 0.14,
    size: collectorFontSize,
    font: collectorFont,
    color: rgb(0.2, 0.25, 0.27),
  });

  if (containsTamil(cleanName)) {
    const measureCanvas = createCanvas(2500, 500);
    const measureCtx = measureCanvas.getContext("2d");

    let fontSize = getTamilFontSize(cleanName, lineWidth, measureCtx);
    measureCtx.font = `${fontSize}px "TamilFont"`;
    let measureMetrics = measureCtx.measureText(cleanName);
    let measuredWidth = measureMetrics.width;
    let measuredHeight =
      (measureMetrics.actualBoundingBoxAscent || fontSize * 0.8) +
      (measureMetrics.actualBoundingBoxDescent || fontSize * 0.2);

    while (
      (measuredWidth > lineWidth * 0.84 || measuredHeight > maxHeight * 0.72) &&
      fontSize > 20
    ) {
      fontSize -= 2;
      measureCtx.font = `${fontSize}px "TamilFont"`;
      measureMetrics = measureCtx.measureText(cleanName);
      measuredWidth = measureMetrics.width;
      measuredHeight =
        (measureMetrics.actualBoundingBoxAscent || fontSize * 0.8) +
        (measureMetrics.actualBoundingBoxDescent || fontSize * 0.2);
    }

    const paddingX = 30;
    const paddingY = 8;
    const canvasWidth = Math.ceil(measuredWidth + paddingX * 2);
    const canvasHeight = Math.ceil(measuredHeight + paddingY * 2);

    const textCanvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = textCanvas.getContext("2d");
    ctx.fillStyle = "#1c353c";
    ctx.font = `${fontSize}px "TamilFont"`;
    ctx.textBaseline = "alphabetic";

    const finalMetrics = ctx.measureText(cleanName);
    const finalAscent = finalMetrics.actualBoundingBoxAscent || fontSize * 0.8;
    const finalDescent = finalMetrics.actualBoundingBoxDescent || fontSize * 0.2;
    ctx.fillText(cleanName, paddingX, paddingY + finalAscent);

    const pngBuffer = textCanvas.toBuffer("image/png");
    const pngImage = await pdfDoc.embedPng(pngBuffer);

    const rawWidth = finalMetrics.width;
    const rawHeight = finalAscent + finalDescent;

    let scaleFactor;
    let maxAllowedHeight;

    if (cleanName.trim().length <= 3) {
      scaleFactor = Math.min((lineWidth * 0.92) / rawWidth, 1.18);
      maxAllowedHeight = maxHeight * 0.92;
    } else {
      scaleFactor = Math.min((lineWidth * 0.82) / rawWidth, 1);
      maxAllowedHeight = maxHeight * 0.72;
    }

    let imageHeight = rawHeight * scaleFactor;
    if (imageHeight > maxAllowedHeight) {
      scaleFactor = maxAllowedHeight / rawHeight;
      imageHeight = maxAllowedHeight;
    }
    const imageWidth = rawWidth * scaleFactor;

    const tamilYOffset = -8;
    const baselineAdjust = imageHeight * 0.4;
    const y = baseY - baselineAdjust + tamilYOffset;

    page.drawImage(pngImage, {
      x: lineStartX + (lineWidth - imageWidth) / 2 + xOffset,
      y,
      width: imageWidth,
      height: imageHeight,
    });
  } else {
    let fontSize = getEnglishFontSize(cleanName, lineWidth, engFont);
    let textWidth = engFont.widthOfTextAtSize(cleanName, fontSize);
    let textHeight = engFont.heightAtSize(fontSize);

    while ((textWidth > lineWidth || textHeight > maxHeight) && fontSize > 18) {
      fontSize -= 1;
      textWidth = engFont.widthOfTextAtSize(cleanName, fontSize);
      textHeight = engFont.heightAtSize(fontSize);
    }

    const englishYOffset = 2;
    const baselineAdjust = textHeight * 0.3;
    const y = baseY - baselineAdjust + englishYOffset;

    page.drawText(cleanName, {
      x: lineStartX + (lineWidth - textWidth) / 2 + xOffset,
      y,
      size: fontSize,
      font: engFont,
      color: textColor,
    });
  }

  return Buffer.from(await pdfDoc.save());
}

async function processPledgeJob({ name }) {
  if (!supabase) {
    throw new Error("Supabase is not configured on backend");
  }

  const cleanName = name.trim();
  const pdfBuffer = await generateCertificatePdf(cleanName);
  const safeName = cleanName.replace(/[^\w\u0B80-\u0BFF]+/g, "_").slice(0, 60);
  const filePath = `pledges/${Date.now()}-${crypto.randomUUID()}-${safeName}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(storageBucket)
    .upload(filePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: publicData } = supabase.storage.from(storageBucket).getPublicUrl(filePath);
  const publicUrl = publicData?.publicUrl;
  if (!publicUrl) {
    throw new Error("Failed to build public URL");
  }

  const { error: dbError } = await supabase.from(certificateTable).insert({
    name: cleanName,
    file: publicUrl,
  });

  if (dbError) {
    throw new Error(`Mapping insert failed: ${dbError.message}`);
  }

  return { publicUrl };
}

module.exports = { generateCertificatePdf, processPledgeJob };
