require("regenerator-runtime/runtime");

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { pledgeQueue } = require("./queue/pledgeQueue");
const { generateCertificatePdf } = require("./services/certificateService");

const app = express();

const allowedOrigins = ["https://www.ranipetpledge.in", process.env.FRONTEND_URL].filter(
  Boolean
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json({ limit: "256kb" }));

app.get("/", (req, res) => {
  res.send("Backend is running ✅");
});

app.post("/pledge", async (req, res) => {
  try {
    const { name, phone_number: phoneNumber, dedupeKey } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }

    const cleanName = name.trim();
    const normalizedPhone = phoneNumber ? String(phoneNumber).trim() : "";

    const stableIdSource = dedupeKey || normalizedPhone;
    const jobId = stableIdSource
      ? `pledge:${crypto.createHash("sha256").update(stableIdSource).digest("hex")}`
      : `pledge:${crypto.randomUUID()}`;

    await pledgeQueue.add(
      "generate-certificate",
      { name: cleanName },
      {
        jobId,
      }
    );

    return res.status(202).json({
      success: true,
      message: "Pledge accepted for background processing.",
      jobId,
    });
  } catch (error) {
    const duplicateJobError =
      error?.message?.includes("Job is already waiting") ||
      error?.message?.includes("JobId");

    if (duplicateJobError) {
      return res.status(202).json({
        success: true,
        message: "Pledge already queued.",
      });
    }

    console.error("Failed to enqueue pledge job:", error.message);
    return res.status(500).json({
      error: "Failed to accept pledge request",
      details: error.message,
    });
  }
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
    console.error("Error generating certificate:", error.message);
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
