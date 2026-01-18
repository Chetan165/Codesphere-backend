const updatedSubmission = require("../UpdateSubmission.js");

const updateSubmission = async (req, res) => {
  const { uid, problemId, ContestId, score, verdict, Code, lang_id } = req.body;
  try {
    const result = await updatedSubmission(
      uid,
      problemId,
      ContestId,
      score,
      verdict,
      Code,
      lang_id,
    );
    res.json({
      ok: true,
    });
  } catch (err) {
    res.json({
      ok: false,
      message: err.message,
    });
  }
};

module.exports = {
  updateSubmission,
};
