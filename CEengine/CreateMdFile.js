import fs from "fs";
import path from "path";
const CreateMdFile = async (Job) => {
  let meta = JSON.parse(Job.MetaData);
  const mdContent = `
# ${meta.title || "Problem Statement"}
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
${meta.explanation ? `\n## Explanation\n${meta.explanation}\n` : ""}
## Solution
\`\`\`python
${meta.solution}
\`\`\`
`;
  const filePath = path.join("./", Job.jobid, "problem.md");
  fs.writeFileSync(filePath, mdContent);
  console.log("[CE WORKER] Wrote problem.md for job:", Job.jobid);
};

export default CreateMdFile;
