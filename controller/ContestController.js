const Prisma = require("../db/PrismaClient.js");

const createContest = async (req, res) => {
  const { SelectedProblems, title, description, startTime, endTime } = req.body;

  try {
    const contest = await Prisma.Contest.create({
      data: {
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
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
    console.error(error);
    res.status(500).json({ error: "Failed to create contest" });
  }
};

const getAllContests = async (req, res) => {
  try {
    const contests = await Prisma.contest.findMany({
      include: {
        problems: true,
      },
    });
    console.log(contests);
    res.json({
      contest: contests,
      ok: true,
    });
  } catch (err) {
    res.json({ ok: false });
  }
};

const getContestChallenges = async (req, res) => {
  try {
    const Contestid = req.body.problemId;
    const FetchedChallenges = await Prisma.contest.findUnique({
      where: {
        id: Contestid,
      },
      include: {
        problems: true,
      },
    });
    res.json({
      ok: true,
      collections: FetchedChallenges,
    });
  } catch (err) {
    res.json({
      ok: false,
    });
  }
};

const deleteContest = async (req, res) => {
  const id = req.params.id;
  try {
    const contest = await Prisma.Contest.findUnique({
      where: {
        id: id,
      },
    });
    const date_now = new Date();
    if (contest.startTime < date_now) {
      console.log("past contest");
      res.json({
        ok: false,
        msg: "Ongoing or Past Contest Cant be deleted",
      });
    } else {
      const result = await Prisma.Contest.delete({
        where: {
          id: id,
        },
      });
      res.json({
        ok: true,
      });
    }
  } catch (err) {
    res.json({
      ok: false,
    });
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

module.exports = {
  createContest,
  getAllContests,
  getContestChallenges,
  deleteContest,
  getContestTime,
};
