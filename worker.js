require("regenerator-runtime/runtime");

const { Worker } = require("bullmq");
const { connection } = require("./queue/connection");
const { pledgeQueueName } = require("./queue/pledgeQueue");
const { processPledgeJob } = require("./services/certificateService");

const workerConcurrency = Number(process.env.PLEDGE_WORKER_CONCURRENCY) || 4;

const worker = new Worker(
  pledgeQueueName,
  async (job) => {
    const { name } = job.data || {};
    if (!name || !name.trim()) {
      throw new Error("Invalid job payload: name is required");
    }

    console.log(`[Worker] Processing job ${job.id} for "${name}"`);
    const result = await processPledgeJob({ name: name.trim() });
    console.log(`[Worker] Completed job ${job.id}: ${result.publicUrl}`);
    return result;
  },
  {
    connection,
    concurrency: workerConcurrency,
    limiter: {
      max: Number(process.env.PLEDGE_WORKER_RATE_MAX) || 60,
      duration: Number(process.env.PLEDGE_WORKER_RATE_DURATION_MS) || 1000,
    },
  }
);

worker.on("failed", (job, error) => {
  console.error(
    `[Worker] Job failed ${job?.id || "unknown"} attempt ${
      job?.attemptsMade || 0
    }: ${error.message}`
  );
});

worker.on("error", (error) => {
  console.error("[Worker] Fatal worker error:", error.message);
});

process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received. Closing worker...");
  await worker.close();
  process.exit(0);
});
