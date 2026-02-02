const express = require("express");
const AutocraftRouter = express.Router();
const tags = require("../metadata/Qtags.json");

AutocraftRouter.get("/tags", (req, res) => {
  res.json(tags);
});

module.exports = AutocraftRouter;
