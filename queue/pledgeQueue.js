const { Queue } = require("bullmq");
const { connection, queueEnabled } = require("./connection");

const pledgeQueueName = "pledge-certificate-queue";

const pledgeQueue = queueEnabled
  ? new Queue(pledgeQueueName, {
      connection,
      defaultJobOptions: {
        attempts: Number(process.env.PLEDGE_JOB_ATTEMPTS) || 5,
        backoff: {
          type: "exponential",
          delay: Number(process.env.PLEDGE_JOB_BACKOFF_MS) || 3000,
        },
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 5000,
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 10000,
        },
      },
    })
  : null;

module.exports = { pledgeQueue, pledgeQueueName, queueEnabled };
