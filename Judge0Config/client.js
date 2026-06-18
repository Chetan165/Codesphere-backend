// Judge0Config/client.js
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
 * submitBatchStringOptimized
 * Streams a raw pre-serialized string payload directly to Judge0.
 */
async function submitBatchStringOptimized(payloadString) {
  // Configured with base64_encoded=false as requested
  const url = `${BASE}/submissions/batch?${B64_FALSE}&wait=false`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...getHeaders(),
      "Content-Type": "application/json",
    },
    body: payloadString,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge0 batch string submit failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.map((t) => t.token); // Returns string[] of execution tokens
}

async function submitBatch(sourceCode, languageId, testcases) {
  const limits = getLimits(languageId);
  const submissions = testcases.map((tc) => ({
    source_code: sourceCode,
    language_id: languageId,
    stdin: tc.input ?? "",
    ...limits,
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
  return data.map((t) => t.token);
}

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

async function submitSingle(
  sourceCode,
  languageId,
  stdin = "",
  callback_url = null,
) {
  const limits = getLimits(languageId);
  const body = {
    source_code: sourceCode,
    language_id: languageId,
    stdin,
    ...limits,
  };

  // Only add callback_url if it's provided
  if (callback_url) body.callback_url = callback_url;

  const res = await fetch(`${BASE_RUN}/submissions?${B64_FALSE}&wait=false`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge0 single submit failed: ${res.status} ${text}`);
  }

  const { token } = await res.json();
  return token;
}

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

module.exports = {
  submitBatch,
  getBatchStatus,
  submitSingle,
  getSingleStatus,
  submitBatchStringOptimized,
};
