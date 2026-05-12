// ─────────────────────────────────────────────────────────────────
// Judge0 config — all limits and language IDs in one place
// Ref: https://github.com/judge0/judge0/blob/master/docs/api/judge0-api.yaml
// ─────────────────────────────────────────────────────────────────

const JUDGE0_CONFIG = {
  //for submissions with multiple testcases (e.g. /submit)
  baseUrl: require("../config/appConfig").JUDGE0_URL,

  //for single-test runs (e.g. /run) — can be same or different endpoint
  baseUrlRun: require("../config/appConfig").JUDGE0_RUN_URL,

  // set if you enabled AUTHN_HEADER in judge0.conf
  authToken: require("../config/appConfig").JUDGE0_AUTH_TOKEN,

  // base limits applied to every submission
  defaults: {
    cpu_time_limit: 2, // seconds — pure execution CPU time
    wall_time_limit: 10, // seconds — total wall clock (covers compile)
    memory_limit: 128000, // KB  → 128 MB
    stack_limit: 64000, // KB  → 64 MB
    max_processes: 30,
    max_file_size: 65536, // KB  → 64 MB output cap
    enable_network: false, // sandbox: no internet access
    base64_encoded: false,
  },

  // per-language overrides — merged over defaults
  // key = Judge0 language_id (match what your frontend sends)
  languageOverrides: {
    54: {
      // C++ (GCC 9.2.0)
      wall_time_limit: 8, // compile (~1-2s) + run (2s) + buffer
    },
    62: {
      // Java (OpenJDK 13)
      wall_time_limit: 8, // JVM startup adds ~1-2s
      memory_limit: 512000,
      cpu_time_limit: 3,
    },
    71: {
      // Python 3 (3.8.1) — interpreted, no compile overhead
      wall_time_limit: 10,
      cpu_time_limit: 10,
    },
    63: {
      // JavaScript (Node.js 12)
      wall_time_limit: 6,
      cpu_time_limit: 10,
    },
  },
};

/**
 * Returns the merged limits for a given language_id.
 * Falls back to defaults if no override exists.
 */
function getLimits(languageId) {
  const override = JUDGE0_CONFIG.languageOverrides[languageId] || {};
  return { ...JUDGE0_CONFIG.defaults, ...override };
}

/**
 * Returns headers for every Judge0 request.
 * Adds X-Auth-Token only if configured.
 */
function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (JUDGE0_CONFIG.authToken) {
    headers["X-Auth-Token"] = JUDGE0_CONFIG.authToken;
  }
  return headers;
}

module.exports = { JUDGE0_CONFIG, getLimits, getHeaders };
