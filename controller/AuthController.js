const Prisma = require("../db/PrismaClient.js");

const googleCallback = async (req, res) => {
  if (req.user.uid) {
    // If authenticated, redirect to protected route
    console.log(req.user.uid);
    const currentSessionId = req.sessionID;

    await Prisma.User.update({
      where: {
        id: req.user.uid,
      },
      data: {
        activeSessionId: currentSessionId,
      },
    });
    res.redirect("/protected");
  } else {
    // If uid doesn't exist, redirect to register page
    res.redirect("http://localhost:5173/Register");
  }
};

const authFailure = (req, res) => {
  res.send(`<body>
      <h1>Use a valid @tcetmumbai.in email id to register</h1>
      <a href="/auth/google">Try again</a>
      </body>`);
};

const protectedRoute = (req, res) => {
  res.redirect("http://localhost:5173/Dashboard");
};

const logout = (req, res) => {
  req.logout(function (err) {
    if (err) {
      console.error(err);
      return res.status(500).send("Logout error");
    }

    // Destroy session and clear cookie
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
};

module.exports = {
  googleCallback,
  authFailure,
  protectedRoute,
  logout,
};
