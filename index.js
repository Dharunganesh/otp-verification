require("regenerator-runtime/runtime");

const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const cors = require("cors");
const { createCanvas, registerFont } = require("canvas");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ✅ UPDATED CORS CONFIG (only change)
const allowedOrigins = [
  "https://www.ranipetpledge.in",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

// ✅ FIX: Required for deployment (Render)
process.env.FONTCONFIG_PATH = "/etc/fonts";

// ✅ FIX: Use resolve + proper registration
registerFont(
  path.resolve(__dirname, "fonts", "NotoSansTamil-VariableFont_wdth,wght.ttf"),
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

if (!supabase) {
  console.warn(
    "Supabase client is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
}

// Health route
app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

// Detect Tamil
function containsTamil(text) {
  return /[\u0B80-\u0BFF]/.test(text);
}

async function generateCertificatePdf(name) {
  const cleanName = name.trim();

  const templatePath = path.join(__dirname, "template", "certificate.pdf");
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
  const baseY = height * 0.455;
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
    const measureCanvas = createCanvas(2000, 400);
    const measureCtx = measureCanvas.getContext("2d");

    let fontSize = 48;
    let measuredWidth = 0;
    let measuredHeight = 0;

    while (fontSize > 18) {
      measureCtx.font = `${fontSize}px "TamilFont"`;
      const metrics = measureCtx.measureText(cleanName);
      measuredWidth = metrics.width;

      const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
      const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
      measuredHeight = ascent + descent;

      if (measuredWidth <= lineWidth && measuredHeight <= maxHeight) break;
      fontSize -= 1;
    }

    const paddingX = 30;
    const paddingY = 20;
    const canvasWidth = Math.ceil(measuredWidth + paddingX * 2);
    const canvasHeight = Math.ceil(measuredHeight + paddingY * 2);

    const textCanvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = textCanvas.getContext("2d");
    ctx.fillStyle = "#1c353c";
    ctx.font = `${fontSize}px "TamilFont"`;

    const finalMetrics = ctx.measureText(cleanName);
    const finalAscent = finalMetrics.actualBoundingBoxAscent || fontSize * 0.8;
    const finalDescent = finalMetrics.actualBoundingBoxDescent || fontSize * 0.2;
    ctx.fillText(cleanName, paddingX, paddingY + finalAscent);

    const pngBuffer = textCanvas.toBuffer("image/png");
    const pngImage = await pdfDoc.embedPng(pngBuffer);

    let scaleFactor;
    if (finalMetrics.width < lineWidth * 0.6) {
      scaleFactor = (lineWidth * 0.75) / finalMetrics.width;
    } else if (finalMetrics.width < lineWidth * 0.9) {
      scaleFactor = (lineWidth * 0.7) / finalMetrics.width;
    } else {
      scaleFactor = (lineWidth * 0.62) / finalMetrics.width;
    }

    const imageWidth = finalMetrics.width * scaleFactor;
    const imageHeight = (finalAscent + finalDescent) * scaleFactor;

    page.drawImage(pngImage, {
      x: lineStartX + (lineWidth - imageWidth) / 2 + xOffset,
      y: baseY - imageHeight * 0.5,
      width: imageWidth,
      height: imageHeight,
    });
  } else {
    let fontSize = 36;
    let textWidth = engFont.widthOfTextAtSize(cleanName, fontSize);
    let textHeight = engFont.heightAtSize(fontSize);

    while ((textWidth > lineWidth || textHeight > maxHeight) && fontSize > 18) {
      fontSize -= 1;
      textWidth = engFont.widthOfTextAtSize(cleanName, fontSize);
      textHeight = engFont.heightAtSize(fontSize);
    }

    page.drawText(cleanName, {
      x: lineStartX + (lineWidth - textWidth) / 2 + xOffset,
      y: baseY - textHeight * 0.2,
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

  const pdfBuffer = await generateCertificatePdf(name);
  const safeName = name.trim().replace(/[^\w\u0B80-\u0BFF]+/g, "_").slice(0, 60);
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

  const { data: publicData } = supabase.storage
    .from(storageBucket)
    .getPublicUrl(filePath);

  const publicUrl = publicData?.publicUrl;
  if (!publicUrl) {
    throw new Error("Failed to build public URL");
  }

  const { error: dbError } = await supabase.from(certificateTable).insert({
    name: name.trim(),
    file: publicUrl,
  });

  if (dbError) {
    throw new Error(`Mapping insert failed: ${dbError.message}`);
  }
}

const jobQueue = [];
const queueConcurrency = Number(process.env.PLEDGE_WORKERS) || Math.max(2, Math.min(8, os.cpus().length));
let activeWorkers = 0;

function runQueue() {
  while (activeWorkers < queueConcurrency && jobQueue.length > 0) {
    const job = jobQueue.shift();
    activeWorkers += 1;

    Promise.resolve()
      .then(() => processPledgeJob(job))
      .catch((error) => {
        console.error("Background pledge job failed:", {
          name: job.name,
          error: error.message,
        });
      })
      .finally(() => {
        activeWorkers -= 1;
        setImmediate(runQueue);
      });
  }
}

app.post("/pledge", (req, res) => {
  const { name } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  jobQueue.push({ name: name.trim() });
  setImmediate(runQueue);

  return res.status(202).json({
    success: true,
    message: "Pledge received. Certificate generation started in background.",
  });
});

app.post("/generate-certificate", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const pdfBuffer = await generateCertificatePdf(name);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="certificate.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating certificate:", error);
    res.status(500).json({
      error: "Failed to generate certificate",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
