function extractPython(text) {
  const fenceMatch = text.match(/```python\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const genericFence = text.match(/```\n([\s\S]*?)```/);
  if (genericFence) return genericFence[1].trim();
  return text.trim();
}

module.exports = { extractPython };
