const Prisma = require("../db/PrismaClient.js");

async function checkContestWindow(req, res, next) {
  try {
    const contestId =
      (req.body && req.body.ContestId) ||
      (req.body && req.body.Submission && req.body.Submission.ContestId) ||
      req.params.contestId ||
      null;

    if (!contestId) return next(); // not a contest submission

    const contest = await Prisma.contest.findUnique({
      where: { id: contestId },
    });
    if (!contest)
      return res.status(404).json({ ok: false, error: "Contest not found" });

    const now = new Date();
    if (now < contest.startTime)
      return res.status(403).json({ ok: false, error: "Contest not started" });
    if (now > contest.endTime)
      return res.status(403).json({ ok: false, error: "Contest ended" });

    return next();
  } catch (err) {
    console.error("checkContestWindow error", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}

module.exports = checkContestWindow;
