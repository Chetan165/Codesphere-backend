const Prisma = require("../db/PrismaClient.js");

const root = (req, res) => {
  res.send('<body><a href="/auth/google">Authenticate</a></body>');
};

const protectedRoute = (req, res) => {
  res.redirect("http://localhost:5173/Dashboard");
};

const googleCallback = async (req, res) => {
  if (req.user.uid) {
    const currentSessionId = req.sessionID;
    await Prisma.User.update({
      where: { id: req.user.uid },
      data: { activeSessionId: currentSessionId },
    });
    res.redirect("/protected");
  } else {
    res.redirect("http://localhost:5173/Register");
  }
};

const authFailure = (req, res) => {
  res.send(`<body>
      <h1>Use a valid @tcetmumbai.in email id to register</h1>
      <a href="/auth/google">Try again</a>
      </body>`);
};

const getUser = (req, res) => {
  if (req.user) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
};

const register = async (req, res) => {
  const { name, roll, yearStart, branch, section, uid } = req.body;
  try {
    const check = await Prisma.User.findMany({ where: { id: uid } });
    if (check.length > 0) {
      return res.status(400).json({ ok: false });
    } else {
      const user = await Prisma.User.create({
        data: {
          id: uid,
          email: req.session.passport.user.email,
          name: name,
          rollNo: roll,
          branch: branch,
          year: parseInt(yearStart),
          activeSessionId: req.sessionID,
        },
      });
      req.session.passport.user.uid = uid;
      req.session.passport.user.admin = user.Admin;
      req.session.save();
      res.status(201).json({ ok: true });
    }
  } catch (err) {
    res.status(500).send("Registration failed");
  }
};

const logout = (req, res) => {
  req.logout(function (err) {
    if (err) {
      return res.status(500).send("Logout error");
    }
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
};

module.exports = {
  root,
  protectedRoute,
  googleCallback,
  authFailure,
  getUser,
  register,
  logout,
};
