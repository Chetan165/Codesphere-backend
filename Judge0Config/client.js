const { JUDGE0_CONFIG, getLimits, getHeaders } = require("./config");

const BASE = JUDGE0_CONFIG.baseUrl;
const BASE_RUN = JUDGE0_CONFIG.baseUrlRun;
const B64_FALSE = "base64_encoded=false";
const B64_TRUE = "base64_encoded=true";

function decodeBase64(value) {
  if (value == null) return value;
  return Buffer.from(value, "base64").toString("utf8");
}

function decodeJudge0Submission(submission) {
  if (!submission) return submission;

  return {
    ...submission,
    stdout: decodeBase64(submission.stdout),
    stderr: decodeBase64(submission.stderr),
    compile_output: decodeBase64(submission.compile_output),
  };
}

/**
 * submitBatch
 * Sends multiple submissions at once (one per testcase).
 * Returns array of { token } objects from Judge0.
 *
 * @param {string}   sourceCode
 * @param {number}   languageId
 * @param {Array}    testcases   — [{ input }]  (NO expected_output)
 * @returns {string[]}           — Judge0 tokens
 */
async function submitBatch(sourceCode, languageId, testcases) {
  const limits = getLimits(languageId);

  const submissions = testcases.map((tc) => ({
    source_code: sourceCode,
    language_id: languageId,
    stdin: tc.input ?? "",
    // ← expected_output deliberately omitted — we compare in backend
    cpu_time_limit: limits.cpu_time_limit,
    wall_time_limit: limits.wall_time_limit,
    memory_limit: limits.memory_limit,
    stack_limit: limits.stack_limit,
    max_processes: limits.max_processes,
    max_file_size: limits.max_file_size,
    enable_network: limits.enable_network,
  }));

  const res = await fetch(`${BASE}/submissions/batch?${B64_FALSE}&wait=false`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ submissions }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge0 batch submit failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.map((t) => t.token); // string[]
}

/**
 * getBatchStatus
 * Polls Judge0 for the current status of multiple tokens in one request.
 * Returns Judge0's submissions array with status, stdout, stderr, time, memory.
 *
 * @param {string[]} tokens
 * @returns {object[]}
 */
async function getBatchStatus(tokens) {
  const res = await fetch(
    `${BASE}/submissions/batch?tokens=${tokens.join(",")}&${B64_TRUE}&fields=token,status,stdout,stderr,time,memory,compile_output`,
    { headers: getHeaders() },
  );

  if (!res.ok) {
    throw new Error(`Judge0 batch status failed: ${res.status}`);
  }

  const { submissions } = await res.json();
  return submissions.map(decodeJudge0Submission);
}

/**
 * submitSingle
 * Sends one submission for /run — no testcases, optional custom stdin.
 * Returns a single Judge0 token string.
 *
 * @param {string} sourceCode
 * @param {number} languageId
 * @param {string} stdin       — custom input from user (optional)
 * @returns {string}           — Judge0 token
 */
async function submitSingle(sourceCode, languageId, stdin = "") {
  const limits = getLimits(languageId);

  const res = await fetch(`${BASE_RUN}/submissions?${B64_FALSE}&wait=false`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      source_code: sourceCode,
      language_id: languageId,
      stdin,
      cpu_time_limit: limits.cpu_time_limit,
      wall_time_limit: limits.wall_time_limit,
      memory_limit: limits.memory_limit,
      stack_limit: limits.stack_limit,
      max_processes: limits.max_processes,
      max_file_size: limits.max_file_size,
      enable_network: limits.enable_network,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge0 single submit failed: ${res.status} ${text}`);
  }

  const { token } = await res.json();
  return token;
}

/**
 * getSingleStatus
 * Gets the result of a single /run token.
 *
 * @param {string} token
 * @returns {object}
 */
async function getSingleStatus(token) {
  const res = await fetch(
    `${BASE_RUN}/submissions/${token}?${B64_TRUE}&fields=status,stdout,stderr,time,memory,compile_output`,
    { headers: getHeaders() },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge0 status fetch failed: ${res.status} ${text}`);
  }

  return decodeJudge0Submission(await res.json());
}

module.exports = { submitBatch, getBatchStatus, submitSingle, getSingleStatus };
