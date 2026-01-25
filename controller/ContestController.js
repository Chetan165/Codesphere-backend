const Prisma = require("../db/PrismaClient.js");

const createContest = async (req, res) => {
  const { SelectedProblems, title, description, startTime, endTime } = req.body;
  console.log("Create Contest API Called");
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
  try {
    const contests = await Prisma.contest.findMany({
      include: { problems: true },
    });
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
    res.json({ ok: true, collections: FetchedChallenges });
  } catch (err) {
    res.json({ ok: false });
  }
};

const deleteContest = async (req, res) => {
  const id = req.params.id;
  try {
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

module.exports = {
  createContest,
  createProblem,
  getAllContests,
  getProblems,
  getContestChallenges,
  deleteContest,
  getContestTime,
};
