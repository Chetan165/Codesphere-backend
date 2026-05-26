const AdminCheck = (req, res, next) => {
  if (req.user && req.user.admin) {
    return next();
  }
  return res
    .status(403)
    .json({ ok: false, error: "Access denied. Admin privileges required." });
};

module.exports = AdminCheck;
