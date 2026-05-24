const Prisma = require("../db/PrismaClient.js");
const ExcelJS = require("exceljs");

function formatIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isRealAttempt(submission) {
  return Boolean(
    (submission.code && submission.code.trim()) ||
    (submission.verdict && submission.verdict !== "unattempted") ||
    Number(submission.score || 0) > 0,
  );
}

function pickBestSubmission(currentBest, candidate) {
  if (!currentBest) return candidate;

  const currentScore = Number(currentBest.score || 0);
  const candidateScore = Number(candidate.score || 0);
  if (candidateScore > currentScore) return candidate;
  if (candidateScore < currentScore) return currentBest;

  const currentTime = new Date(currentBest.submittedAt || 0).getTime();
  const candidateTime = new Date(candidate.submittedAt || 0).getTime();
  if (candidateTime < currentTime) return candidate;
  if (candidateTime > currentTime) return currentBest;

  return candidate.id < currentBest.id ? candidate : currentBest;
}

async function buildContestReport(contestId) {
  const contest = await Prisma.contest.findUnique({
    where: { id: contestId },
    include: {
      problems: true,
      submissions: {
        include: {
          user: true,
          problem: true,
        },
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!contest) {
    const error = new Error("Contest not found");
    error.statusCode = 404;
    throw error;
  }

  const problemsById = new Map((contest.problems || []).map((p) => [p.id, p]));
  const usersById = new Map();

  for (const submission of contest.submissions || []) {
    if (!submission.user) continue;

    let userEntry = usersById.get(submission.userId);
    if (!userEntry) {
      userEntry = {
        userId: submission.user.id,
        name: submission.user.name,
        rollNo: submission.user.rollNo,
        branch: submission.user.branch,
        year: submission.user.year,
        problems: new Map(),
      };
      usersById.set(submission.userId, userEntry);
    }

    let problemEntry = userEntry.problems.get(submission.problemId);
    if (!problemEntry) {
      const problem =
        problemsById.get(submission.problemId) || submission.problem;
      problemEntry = {
        problemId: submission.problemId,
        problemTitle: problem?.title || "",
        maxScore: problem?.MaxScore ?? 0,
        attempts: 0,
        bestSubmission: null,
        bestScore: 0,
      };
      userEntry.problems.set(submission.problemId, problemEntry);
    }

    if (isRealAttempt(submission)) {
      problemEntry.attempts += 1;
    }

    problemEntry.bestSubmission = pickBestSubmission(
      problemEntry.bestSubmission,
      submission,
    );
    problemEntry.bestScore = Number(problemEntry.bestSubmission.score || 0);
  }

  const leaderboard = Array.from(usersById.values())
    .map((userEntry) => {
      let totalScore = 0;
      let problemsSolved = 0;
      let attemptedProblems = 0;
      const problemRows = [];

      for (const problem of contest.problems || []) {
        const problemStats = userEntry.problems.get(problem.id);
        const maxScore = Number(problem.MaxScore || 0);
        const bestScore = Number(problemStats?.bestScore || 0);
        const attempts = Number(problemStats?.attempts || 0);
        const bestSubmission = problemStats?.bestSubmission || null;

        totalScore += bestScore;
        if (maxScore > 0 && bestScore >= maxScore) problemsSolved += 1;
        if (attempts > 0) attemptedProblems += 1;

        problemRows.push({
          problemId: problem.id,
          problemTitle: problem.title,
          maxScore,
          attempts,
          bestScore,
          solved: maxScore > 0 && bestScore >= maxScore,
          bestVerdict: bestSubmission?.verdict || "unattempted",
          bestLanguage: bestSubmission?.language || "",
          bestSubmittedAt: formatIso(bestSubmission?.submittedAt),
        });
      }

      return {
        userId: userEntry.userId,
        name: userEntry.name,
        rollNo: userEntry.rollNo,
        branch: userEntry.branch,
        year: userEntry.year,
        totalScore,
        problemsSolved,
        attemptedProblems,
        problemRows,
      };
    })
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.problemsSolved !== a.problemsSolved)
        return b.problemsSolved - a.problemsSolved;
      return a.rollNo.localeCompare(b.rollNo) || a.name.localeCompare(b.name);
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));

  const leaderboardRows = leaderboard.map((row) => ({
    rank: row.rank,
    userId: row.userId,
    name: row.name,
    rollNo: row.rollNo,
    branch: row.branch,
    year: row.year,
    totalScore: row.totalScore,
    problemsSolved: row.problemsSolved,
    attemptedProblems: row.attemptedProblems,
  }));

  const performanceRows = leaderboard.flatMap((row) =>
    row.problemRows.map((problemRow) => ({
      rank: row.rank,
      userId: row.userId,
      name: row.name,
      rollNo: row.rollNo,
      problemTitle: problemRow.problemTitle,
      maxScore: problemRow.maxScore,
      attempts: problemRow.attempts,
      bestScore: problemRow.bestScore,
      solved: problemRow.solved,
      language: problemRow.bestLanguage,
      submittedAt: problemRow.bestSubmittedAt,
    })),
  );

  return {
    contest: {
      id: contest.id,
      title: contest.title,
      startTime: formatIso(contest.startTime),
      endTime: formatIso(contest.endTime),
      private: contest.private,
    },
    leaderboardRows,
    performanceRows,
  };
}

async function writeContestReportWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "coding-platorm";
  workbook.created = new Date();

  const leaderboardSheet = workbook.addWorksheet("Leaderboard");
  leaderboardSheet.columns = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "UID", key: "userId", width: 36 },
    { header: "Name", key: "name", width: 24 },
    { header: "Roll No", key: "rollNo", width: 18 },
    { header: "Branch", key: "branch", width: 16 },
    { header: "Year", key: "year", width: 10 },
    { header: "Total Score", key: "totalScore", width: 12 },
    { header: "Problems Solved", key: "problemsSolved", width: 16 },
    { header: "Attempted Problems", key: "attemptedProblems", width: 18 },
  ];
  leaderboardSheet.addRows(report.leaderboardRows);
  leaderboardSheet.getRow(1).font = { bold: true };
  leaderboardSheet.views = [{ state: "frozen", ySplit: 1 }];

  const performanceSheet = workbook.addWorksheet("Performance");
  performanceSheet.columns = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "UID", key: "userId", width: 36 },
    { header: "Name", key: "name", width: 24 },
    { header: "Roll No", key: "rollNo", width: 18 },
    { header: "Problem", key: "problemTitle", width: 30 },
    { header: "Max Score", key: "maxScore", width: 12 },
    { header: "Best Score", key: "bestScore", width: 12 },
    { header: "Attempts", key: "attempts", width: 12 },
    { header: "Solved", key: "solved", width: 10 },
    { header: "Language", key: "language", width: 18 },
    { header: "Submitted At", key: "submittedAt", width: 24 },
  ];
  performanceSheet.addRows(
    report.performanceRows.map((row) => ({
      ...row,
      solved: row.solved ? "Yes" : "No",
    })),
  );
  performanceSheet.getRow(1).font = { bold: true };
  performanceSheet.views = [{ state: "frozen", ySplit: 1 }];

  return workbook;
}

async function getContestLeaderboard(req, res) {
  try {
    const contestId = req.params.contestId;
    if (!contestId)
      return res.status(400).json({ ok: false, error: "contestId required" });

    const report = await buildContestReport(contestId);
    const rawLimit = req.query.limit;
    const rawOffset = req.query.offset;
    const limit =
      rawLimit === undefined ? null : Math.max(0, Number(rawLimit) || 0);
    const offset = Math.max(0, Number(rawOffset) || 0);

    const paginatedLeaderboard =
      limit === null
        ? report.leaderboardRows
        : report.leaderboardRows.slice(offset, offset + limit);

    return res.json({
      ok: true,
      contest: report.contest,
      leaderboard: paginatedLeaderboard,
      pagination: {
        total: report.leaderboardRows.length,
        offset,
        limit,
        returned: paginatedLeaderboard.length,
        hasMore:
          limit === null
            ? false
            : offset + paginatedLeaderboard.length <
              report.leaderboardRows.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("getContestLeaderboard", err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 404 ? "Not found" : "server error",
    });
  }
}

async function downloadContestResultsExcel(req, res) {
  try {
    const contestId = req.params.contestId;
    if (!contestId)
      return res.status(400).json({ ok: false, error: "contestId required" });

    const uid = req.user && req.user.uid;
    if (!uid)
      return res.status(401).json({ ok: false, error: "Not authenticated" });

    const user = await Prisma.User.findUnique({ where: { id: uid } });
    if (!user || !user.Admin)
      return res.status(403).json({ ok: false, error: "Admin only" });

    const report = await buildContestReport(contestId);
    const workbook = await writeContestReportWorkbook(report);
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `${report.contest.title || "contest"}-results.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}"`,
    );

    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("downloadContestResultsExcel", err);
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 404 ? "Not found" : "server error",
    });
  }
}

module.exports = {
  buildContestReport,
  getContestLeaderboard,
  downloadContestResultsExcel,
};
