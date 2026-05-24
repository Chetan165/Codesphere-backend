const Prisma = require("../db/PrismaClient.js");
const crypto = require("crypto");
const contestReportService = require("./ContestReportService");

const createContest = async (req, res) => {
  const { SelectedProblems, title, description, startTime, endTime, private } =
    req.body;
  console.log("Create Contest API Called");
  try {
    const contest = await Prisma.Contest.create({
      data: {
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        private,
        problems: {
          connect: SelectedProblems.map((pb) => ({ id: pb.id })),
        },
      },
    });
    res.status(201).json({
      ok: true,
      contestId: contest.id,
      message: "Contest created successfully",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create contest" });
  }
};

const createProblem = async (req, res) => {
  const {
    title,
    statement,
    inputFormat,
    outputFormat,
    constraints,
    sampleInput,
    sampleOutput,
    tags,
    maxMarks,
    explanation,
  } = req.body;
  try {
    const problem = await Prisma.Problem.create({
      data: {
        title,
        statement,
        inputFormat,
        outputFormat,
        constraints,
        sampleInput,
        sampleOutput,
        explanation,
        // store max marks if provided (otherwise Prisma default applies)
        ...(maxMarks != null ? { MaxScore: Number(maxMarks) } : {}),
      },
    });
    res.status(201).json({
      ok: true,
      problemId: problem.id,
      message: "Problem created successfully",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to create problem" });
  }
};

const getAllContests = async (req, res) => {
  const AdminStatus = req.user.admin;
  try {
    let contests;
    if (AdminStatus) {
      contests = await Prisma.contest.findMany({
        include: { problems: true },
      });
    } else {
      contests = await Prisma.contest.findMany({
        where: { private: false },
        include: { problems: true },
      });
    }
    res.json({ contest: contests, ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
};

const getProblems = async (req, res) => {
  try {
    const problems = await Prisma.problem.findMany({
      where: {
        title: {
          contains: req.body.search,
          mode: "insensitive",
        },
      },
    });
    res.json({ ok: true, problems });
  } catch (err) {
    res.json({ ok: false });
  }
};

const getContestChallenges = async (req, res) => {
  try {
    const Contestid = req.body.problemId;
    const FetchedChallenges = await Prisma.contest.findUnique({
      where: { id: Contestid },
      include: { problems: true },
    });
    res.json({
      ok: true,
      collections: FetchedChallenges,
      now: new Date().toISOString(),
    });
  } catch (err) {
    res.json({ ok: false });
  }
};

const deleteContest = async (req, res) => {
  const id = req.params.id;
  try {
    const deleteSubmissions = await Prisma.submission.deleteMany({
      where: { contestId: id },
    });
    const contest = await Prisma.Contest.findUnique({ where: { id } });
    const date_now = new Date();
    if (contest.startTime < date_now) {
      res.json({ ok: false, msg: "Ongoing or Past Contest Cant be deleted" });
    } else {
      await Prisma.Contest.delete({ where: { id } });
      res.json({ ok: true });
    }
  } catch (err) {
    res.json({ ok: false });
  }
};

const getContestTime = async (req, res) => {
  try {
    const time = req.body.startTime;
    const startTime = new Date(time);
    const date = new Date();
    if (date >= startTime) {
      res.json({ ok: true });
    } else res.json({ ok: false });
  } catch (err) {
    res.json({ ok: false });
  }
};

function computeHash(obj) {
  const s = typeof obj === "string" ? obj : JSON.stringify(obj);
  return crypto.createHash("sha1").update(s).digest("hex");
}

const getContestMeta = async (req, res) => {
  try {
    const id = req.params.contestId;
    const contest = await Prisma.contest.findUnique({
      where: { id },
      include: { problems: true },
    });
    if (!contest)
      return res.status(404).json({ ok: false, error: "Not found" });

    const serverNow = new Date();
    const start = new Date(contest.startTime);
    const end = new Date(contest.endTime);
    let status = "upcoming";
    if (serverNow >= start && serverNow <= end) status = "active";
    else if (serverNow > end) status = "ended";

    const contestBody = {
      id: contest.id,
      title: contest.title,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      status,
      version: computeHash({
        title: contest.title,
        start: contest.startTime,
        end: contest.endTime,
      }).slice(0, 8),
    };

    // attach per-problem maxScore and userScore/status when possible
    const uid = req.user && req.user.uid;
    let userScoresMap = {};
    if (uid) {
      const subs = await Prisma.submission.findMany({
        where: { contestId: id, userId: uid },
      });
      subs.forEach((s) => {
        const prev = userScoresMap[s.problemId] || 0;
        if (s.score > prev) userScoresMap[s.problemId] = s.score;
      });
    }

    contestBody.problems = (contest.problems || []).map((p) => {
      const maxScore = p.MaxScore || null;
      const userScore =
        typeof userScoresMap[p.id] === "number" ? userScoresMap[p.id] : null;
      let pst = "Unattempted";
      if (userScore == null) pst = "Unattempted";
      else if (maxScore != null && userScore >= maxScore) pst = "Solved";
      else if (userScore > 0) pst = "Partially Solved";
      else pst = "Unattempted";
      return {
        id: p.id,
        title: p.title,
        maxScore,
        userScore,
        status: pst,
      };
    });

    const etag = `"${computeHash(contestBody)}"`;
    res.setHeader("ETag", etag);
    // Last-Modified: use startTime as a stable proxy if no updatedAt exists
    res.setHeader("Last-Modified", new Date(contest.startTime).toUTCString());

    // caching rules
    if (status === "active") {
      res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
    } else {
      // archival contests can be cached longer
      res.setHeader("Cache-Control", "private, max-age=3600");
    }

    // conditional GET support
    const inm = req.headers["if-none-match"];
    if (inm && inm === etag) return res.status(304).end();

    return res.json({
      ok: true,
      contest: contestBody,
      serverNow: serverNow.toISOString(),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("getContestMeta", err);
    res.status(500).json({ ok: false, error: "server error" });
  }
};

const getContestChallengesList = async (req, res) => {
  try {
    const contestId = req.params.contestId || req.query.contestId;
    if (!contestId)
      return res.status(400).json({ ok: false, error: "contestId required" });

    const contest = await Prisma.contest.findUnique({
      where: { id: contestId },
      include: { problems: true },
    });
    if (!contest)
      return res.status(404).json({ ok: false, error: "Not found" });

    const uid = req.user && req.user.uid;
    let userScoresMap = {};
    if (uid) {
      const subs = await Prisma.submission.findMany({
        where: { contestId: contestId, userId: uid },
      });
      subs.forEach((s) => {
        const prev = userScoresMap[s.problemId] || 0;
        if (s.score > prev) userScoresMap[s.problemId] = s.score;
      });
    }

    const problems = (contest.problems || []).map((p) => {
      const shortStatement = p.statement
        ? p.statement.length > 200
          ? p.statement.slice(0, 197) + "..."
          : p.statement
        : "";
      const maxScore = p.MaxScore || null;
      const userScore =
        typeof userScoresMap[p.id] === "number" ? userScoresMap[p.id] : null;
      let pst = "Unattempted";
      if (userScore == null) pst = "Unattempted";
      else if (maxScore != null && userScore >= maxScore) pst = "Solved";
      else if (userScore > 0) pst = "Partially Solved";
      else pst = "Unattempted";
      return {
        id: p.id,
        title: p.title,
        shortStatement,
        difficulty: null,
        tags: [],
        hasSample: Boolean(p.sampleInput || p.sampleOutput),
        timeLimit: null,
        memoryLimit: null,
        scoreWeight: p.MaxScore || null,
        version: computeHash({
          id: p.id,
          title: p.title,
          statement: p.statement,
        }).slice(0, 8),
        maxScore,
        userScore,
        status: pst,
      };
    });

    const bodyHash = computeHash(problems.map((p) => p.version).join(","));
    const etag = `"${bodyHash}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", new Date(contest.startTime).toUTCString());
    res.setHeader(
      "Cache-Control",
      contest && new Date() > new Date(contest.endTime)
        ? "private, max-age=3600"
        : "private, max-age=30",
    );

    if (req.headers["if-none-match"] === etag) return res.status(304).end();

    return res.json({ ok: true, challenges: problems });
  } catch (err) {
    console.error("getContestChallengesList", err);
    res.status(500).json({ ok: false, error: "server error" });
  }
};

const getChallengeById = async (req, res) => {
  try {
    const id = req.params.challengeId;
    const contestId = req.query.contestId;
    const problem = await Prisma.problem.findUnique({ where: { id } });
    if (!problem)
      return res.status(404).json({ ok: false, error: "Not found" });

    // determine contest context
    let contest = null;
    let contestActive = false;
    if (contestId) {
      contest = await Prisma.contest.findUnique({ where: { id: contestId } });
      if (contest) {
        const now = new Date();
        contestActive =
          now >= new Date(contest.startTime) &&
          now <= new Date(contest.endTime);
      }
    }

    const challengeBody = {
      id: problem.id,
      title: problem.title,
      statement: problem.statement,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      constraints: problem.constraints,
      sampleInput: problem.sampleInput,
      sampleOutput: problem.sampleOutput,
      timeLimit: null,
      memoryLimit: null,
      tags: [],
      version: computeHash({
        id: problem.id,
        updated: problem.statement,
        sample: problem.sampleInput,
      }).slice(0, 8),
    };

    // Always include `explanation` field (used for sample input/output display)
    challengeBody.explanation = problem.explanation || "";
    // include user score/status for this problem within contest context
    const uidReq = req.user && req.user.uid;
    let userScore = null;
    if (uidReq && contestId) {
      const subs = await Prisma.submission.findMany({
        where: { contestId: contestId, userId: uidReq, problemId: id },
      });
      if (subs && subs.length)
        userScore = subs.reduce((m, s) => (s.score > m ? s.score : m), 0);
    }
    const maxScore = problem.MaxScore || null;
    let pst = "Unattempted";
    if (userScore == null) pst = "Unattempted";
    else if (maxScore != null && userScore >= maxScore) pst = "Solved";
    else if (userScore > 0) pst = "Partially Solved";
    challengeBody.userScore = userScore;
    challengeBody.maxScore = maxScore;
    challengeBody.status = pst;

    const etag = `"${computeHash(challengeBody)}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", new Date().toUTCString());
    res.setHeader(
      "Cache-Control",
      contestActive
        ? "private, max-age=0, must-revalidate"
        : "private, max-age=3600",
    );

    if (req.headers["if-none-match"] === etag) return res.status(304).end();

    return res.json({ ok: true, challenge: challengeBody });
  } catch (err) {
    console.error("getChallengeById", err);
    res.status(500).json({ ok: false, error: "server error" });
  }
};

const updateContest = async (req, res) => {
  const id = req.params.id;
  const { title, description, startTime, endTime, SelectedProblems } = req.body;
  try {
    // verify admin
    const uid = req.user && req.user.uid;
    if (!uid)
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    const user = await Prisma.User.findUnique({ where: { id: uid } });
    if (!user || !user.Admin)
      return res.status(403).json({ ok: false, error: "Admin only" });

    const updateData = {
      title,
      description,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
    };

    // prepare problems relation
    if (Array.isArray(SelectedProblems)) {
      updateData.problems = {
        set: SelectedProblems.map((p) => ({ id: p.id })),
      };
    }

    await Prisma.Contest.update({ where: { id }, data: updateData });
    res.json({ ok: true, msg: "Contest updated" });
  } catch (err) {
    console.error("updateContest error", err);
    res.status(500).json({ ok: false, error: "Failed to update contest" });
  }
};

const registerForContest = async (req, res) => {
  try {
    const contestId = req.params.contestId;
    const uid = req.user && req.user.uid;
    if (!uid)
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    if (!contestId)
      return res.status(400).json({ ok: false, error: "contestId required" });

    const contest = await Prisma.contest.findUnique({
      where: { id: contestId },
      include: { problems: true },
    });
    if (!contest)
      return res.status(404).json({ ok: false, error: "Not found" });

    const created = [];
    for (const p of contest.problems || []) {
      const exists = await Prisma.submission.findFirst({
        where: { userId: uid, problemId: p.id, contestId: contestId },
      });
      if (exists) continue;
      const s = await Prisma.submission.create({
        data: {
          userId: uid,
          problemId: p.id,
          contestId: contestId,
          passedCount: 0,
          totalCount: 0,
          language: "",
          code: "",
          verdict: "unattempted",
          score: 0,
        },
      });
      created.push(s.id);
    }

    return res.json({
      ok: true,
      createdCount: created.length,
      createdIds: created,
    });
  } catch (err) {
    console.error("registerForContest", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
};

const checkRegistrationForContest = async (req, res) => {
  try {
    const contestId = req.params.contestId;
    const uid = req.user && req.user.uid;
    if (!uid)
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    if (!contestId)
      return res.status(400).json({ ok: false, error: "contestId required" });

    const contest = await Prisma.contest.findUnique({
      where: { id: contestId },
      include: { problems: true },
    });
    if (!contest)
      return res.status(404).json({ ok: false, error: "Not found" });

    const problems = contest.problems || [];
    if (problems.length === 0) return res.json({ ok: true, registered: true });

    const subs = await Prisma.submission.findMany({
      where: { contestId: contestId, userId: uid },
      select: { problemId: true },
    });
    const submittedSet = new Set(subs.map((s) => s.problemId));
    const missing = problems
      .filter((p) => !submittedSet.has(p.id))
      .map((p) => p.id);
    const registered = missing.length === 0;
    return res.json({ ok: true, registered, missing });
  } catch (err) {
    console.error("checkRegistrationForContest", err);
    return res.status(500).json({ ok: false, error: "server error" });
  }
};

module.exports = {
  createContest,
  createProblem,
  getAllContests,
  getProblems,
  getContestChallenges,
  deleteContest,
  getContestTime,
  updateContest,
  getContestMeta,
  getContestChallengesList,
  getChallengeById,
  registerForContest,
  checkRegistrationForContest,
  getContestLeaderboard: contestReportService.getContestLeaderboard,
  downloadContestResultsExcel: contestReportService.downloadContestResultsExcel,
};
