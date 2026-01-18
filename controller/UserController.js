const Prisma = require("../db/PrismaClient.js");

const getUser = async (req, res) => {
  console.log("session stored user=", req.user);
  console.log(req.session.passport);
  if (req.user) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
};

const registerUser = async (req, res) => {
  console.log(req.body);
  const { name, roll, yearStart, branch, section, uid } = req.body;

  try {
    const check = await Prisma.User.findMany({
      where: {
        id: uid,
      },
    });
    if (check.length > 0) {
      return res.status(400).json({
        ok: false,
      });
    } else {
      const user = await Prisma.User.create({
        data: {
          id: uid,
          email: req.session.passport.user.email,
          name: name,
          rollNo: roll,
          branch: branch,
          year: parseInt(yearStart),
        },
      });
      req.session.passport.user.uid = uid;
      req.session.passport.user.admin = user.Admin;
      req.session.save();
      console.log(user);
      res.status(201).json({
        ok: true,
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Registration failed");
  }
};

module.exports = {
  getUser,
  registerUser,
};
