const { Worker } = require("bullmq");
const connection = require("../queue/connection.js");
const redis = require("../redis/redisClient");
const prisma = require("../db/PrismaClient");
const KEYS = require("../redis/redisKeys");

const languageOptions = {
  54: "C++ (GCC 9.2.0)",
  62: "Java (OpenJDK 13.0.1)",
  71: "Python (3.8.1)",
};

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

const worker = new Worker(
  "evaluation-queue",
  async (job) => {
    const { submissionId } = job.data;
    const subTokensKey = KEYS.subTokens(submissionId);
    const rawTokens = await redis.get(subTokensKey);

    if (!rawTokens) {
      throw new Error(
        `Token profile metadata dropped for context ID: ${submissionId}`,
      );
    }

    const data = JSON.parse(rawTokens);
    const { problemId, uid, contestKey, Code, languageId, totalCount, tokens } =
      data;

    const tcKey = KEYS.testcases(problemId);
    const tcRaw = await redis.get(tcKey);
    if (!tcRaw) throw new Error(`Testcase template dropped for: ${problemId}`);

    const testcases = JSON.parse(tcRaw);
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { MaxScore: true },
    });
    const maxScore = problem?.MaxScore || 100;

    let passed = 0,
      passedNonPublic = 0,
      firstError = null;
    const nonPublicCount = testcases.filter((t) => !t.isPublic).length;
    const results = [];

    for (let i = 0; i < totalCount; i++) {
      const tcData = JSON.parse(await redis.get(`sub:${submissionId}:tc:${i}`));
      const expectedTC = testcases[i];
      const stdout = normalizeOutputOptimized(decodeBase64(tcData.stdout));
      const expectedNorm = normalizeOutputOptimized(expectedTC?.output);
      const isAC = tcData.status.id === 3 && stdout === expectedNorm;

      if (isAC) {
        passed++;
        if (!expectedTC?.isPublic) passedNonPublic++;
      } else if (!firstError) {
        firstError = { testcase: i + 1, status: tcData.status.description };
      }

      // Fixed: Appending raw metrics to individual test case logs
      results.push({
        testcase: i + 1,
        pass: isAC,
        status: isAC ? "Accepted" : "Wrong Answer",
        time: tcData.time != null ? tcData.time : "0.000",
        memory: tcData.memory != null ? tcData.memory : 0,
      });
    }

    const allPassed = passed === testcases.length;
    const computedScore =
      nonPublicCount > 0
        ? Math.round((passedNonPublic / nonPublicCount) * maxScore)
        : 0;

    // Fixed: Calculating aggregated execution overhead metrics
    const totalTime = results.reduce(
      (acc, r) => acc + (parseFloat(r.time) || 0),
      0,
    );
    const peakMemory = results.reduce(
      (acc, r) => Math.max(acc, parseInt(r.memory) || 0),
      0,
    );

    const verdict = {
      status: allPassed ? "accepted" : "wrong_answer",
      score: computedScore,
      results,
      time: totalTime.toFixed(3),
      memory: peakMemory,
    };

    const stored = await prisma.submission.findFirst({
      where: { userId: uid, problemId, contestId: contestKey || null },
      select: { id: true, score: true },
    });

    if (
      stored &&
      (computedScore > (stored.score || 0) ||
        (computedScore === 0 && stored.score === 0))
    ) {
      await prisma.submission.update({
        where: { id: stored.id },
        data: {
          verdict: verdict.status,
          score: computedScore,
          submittedAt: new Date(),
        },
      });
    }

    await redis.set(
      KEYS.subResult(submissionId),
      JSON.stringify(verdict),
      "EX",
      KEYS.SUB_RESULT_TTL,
    );
    await redis.del(subTokensKey);
    for (const t of tokens) await redis.del(`token:map:${t}`);
  },
  { connection },
);

worker.on("completed", (job) =>
  console.log(`[Queue] Job ${job.id} completed.`),
);
worker.on("failed", (job, err) =>
  console.error(`[Queue] Job ${job?.id} failed. Error: ${err.stack}`),
);
