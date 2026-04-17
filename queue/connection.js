const IORedis = require("ioredis");

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL is required");
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

connection.on("error", (error) => {
  console.error("Redis connection error:", error.message);
});

module.exports = { connection };
