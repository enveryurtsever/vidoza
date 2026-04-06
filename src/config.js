require("dotenv").config();
const path = require("path");

module.exports = {
  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_ADMIN_CHAT_ID: process.env.TELEGRAM_ADMIN_CHAT_ID || null,

  // Gemini AI
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // Media APIs
  PIXABAY_API_KEY: process.env.PIXABAY_API_KEY,
  PEXELS_API_KEY: process.env.PEXELS_API_KEY,

  // YouTube OAuth
  YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET,
  YOUTUBE_REDIRECT_URI: process.env.YOUTUBE_REDIRECT_URI || "http://localhost:3000/auth/youtube/callback",

  // TikTok OAuth
  TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
  TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
  TIKTOK_REDIRECT_URI: process.env.TIKTOK_REDIRECT_URI || "http://localhost:3000/auth/tiktok/callback",

  // Instagram / Facebook OAuth
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
  INSTAGRAM_CLIENT_ID: process.env.INSTAGRAM_CLIENT_ID,
  INSTAGRAM_CLIENT_SECRET: process.env.INSTAGRAM_CLIENT_SECRET,
  INSTAGRAM_REDIRECT_URI: process.env.INSTAGRAM_REDIRECT_URI || "http://localhost:3000/auth/instagram/callback",


  // Dashboard
  DASHBOARD_USERNAME: process.env.DASHBOARD_USERNAME,
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,

  // TTS
  TTS_SPEED: parseFloat(process.env.TTS_SPEED) || 1.0,

  // Duration presets
  DURATION_PRESETS: {
    "15-30s": { label: "15-30 saniye", min: 15, max: 30, words: { min: 40, max: 80 } },
    "30-60s": { label: "30-60 saniye", min: 30, max: 60, words: { min: 80, max: 160 } },
    "1-3dk": { label: "1-3 dakika", min: 60, max: 180, words: { min: 160, max: 480 } },
    "3-10dk": { label: "3-10 dakika", min: 180, max: 600, words: { min: 480, max: 1600 } },
    "10dk+": { label: "10+ dakika", min: 600, max: 1200, words: { min: 1600, max: 3200 } },
  },

  // Paths
  BASE_DIR: path.join(__dirname, ".."),
  OUTPUT_DIR: path.join(__dirname, "..", "output"),
  TEMP_DIR: path.join(__dirname, "..", "temp"),

  // Video
  VIDEO_WIDTH: 1080,
  VIDEO_HEIGHT: 1920,
  VIDEO_FPS: 30,

  // Server
  PORT: process.env.PORT || 3000,

  // Job timeout (ms) — bu süreden uzun sürerse job fail olur
  JOB_TIMEOUT_MS: parseInt(process.env.JOB_TIMEOUT_MS) || 15 * 60 * 1000, // 15 dakika
};
