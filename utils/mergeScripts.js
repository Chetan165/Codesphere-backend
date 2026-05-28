function mergeInputGenScripts(mainScript, advScript) {
  // Extract imports from both scripts and deduplicate
  const importRegex = /^(?:import .+|from .+ import .+)$/gm;

  const mainImports = [...new Set(mainScript.match(importRegex) || [])];
  const advImports = [...new Set(advScript.match(importRegex) || [])];
  const allImports = [...new Set([...mainImports, ...advImports])];

  // Remove imports from both scripts
  let mainBody = mainScript.replace(importRegex, "").trim();
  let advBody = advScript.replace(importRegex, "").trim();

  // Remove if __name__ == "__main__" blocks (the line + all indented lines after it)
  const mainBlockRegex =
    /if\s+__name__\s*==\s*["']__main__["']\s*:\s*\n([ \t]+.+\n?)*/g;

  mainBody = mainBody.replace(mainBlockRegex, "").trim();
  advBody = advBody.replace(mainBlockRegex, "").trim();

  // Build merged script
  return `${allImports.sort().join("\n")}

# ═══════════════════════════════════════════════
# PART 1: Sample + Edge + Generic + Large
# ═══════════════════════════════════════════════

${mainBody}

# ═══════════════════════════════════════════════
# PART 2: Adversarial
# ═══════════════════════════════════════════════

${advBody}

# ═══════════════════════════════════════════════
# EXECUTION
# ═══════════════════════════════════════════════

if __name__ == "__main__":
    generate_input00()
    generate_input01()
    generate_input02()
    generate_input03()
    generate_input04()
`;
}

module.exports = { mergeInputGenScripts };
