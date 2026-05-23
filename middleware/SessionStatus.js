const Prisma = require("../db/PrismaClient.js");

function isExpiredSession(session) {
  const expiresAt = session?.cookie?.expires;
  if (!expiresAt) return false;

  const expiryTime = new Date(expiresAt).getTime();
  return Number.isFinite(expiryTime) && expiryTime <= Date.now();
}

function destroySession(req) {
  return new Promise((resolve) => {
    if (!req.session) {
      resolve();
      return;
    }

    req.session.destroy(() => resolve());
  });
}

async function isloggedin(req, res, next) {
  try {
    if (isExpiredSession(req.session)) {
      await destroySession(req);
      res.clearCookie("connect.sid");
      return res.status(401).json({
        ok: false,
        loggedIn: false,
        registered: false,
        error: "Session expired",
      });
    }

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
