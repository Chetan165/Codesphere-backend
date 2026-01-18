const Prisma = require("../db/PrismaClient.js");

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
    console.log(problem);
    res.status(201).json({
      ok: true,
      problemId: problem.id,
      message: "Problem created successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create problem" });
  }
};

const searchProblems = async (req, res) => {
  console.log(req.body);
  try {
    const problems = await Prisma.problem.findMany({
      where: {
        title: {
          contains: req.body.search,
          mode: "insensitive",
        },
      },
    });
    res.json({
      ok: true,
      problems: problems,
    });
  } catch (err) {
    console.log(err);
    res.json({
      ok: false,
    });
  }
};

module.exports = {
  createProblem,
  searchProblems,
};
