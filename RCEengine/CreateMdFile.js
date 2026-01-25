import fs from "fs";
import path from "path";
const CreateMdFile = async (Job) => {
  const meta = JSON.parse(Job.MetaData);
  const mdContent = `
# Problem Statement
${meta.problemStatement}

## Input Format
${meta.inputFormat}

## Output Format
${meta.outputFormat}

## Constraints
${meta.constraints}

## Sample Input
\`\`\`
${meta.sampleInput}
\`\`\`

## Sample Output
\`\`\`
${meta.sampleOutput}
\`\`\`

## Solution
\`\`\`python
${meta.solution}
\`\`\`
`;
  const filePath = path.join("./", Job.jobid, "problem.md");
  fs.writeFileSync(filePath, mdContent);
  console.log("[RCE WORKER] Wrote problem.md for job:", Job.jobid);
};

export default CreateMdFile;
