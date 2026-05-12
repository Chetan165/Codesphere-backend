const Redis = require("ioredis");
const APP_CONFIG = require("../config/appConfig");

const redis = new Redis({
  host: APP_CONFIG.REDIS.host,
  port: APP_CONFIG.REDIS.port,
  password: APP_CONFIG.REDIS.password,
  // auto-reconnect — don't let a blip kill your server
  retryStrategy: (times) => Math.min(times * 100, 3000),
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => console.log("[Redis] connected"));
redis.on("error", (err) => console.error("[Redis] error", err.message));

module.exports = redis;
