const Prisma = require("../db/PrismaClient.js");
async function isloggedin(req, res, next) {
  try {
    const userRecord = await Prisma.User.findUnique({
      where: {
        id: req.user.uid,
      },
    });
    if (userRecord.activeSessionId === req.sessionID) {
      return next();
    } else {
      res.status(401).json({ error: "Session already active elsewhere" });
    }
  } catch (err) {
    res.status(401).json({ error: "Not authenticated" });
  }
}
module.exports = isloggedin;
