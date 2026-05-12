const Prisma = require("../db/PrismaClient.js");

async function isloggedin(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        loggedIn: false,
        registered: false,
        error: "Not logged in",
      });
    }

    if (!req.user.uid) {
      return res.status(401).json({
        ok: false,
        loggedIn: true,
        registered: false,
        error: "User not registered",
      });
    }

    const userRecord = await Prisma.User.findUnique({
      where: { id: req.user.uid },
    });

    if (!userRecord) {
      return res.status(401).json({
        ok: false,
        loggedIn: true,
        registered: false,
        error: "User not registered",
      });
    }

    if (
      !userRecord.activeSessionId ||
      userRecord.activeSessionId === req.sessionID
    ) {
      return next();
    }

    return res.status(401).json({
      ok: false,
      loggedIn: true,
      registered: true,
      sessionValid: false,
      error: "Session already active elsewhere",
    });
  } catch (err) {
    return res.status(401).json({
      ok: false,
      loggedIn: false,
      registered: false,
      error: "Not authenticated",
    });
  }
}

module.exports = isloggedin;
