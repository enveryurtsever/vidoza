const { GoogleGenerativeAI } = require("@google/generative-ai");
const config = require("./config");
const { LANGUAGES } = require("./languages");

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

async function rewriteContent(text, langCode = "tr", durationPreset = "30-60s") {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const lang = LANGUAGES[langCode] || LANGUAGES.tr;
  const preset = config.DURATION_PRESETS[durationPreset] || config.DURATION_PRESETS["30-60s"];

  const prompt = `You are a content editor. Convert the following text into a script suitable for a short video (YouTube Shorts/TikTok/Reels).

The text can be of any type: news, article, tweet, information, story, etc. Analyze the content and convert it into the most suitable video script.

Rules:
- Video duration should be between ${preset.min}-${preset.max} seconds (approximately ${preset.words.min}-${preset.words.max} words)
- Summarize long content, expand short content if needed
- Start with an attention-grabbing opening sentence
- Use simple, clear language
- Remove unnecessary details, keep the essence
- Do NOT add any CTA, promotional sentence, or call-to-action at the end. Only include such phrases if they are explicitly present in the original text
- Write in ${lang.name} language
- Return ONLY the script text, no explanations or formatting

Text:
${text}`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

async function extractKeywordsAI(newsText, theme = null) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  let themeContext = "";
  if (theme) {
    themeContext = `\nImportant: Visuals must match the theme "${theme}". Shape the keywords according to this theme.`;
  }

  const prompt = `Extract 4-6 English search queries from the following text for finding stock videos on Pexels and Pixabay.
  
Rules:
- "primary": A highly specific, visual scene description (2-4 words). Must return relevant real footage when searched. Examples: "airport security queue", "city traffic night", "doctor hospital exam", "stock market trader"
- "fallback": A simpler, broader 1-2 word version of the same concept. Used if primary returns no results. Examples: "airport", "city", "hospital", "stock market"
- "is_location": (boolean) Set to true if the keyword refers to a specific country, city, or famous landmark. **IMPORTANT: If true, the "primary" MUST include the actual name of the location (e.g., "Istanbul aerial view", "Paris street life").**
- Only choose things that can realistically be filmed and found on stock video sites
- Prefer action/scene descriptions over abstract nouns
- Cover the most visually important aspects of the text${themeContext}

Return ONLY a valid JSON array, no other text:
[{"primary": "...", "fallback": "...", "is_location": false}, ...]

Text:
${newsText}`;

  const result = await model.generateContent(prompt);
  let raw = result.response.text().trim();
  // strip markdown fences if present
  raw = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed[0]?.primary) {
      return parsed;
    }
    // Fallback: if AI returned flat string array, wrap it
    return parsed.map((k) => ({ primary: String(k), fallback: String(k).split(" ")[0] }));
  } catch (e) {
    // Last resort: split by comma as before, wrap into objects
    return raw.split(",").map((k) => {
      const word = k.trim();
      return { primary: word, fallback: word.split(" ")[0] };
    }).filter((k) => k.primary);
  }
}

async function generateVideoMeta(scriptText, langCode = "tr") {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const lang = LANGUAGES[langCode] || LANGUAGES.tr;

  const prompt = `Generate a short, attention-grabbing title, a 1-2 sentence description, and 8-10 hashtags/tags for the following video script.
The title and description should be in ${lang.name} language. Tags can be in both ${lang.name} and English.

Return ONLY valid JSON, nothing else:
{"title": "...", "description": "...", "tags": ["tag1", "tag2", ...]}

Script:
${scriptText}`;

  const result = await model.generateContent(prompt);
  let raw = result.response.text().trim();
  raw = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {
      title: scriptText.split(/[.!?]/)[0].substring(0, 60).trim(),
      description: scriptText.substring(0, 150).trim(),
      tags: [],
    };
  }
}

module.exports = { rewriteContent, extractKeywordsAI, generateVideoMeta };
