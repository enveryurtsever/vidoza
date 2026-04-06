const fs = require("fs");

function parseSrt(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const cues = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;

    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );
    if (!timeMatch) continue;

    const start = toSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
    const end = toSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
    const text = lines.slice(2).join(" ").trim();

    cues.push({ start, end, text });
  }

  return cues;
}

function toSeconds(h, m, s, ms) {
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
}

function parseWordTiming(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

module.exports = { parseSrt, parseWordTiming };
