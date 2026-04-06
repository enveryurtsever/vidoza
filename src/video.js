const { bundle } = require("@remotion/bundler");
const { renderMedia, getCompositions } = require("@remotion/renderer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { parseSrt, parseWordTiming } = require("./remotion/srt-parser");

const MUSIC_DIR = path.join(config.BASE_DIR, "public", "music");
const REMOTION_ENTRY = path.join(__dirname, "remotion", "index.jsx");

let bundleCache = null;
let staticServer = null;
let staticPort = 3099;

function toStaticUrl(filePath) {
  const absPath = path.resolve(filePath);
  return `http://localhost:${staticPort}/media?path=${encodeURIComponent(absPath)}`;
}

async function ensureStaticServer() {
  if (staticServer) return;
  const express = require("express");
  const app = express();
  app.get("/media", (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).send("Not found");
    }
    res.sendFile(filePath);
  });
  return new Promise((resolve) => {
    staticServer = app.listen(staticPort, () => {
      console.log(`Static media server: http://localhost:${staticPort}`);
      resolve();
    });
  });
}

function getMediaDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

async function getBundle() {
  if (bundleCache) return bundleCache;
  console.log("Remotion bundle oluşturuluyor...");
  bundleCache = await bundle({
    entryPoint: REMOTION_ENTRY,
    webpackOverride: (config) => config,
  });
  console.log("Remotion bundle hazır");
  return bundleCache;
}

async function createShortVideo(mediaPaths, audioPath, subtitlePath, outputPath, wordTimingPath = null, useOutro = true, outroOpts = {}) {
  if (!mediaPaths.length) {
    throw new Error("Hiç medya dosyası bulunamadı");
  }

  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  await ensureStaticServer();

  const useSubtitles = outroOpts.useSubtitles !== false;
  const useBgMusic = outroOpts.useBgMusic !== false;
  const orientation = outroOpts.orientation || "vertical";

  // Video boyutları
  const videoWidth = orientation === "horizontal" ? 1920 : config.VIDEO_WIDTH;
  const videoHeight = orientation === "horizontal" ? 1080 : config.VIDEO_HEIGHT;

  // 1. Parse subtitles
  let phraseGroups = [];
  if (useSubtitles && wordTimingPath && fs.existsSync(wordTimingPath)) {
    phraseGroups = parseWordTiming(wordTimingPath);
  } else if (useSubtitles && subtitlePath && fs.existsSync(subtitlePath)) {
    const cues = parseSrt(subtitlePath);
    phraseGroups = cues.map((c) => ({
      words: [{
        text: c.text,
        start: c.start,
        end: c.end,
      }],
    }));
  }

  // 2. Ses süresi
  let mainDurationFrames;
  const fps = config.VIDEO_FPS;

  if (audioPath && fs.existsSync(audioPath)) {
    const audioDuration = await getMediaDuration(audioPath);
    mainDurationFrames = Math.ceil(audioDuration * fps);
  } else {
    // TTS kapalıysa medya süresini kullan (minimum 10 saniye)
    mainDurationFrames = 10 * fps;
  }

  // 3. Outro
  let outroDurationFrames = 0;
  let outroUrl = null;
  let outroAudioUrl = null;
  const outroVideoPath = outroOpts.outroVideoPath || null;
  const outroAudioPath = outroOpts.outroAudioPath || null;
  const outroText = outroOpts.outroText || null;

  if (useOutro && outroVideoPath && fs.existsSync(outroVideoPath)) {
    try {
      if (outroAudioPath && fs.existsSync(outroAudioPath)) {
        const outroAudioDuration = await getMediaDuration(outroAudioPath);
        outroDurationFrames = Math.ceil(outroAudioDuration * fps) + 30;
        outroAudioUrl = toStaticUrl(outroAudioPath);
      } else {
        const outroDuration = await getMediaDuration(outroVideoPath);
        outroDurationFrames = Math.ceil(outroDuration * fps);
      }
      outroUrl = toStaticUrl(outroVideoPath);
    } catch (err) {
      console.warn("Outro süresi alınamadı, outro eklenmeyecek:", err.message);
    }
  }

  // 4. Background müzik
  let bgMusicUrl = null;
  if (useBgMusic && fs.existsSync(MUSIC_DIR)) {
    const musicFiles = fs.readdirSync(MUSIC_DIR).filter((f) => f.endsWith(".mp3"));
    if (musicFiles.length > 0) {
      const pick = musicFiles[Math.floor(Math.random() * musicFiles.length)];
      bgMusicUrl = toStaticUrl(path.join(MUSIC_DIR, pick));
      console.log("Background müzik:", pick);
    }
  }

  // 5. Toplam süre
  const totalDurationFrames = mainDurationFrames + outroDurationFrames;

  const inputProps = {
    mediaPaths: mediaPaths.map(toStaticUrl),
    audioPath: audioPath && fs.existsSync(audioPath) ? toStaticUrl(audioPath) : null,
    bgMusicPath: bgMusicUrl,
    phraseGroups: useSubtitles ? phraseGroups : [],
    outroPath: outroUrl,
    outroAudioPath: outroAudioUrl,
    outroText,
    outroDurationFrames,
    mainDurationFrames,
    useSubtitles,
  };

  // 6. Remotion bundle
  const bundlePath = await getBundle();
  const compositions = await getCompositions(bundlePath, { inputProps });

  const composition = compositions.find((c) => c.id === "ShortVideo");
  if (!composition) {
    throw new Error("ShortVideo composition bulunamadı");
  }

  // 7. Render
  const audioDurSec = mainDurationFrames / fps;
  console.log(`Remotion render başlıyor (${totalDurationFrames} frame, ~${Math.round(audioDurSec)}s video, ${orientation})...`);

  await renderMedia({
    composition: {
      ...composition,
      durationInFrames: totalDurationFrames,
      width: videoWidth,
      height: videoHeight,
      fps,
    },
    serveUrl: bundlePath,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      if (Math.round(progress * 100) % 20 === 0) {
        console.log(`Render: ${Math.round(progress * 100)}%`);
      }
    },
  });

  console.log("Video render tamamlandı:", outputPath);
  return outputPath;
}

module.exports = { createShortVideo };
