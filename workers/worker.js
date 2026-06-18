const { Worker } = require("bullmq");
const connection = require("../queue/connection.js");
const redis = require("../redis/redisClient");
const prisma = require("../db/PrismaClient");
const KEYS = require("../redis/redisKeys");
const { getLimits } = require("../Judge0Config/config");
const {
  submitBatchStringOptimized,
  submitSingle,
} = require("../Judge0Config/client");
const dotenv = require("dotenv");
dotenv.config();

const CALLBACK_URL =
  process.env.JUDGE0_CALLBACK_URL ||
  "http://localhost:3000/api/callbacks/judge0";

const worker = new Worker(
  "submission-queue",
  async (job) => {
    const {
      submissionId,
      Code,
      problemId,
      languageId,
      contestKey,
      uid,
      expectedValue,
      stdin,
    } = job.data;

    console.log(`[Worker] Processing submission: ${submissionId}`);

    if (!stdin && !expectedValue) {
      await redis.set(
        KEYS.subResult(submissionId),
        JSON.stringify({ status: "processing", verdict: "pending" }),
        "EX",
        KEYS.SUB_TOKENS_TTL,
      );

      const tcTemplateKey = `problem:${problemId}:json_template`;
      let cachedWrapperRaw = await redis.get(tcTemplateKey);
      let submissionsArrayString;
      let totalCount = 0;

      if (!cachedWrapperRaw) {
        const testcases = await prisma.testCase.findMany({
          where: { problemId },
        });
        if (!testcases.length)
          throw new Error(`No testcases assigned to problem: ${problemId}`);

        totalCount = testcases.length;
        const limits = getLimits(languageId);
        const templateArray = testcases.map((tc) => ({
          source_code: "##CODE_TOKEN##",
          language_id: "##LANG_TOKEN##",
          stdin: tc.input ?? "",
          callback_url: "##CALLBACK_URL_TOKEN##",
          ...limits,
        }));

        submissionsArrayString = JSON.stringify(templateArray);
        await redis.set(
          tcTemplateKey,
          JSON.stringify({ submissionsArrayString, totalCount }),
          "EX",
          KEYS.TESTCASES_TTL,
        );
      } else {
        const parsedWrapper = JSON.parse(cachedWrapperRaw);
        submissionsArrayString = parsedWrapper.submissionsArrayString;
        totalCount = parsedWrapper.totalCount;
      }

      const finalizedArrayBody = submissionsArrayString
        .replaceAll('"##CODE_TOKEN##"', JSON.stringify(Code))
        .replaceAll('"##LANG_TOKEN##"', languageId)
        .replaceAll('"##CALLBACK_URL_TOKEN##"', JSON.stringify(CALLBACK_URL));

      const tokens = await submitBatchStringOptimized(
        `{"submissions":${finalizedArrayBody}}`,
      );

      for (let i = 0; i < tokens.length; i++) {
        await redis.set(
          `token:map:${tokens[i]}`,
          JSON.stringify({ submissionId, index: i }),
          "EX",
          KEYS.SUB_TOKENS_TTL,
        );
      }

      await redis.set(
        KEYS.subTokens(submissionId),
        JSON.stringify({
          tokens,
          problemId,
          submissionId,
          uid,
          contestKey,
          totalCount,
        }),
        "EX",
        KEYS.SUB_TOKENS_TTL,
      );
    } else {
      await redis.set(
        KEYS.runResult(submissionId),
        JSON.stringify({ status: "processing", verdict: "pending" }),
        "EX",
        KEYS.SUB_TOKENS_TTL,
      );

      const token = await submitSingle(
        Code,
        languageId,
        stdin || "",
        CALLBACK_URL,
      );

      await redis.set(
        `token:map:${token}`,
        JSON.stringify({ submissionId, index: 0, isRun: true }),
        "EX",
        KEYS.SUB_TOKENS_TTL,
      );

      await redis.set(
        KEYS.subTokens(submissionId),
        JSON.stringify({
          tokens: [token],
          problemId,
          submissionId,
          uid,
          stdin: stdin || "",
          expected: expectedValue || "",
          contestKey,
          totalCount: 1,
        }),
        "EX",
        KEYS.SUB_TOKENS_TTL,
      );
    }
  },
  { connection },
);

worker.on("completed", (job) =>
  console.log(`[Queue] Job ${job.id} completed.`),
);
worker.on("failed", (job, err) =>
  console.error(`[Queue] Job ${job?.id} failed. Error: ${err.stack}`),
);
