const IORedis = require("ioredis");

const redisUrl = process.env.REDIS_URL;

/** When unset, the API processes pledges inline; BullMQ worker is not used. */
const queueEnabled = Boolean(redisUrl);

let connection = null;

if (redisUrl) {
  connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  connection.on("error", (error) => {
    console.error("Redis connection error:", error.message);
  });
}

module.exports = { connection, queueEnabled };
