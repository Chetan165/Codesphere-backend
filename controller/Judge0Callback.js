const express = require("express");
const router = express.Router();
const redis = require("../redis/redisClient");
const KEYS = require("../redis/redisKeys");
const { evaluationQueue } = require("../queue/queues.js");

const decodeBase64 = (value) => {
  if (!value) return "";
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch (e) {
    return value;
  }
};

const normalizeOutputOptimized = (value) => {
  if (value == null) return "";
  let s = String(value).replace(/\r\n/g, "\n");
  const lines = s.split("\n").map((l) => l.replace(/[ \t]+$/g, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n").trim();
};

const Judge0Callback = async (req, res) => {
  try {
    const { token, status, stdout, stderr, compile_output, time, memory } =
      req.body;

    if (!token) return res.status(400).send("Missing token.");
    if (status && status.id < 3)
      return res.status(200).send("Ignored intermediate status.");

    const mappingKey = `token:map:${token}`;
    const metaRaw = await redis.get(mappingKey);
    if (!metaRaw) return res.status(200).send("Metadata expired.");

    const { submissionId, index, isRun } = JSON.parse(metaRaw);

    if (isRun) {
      const cleanStdout = normalizeOutputOptimized(decodeBase64(stdout));
      const cleanStderr = decodeBase64(stderr);
      const cleanCompile = normalizeOutputOptimized(
        decodeBase64(compile_output),
      );

      const subTokensRaw = await redis.get(KEYS.subTokens(submissionId));
      let expectedNorm = "";
      let hasExpected = false;

      if (subTokensRaw) {
        const { expected } = JSON.parse(subTokensRaw);
        if (expected) {
          hasExpected = true;
          expectedNorm = normalizeOutputOptimized(expected);
        }
      }

      const isAC = status.id === 3 && cleanStdout === expectedNorm;

      const result = {
        status: status.description,
        status_id: status.id,
        stdout: cleanStdout,
        stderr: cleanStderr,
        compile_output: cleanCompile,
        time,
        memory,
        verdict: hasExpected
          ? isAC
            ? "Accepted"
            : "Wrong Answer"
          : "Executed",
        passed: isAC,
      };

      await redis.set(KEYS.runResult(submissionId), JSON.stringify(result), {
        EX: 60,
      });
      return res.status(200).send("Run processed.");
    }

    const singleResultKey = `sub:${submissionId}:tc:${index}`;
    await redis.set(
      singleResultKey,
      JSON.stringify({ status, stdout, stderr, compile_output, time, memory }),
      { EX: 60 },
    );

    const subTokensRaw = await redis.get(KEYS.subTokens(submissionId));
    if (!subTokensRaw)
      return res
        .status(200)
        .send("Global token tracker structure has expired.");

    const { totalCount } = JSON.parse(subTokensRaw);
    const processedSetKey = `sub:${submissionId}:processed_set`;
    await redis.sAdd(processedSetKey, String(index));
    await redis.expire(processedSetKey, 300);

    const completedCount = await redis.sCard(processedSetKey);

    if (Number(completedCount) === Number(totalCount)) {
      const queueLockKey = `sub:${submissionId}:queue_lock`;
      const isFirstToTrigger = await redis.set(queueLockKey, "1", {
        NX: true,
        EX: 300,
      });

      if (isFirstToTrigger) {
        await evaluationQueue.add(
          `evaluate:${submissionId}`,
          { submissionId },
          { jobId: submissionId },
        );
      }
    }
    return res.status(200).send("Webhook event received.");
  } catch (err) {
    console.error("[Judge0 Callback Error]:", err.message);
    return res.status(500).send("Pipeline failure.");
  }
};

module.exports = { Judge0Callback };
