const express = require("express");
const prisma = require("../db/PrismaClient");
const redis = require("../redis/redisClient");
const KEYS = require("../redis/redisKeys");
const { getBatchStatus, getSingleStatus } = require("../Judge0Config/client");

const languageOptions = {
  54: "C++ (GCC 9.2.0)",
  62: "Java (OpenJDK 13.0.1)",
  71: "Python (3.8.1)",
};

const router = express.Router();

// Judge0 status_id reference:
//  1 = In Queue   2 = Processing
//  3 = Accepted   4 = Wrong Answer   5 = TLE   6 = Compilation Error
//  7 = Runtime Error (SIGSEGV)  11 = Runtime Error (other)
//  12 = Exec Format Error
const isDone = (statusId) => statusId >= 3;

const normalizeOutput = (value) => {
  if (value == null) return "";
  // Normalize line endings
  let s = value.replace(/\r\n/g, "\n");
  // rstrip each line (remove trailing spaces/tabs)
  const lines = s.split("\n").map((l) => l.replace(/[ \t]+$/g, ""));
  // remove trailing blank lines
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n").trim();
};

// ─────────────────────────────────────────────────────────────────
// SUBMIT POLL
// GET /api/poll/submit/:submissionId
// ─────────────────────────────────────────────────────────────────
const PollSubmission = async (req, res) => {
  const { submissionId } = req.params;

  try {
    // 1. Already computed? Serve from cache
    const resultCache = await redis.get(KEYS.subResult(submissionId));
    if (resultCache) return res.json(JSON.parse(resultCache));

    // 2. Dedup lock — SET key "1" EX 4 NX (only if not exists)
    const lock = await redis.set(
      KEYS.pollLock(submissionId),
      "1",
      "EX",
      KEYS.POLL_LOCK_TTL,
      "NX",
    );
    if (!lock) return res.json({ status: "pending" });

    // 3. Load tokens + meta from Redis
    const raw = await redis.get(KEYS.subTokens(submissionId));
    if (!raw)
      return res.status(404).json({
        status: "expired",
        message: "Submission expired or not found",
      });

    const { tokens, problemId, uid, ContestId, Code, languageId } =
      JSON.parse(raw);

    // 4. One batch call for all tokens — single HTTP request regardless of testcase count
    const submissions = await getBatchStatus(tokens);

    // 5. If any submission is still running, return pending immediately
    const allDone = submissions.every((s) => isDone(s.status.id));
    if (!allDone) return res.json({ status: "pending" });

    // 6. Load expected outputs from Redis (already cached from /submit)
    const tcRaw = await redis.get(KEYS.testcases(problemId));
    if (!tcRaw)
      throw new Error("Testcase cache expired — this shouldn't happen");
    const testcases = JSON.parse(tcRaw);

    // 7. Compare Judge0 stdout vs expected — your backend owns this logic
    let passed = 0;
    let passedNonPublic = 0;
    let firstError = null;

    // count non-public testcases (public testcases do not affect scoring)
    const nonPublicCount = testcases.filter((t) => !t.isPublic).length;

    // fetch problem to read MaxScore
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
    });
    const maxScore = problem?.MaxScore || 100;

    const results = submissions.map((sub, i) => {
      const stdout = normalizeOutput(sub.stdout);
      const expected = normalizeOutput(testcases[i]?.output);
      const ranSuccessfully = sub.status.id === 3;
      const isAC = ranSuccessfully && stdout === expected;
      const testcaseStatus = isAC
        ? "Accepted"
        : ranSuccessfully
          ? "Wrong Answer"
          : sub.status.description;

      if (isAC) passed++;
      if (isAC && !testcases[i]?.isPublic) passedNonPublic++;
      if (!firstError && !isAC) {
        firstError = {
          testcase: i + 1,
          status: testcaseStatus,
          compile_output: sub.compile_output || null,
          stderr: sub.stderr || null,
        };
      }

      return {
        testcase: i + 1,
        pass: isAC,
        status: testcaseStatus,
        judge0Status: sub.status.description,
        time: sub.time, // seconds
        memory: sub.memory, // KB
        // only expose stdout/expected on failure — don't leak answers
        ...(isAC
          ? {}
          : {
              stdout,
              expected,
              stderr: sub.stderr || null,
              compile_output: sub.compile_output || null,
            }),
      };
    });

    // Determine final verdict: require all testcases (including public) to pass for acceptance
    const allPassed = passed === testcases.length;
    const computedScore =
      nonPublicCount > 0
        ? Math.round((passedNonPublic / nonPublicCount) * maxScore)
        : 0;
    const verdict = {
      status: allPassed ? "accepted" : "wrong_answer",
      passed: passed, // total passed count (including public)
      passedNonPublic,
      total: nonPublicCount,
      score: computedScore,
      maxScore,
      firstError, // null if no errors, otherwise TLE/CE/RE info
      results,
    };

    // 8. Persist verdict only if it's better than stored score (+ cache + cleanup)
    const stored = await prisma.submission.findUnique({
      where: { id: submissionId },
    });
    const prevScore = stored ? stored.score || 0 : 0;

    if (computedScore > prevScore) {
      // prefer latest Code/language from redis meta (the just-submitted attempt)
      const language = languageId
        ? languageOptions && languageOptions[languageId]
        : undefined;
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          verdict: verdict.status,
          passedCount: passed,
          totalCount: nonPublicCount,
          contestId: ContestId || undefined,
          score: computedScore,
          submittedAt: new Date(),
          code: Code || (stored && stored.code) || undefined,
          language: language || (stored && stored.language) || undefined,
        },
      });
    } else {
      // Do not overwrite stored best result; keep previous record unchanged
      // Optionally, we still record that this attempt happened in cache only
      console.log(
        `Not updating submission ${submissionId}: computedScore (${computedScore}) <= prevScore (${prevScore})`,
      );
    }

    await Promise.all([
      redis.set(
        KEYS.subResult(submissionId),
        JSON.stringify(verdict),
        "EX",
        KEYS.SUB_RESULT_TTL,
      ),
      redis.del(KEYS.subTokens(submissionId)),
    ]);

    return res.json(verdict);
  } catch (err) {
    console.error("[/poll/submit]", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// RUN POLL
// GET /api/poll/run/:runId
// ─────────────────────────────────────────────────────────────────
const PollRun = async (req, res) => {
  const { runId } = req.params;

  try {
    const raw = await redis.get(KEYS.runResult(runId));
    console.log(`Polling runId ${runId}, cache ${raw ? "hit" : "miss"}`);
    if (!raw) return res.status(404).json({ status: "expired" });

    const data = JSON.parse(raw);

    // already resolved on a previous poll — serve cached
    if (data.status !== "pending") return res.json(data);

    // fetch from Judge0
    const sub = await getSingleStatus(data.token);

    if (!isDone(sub.status.id)) return res.json({ status: "pending" });

    const result = {
      status: sub.status.description,
      status_id: sub.status.id,
      stdout: normalizeOutput(sub.stdout),
      stderr: sub.stderr || "",
      compile_output: normalizeOutput(sub.compile_output),
      time: sub.time,
      memory: sub.memory,
    };

    // If the original run included an expected output, evaluate it here
    // expected stored at redis key when /run was submitted (null for custom stdin)
    const expectedRaw = data.expected;
    if (expectedRaw != null && expectedRaw !== "") {
      const expectedNorm = normalizeOutput(expectedRaw);
      const stdoutNorm = normalizeOutput(sub.stdout);
      console.log(
        `[poll/run] runId=${runId} expected=${JSON.stringify(expectedNorm)} stdout=${JSON.stringify(stdoutNorm)}`,
      );
      const ranSuccessfully = sub.status.id === 3;
      const isAC = ranSuccessfully && stdoutNorm === expectedNorm;

      // attach verdict information for frontend convenience
      result.verdict = isAC
        ? "accepted"
        : ranSuccessfully
          ? "wrong_answer"
          : "runtime_error";
      result.passed = isAC;
      result.expected = expectedNorm;
      // only expose stdout/expected on failure — keep parity with submit poll
      if (!isAC) result.stdout = stdoutNorm;
    } else {
      // no expected provided (custom stdin) — report executed status only
      result.message = "Successfully executed";
    }

    // KEEPTTL — preserve the 60s TTL set at /run time
    await redis.set(KEYS.runResult(runId), JSON.stringify(result), "KEEPTTL");

    return res.json(result);
  } catch (err) {
    console.error("[/poll/run]", err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = { PollSubmission, PollRun };
