require("dotenv").config();

const PORT = process.env.PORT || 3000;
const SERVER_BASE = process.env.SERVER_BASE || `http://localhost:${PORT}`;

const FRONTEND_BASE = process.env.FRONTEND_BASE || "http://localhost:5173";
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || `${FRONTEND_BASE}`)
  .split(",")
  .map((s) => s.trim());

const JUDGE0_URL = process.env.JUDGE0_URL || "http://localhost:2358";
const JUDGE0_RUN_URL = process.env.JUDGE0_RUN_URL || JUDGE0_URL;
const JUDGE0_AUTH_TOKEN = process.env.JUDGE0_AUTH_TOKEN || null;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;

const CE_ENGINE_BASE = process.env.CE_ENGINE_BASE || "http://localhost:5000";

const REDIS = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

module.exports = {
  PORT,
  SERVER_BASE,
  FRONTEND_BASE,
  FRONTEND_ORIGINS,
  JUDGE0_URL,
  JUDGE0_RUN_URL,
  JUDGE0_AUTH_TOKEN,
  GEMINI_API_KEY,
  CE_ENGINE_BASE,
  REDIS,
};
