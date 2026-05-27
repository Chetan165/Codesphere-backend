const Prisma = require("../db/PrismaClient.js");
const ExcelJS = require("exceljs");

function formatIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// NOTE: DB keeps only one submission per user×problem for a contest.
// We therefore don't track attempts or pick between multiple submissions.
// Use the single submission's score and submittedAt directly.

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
        // single submission per user×problem in DB
        bestSubmission: null,
        bestScore: 0,
      };
      userEntry.problems.set(submission.problemId, problemEntry);
    }

    // DB guarantees one stored submission per user/problem for this contest.
    problemEntry.bestSubmission = submission;
    problemEntry.bestScore = Number(submission.score || 0);
  }

  const leaderboard = Array.from(usersById.values())
    .map((userEntry) => {
      let totalScore = 0;
      let lastSubmittedAtMs = null;
      const problemRows = [];

      for (const problem of contest.problems || []) {
        const problemStats = userEntry.problems.get(problem.id);
        const maxScore = Number(problem.MaxScore || 0);
        const bestScore = Number(problemStats?.bestScore || 0);
        const bestSubmission = problemStats?.bestSubmission || null;

        totalScore += bestScore;
        const submittedAtMs = bestSubmission
          ? new Date(bestSubmission.submittedAt || 0).getTime()
          : null;
        if (
          submittedAtMs &&
          (!lastSubmittedAtMs || submittedAtMs > lastSubmittedAtMs)
        ) {
          lastSubmittedAtMs = submittedAtMs;
        }

        problemRows.push({
          problemId: problem.id,
          problemTitle: problem.title,
          maxScore,
          bestScore,
          verdict: bestSubmission?.verdict || "unattempted",
          language: bestSubmission?.language || "",
          code: bestSubmission?.code || "",
          bestSubmittedAt: formatIso(bestSubmission?.submittedAt),
        });
      }

      return {
        userId: userEntry.userId,
        name: userEntry.name,
        rollNo: userEntry.rollNo,
        branch: userEntry.branch,
        totalScore,
        lastSubmittedAtMs,
        lastSubmittedAt: lastSubmittedAtMs
          ? new Date(lastSubmittedAtMs).toISOString()
          : null,
        problemRows,
      };
    })
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      const aTime = a.lastSubmittedAtMs ?? Infinity;
      const bTime = b.lastSubmittedAtMs ?? Infinity;
      if (aTime !== bTime) return aTime - bTime; // earlier last submission wins
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
    totalScore: row.totalScore,
    lastSubmittedAt: row.lastSubmittedAt,
    problemScores: row.problemRows.map((pr) => ({
      problemId: pr.problemId,
      problemTitle: pr.problemTitle,
      maxScore: pr.maxScore,
      marks: pr.bestScore,
      verdict: pr.verdict,
      language: pr.language,
      code: pr.code,
      submittedAt: pr.bestSubmittedAt,
    })),
  }));

  const performanceRows = leaderboard.flatMap((row) =>
    row.problemRows.map((problemRow) => ({
      rank: row.rank,
      userId: row.userId,
      name: row.name,
      rollNo: row.rollNo,
      problemTitle: problemRow.problemTitle,
      maxScore: problemRow.maxScore,
      bestScore: problemRow.bestScore,
      verdict: problemRow.verdict,
      language: problemRow.language,
      code: problemRow.code,
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

  // Build two header rows: first row merges per-question titles, second row has subheaders.
  const fixedCols = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "UID", key: "userId", width: 36 },
    { header: "Name", key: "name", width: 24 },
    { header: "Roll No", key: "rollNo", width: 18 },
    { header: "Branch", key: "branch", width: 16 },
  ];

  const perProblemSubcols = ["Marks", "Max", "Verdict", "Lang", "Code"];

  // First header row values (we'll insert later)
  const headerRow1 = [];
  // Second header row values
  const headerRow2 = [];

  // Fixed cols headers
  for (const c of fixedCols) {
    headerRow1.push(c.header);
    headerRow2.push("");
  }

  // Problem headers (merged across subcols)
  // We'll reconstruct problem list from the first leaderboard row if available.
  const problemList =
    report.leaderboardRows[0] && report.leaderboardRows[0].problemScores
      ? report.leaderboardRows[0].problemScores.map((p) => ({
          id: p.problemId,
          title: p.problemTitle,
        }))
      : [];

  for (const p of problemList) {
    for (let i = 0; i < perProblemSubcols.length; i++) headerRow1.push(p.title);
    for (const sub of perProblemSubcols) headerRow2.push(sub);
  }

  // Total score header
  headerRow1.push("Total");
  headerRow2.push("");

  // Add header rows
  const r1 = leaderboardSheet.addRow(headerRow1);
  const r2 = leaderboardSheet.addRow(headerRow2);
  r1.font = { bold: true };
  r2.font = { bold: true };

  // Merge cells for problem titles
  let colIndex = fixedCols.length + 1; // 1-based
  for (const p of problemList) {
    const start = colIndex;
    const end = colIndex + perProblemSubcols.length - 1;
    leaderboardSheet.mergeCells(1, start, 1, end);
    colIndex = end + 1;
  }

  // Set column widths for fixed cols
  for (let i = 0; i < fixedCols.length; i++) {
    leaderboardSheet.getColumn(i + 1).width = fixedCols[i].width;
  }

  // Set widths for per-problem subcols
  let colCursor = fixedCols.length + 1;
  for (const p of problemList) {
    leaderboardSheet.getColumn(colCursor++).width = 10; // Marks
    leaderboardSheet.getColumn(colCursor++).width = 10; // Max
    leaderboardSheet.getColumn(colCursor++).width = 12; // Verdict
    leaderboardSheet.getColumn(colCursor++).width = 12; // Lang
    leaderboardSheet.getColumn(colCursor++).width = 30; // Code
  }

  // Total column width
  leaderboardSheet.getColumn(colCursor).width = 12;

  leaderboardSheet.views = [{ state: "frozen", ySplit: 2 }];

  // Add data rows
  for (const row of report.leaderboardRows) {
    const data = [row.rank, row.userId, row.name, row.rollNo, row.branch];
    for (const ps of row.problemScores || []) {
      data.push(ps.marks);
      data.push(ps.maxScore);
      data.push(ps.verdict);
      data.push(ps.language);
      data.push(ps.code);
    }
    data.push(row.totalScore);
    leaderboardSheet.addRow(data);
  }

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
