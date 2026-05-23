const { createClient } = require("redis");
const APP_CONFIG = require("../config/appConfig");

const redis = createClient({
  socket: {
    host: APP_CONFIG.REDIS.host,
    port: APP_CONFIG.REDIS.port,
  },
  password: APP_CONFIG.REDIS.password,
});

redis.on("connect", () => console.log("[Redis] connected"));
redis.on("ready", () => console.log("[Redis] ready"));
redis.on("error", (err) => console.error("[Redis] error", err.message));

redis.connect().catch((err) => {
  console.error("[Redis] connect error", err.message);
});

module.exports = redis;
