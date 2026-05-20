const express = require("express");
const multer = require("multer");
const Admzip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const Prisma = require("./db/PrismaClient.js");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("zip"), async (req, res) => {
  try {
    const id = req.body.problemId;
    const zipPath = req.file.path;
    const zip = new Admzip(zipPath);
    const zipEntries = zip.getEntries();
    if (!id || id == "") {
      return res.status(400).json({
        message: "Missing problemId in request body.",
        ok: false,
      });
    }

    // Sort filenames: input00.txt before output00.txt
    const inputs = zipEntries.filter((e) => /input\d+\.txt$/.test(e.entryName));
    const outputs = zipEntries.filter((e) =>
      /output\d+\.txt$/.test(e.entryName),
    );
    const isPublicNo = req.body.isPublicNo || "";
    if (inputs.length !== outputs.length) {
      return res.status(400).json({
        message: "Input/output file count mismatch.",
        ok: false,
      });
    } else {
      inputs.sort((a, b) => a.entryName.localeCompare(b.entryName));
      outputs.sort((a, b) => a.entryName.localeCompare(b.entryName));
      for (let i = 0; i < inputs.length; i++) {
        const inputContent = inputs[i].getData().toString("utf-8");
        const outputContent = outputs[i].getData().toString("utf-8");
        // determine if this testcase should be public based on 1-based index
        const isPublic = String(i + 1) === String(isPublicNo);
        const ts = await Prisma.testCase.create({
          data: {
            input: inputContent.trim(),
            output: outputContent.trim(),
            problemId: id,
            isPublic: isPublic,
          },
        });
        console.log(ts);
      }
    }
    fs.unlinkSync(zipPath);
    res.json({
      ok: true,
      message: "Testcases uploaded successfully",
    });
  } catch (err) {
    res.json({
      ok: false,
      message: "Error in uploading testcases",
    });
  }
});

module.exports = router;
