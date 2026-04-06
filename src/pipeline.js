const path = require("path");
const fs = require("fs");
const config = require("./config");
const { updateJob, getJob, getTask, getJobEffectiveSettings } = require("./database");
const { fetchMediaForNews } = require("./media");
const { generateSpeechWithSubtitles } = require("./tts");
const { createShortVideo } = require("./video");
const { rewriteContent, extractKeywordsAI, generateVideoMeta } = require("./ai");
const { LANGUAGES } = require("./languages");
const ffmpeg = require("fluent-ffmpeg");
const sharp = require("sharp");

function generateCustomThumbnail(videoPath, titleText, outputPath, orientation = "vertical") {
  return new Promise((resolve, reject) => {
    const tempFrame = outputPath + ".raw.jpg";

    const targetWidth = orientation === "horizontal" ? 1920 : config.VIDEO_WIDTH || 1080;
    const targetHeight = orientation === "horizontal" ? 1080 : config.VIDEO_HEIGHT || 1920;

    // 1. FFmpeg ile ham kareyi al
    ffmpeg(videoPath)
      .seekInput(1)
      .frames(1)
      .output(tempFrame)
      .on("error", reject)
      .on("end", async () => {
        try {
          // 2. Sharp ile metni üzerine bindir (SVG kullanarak)
          // Önce frame'i hedef boyuta getir (cover)
          const frameBuffer = await sharp(tempFrame)
            .resize(targetWidth, targetHeight, { fit: "cover" })
            .toBuffer();

          // Metin sarma (word wrap) simülasyonu için basit bir mantık
          const maxChars = orientation === "horizontal" ? 35 : 18;
          const words = titleText.split(" ");
          let lines = [];
          let currentLine = "";

          words.forEach(word => {
            if ((currentLine + word).length > maxChars) {
              lines.push(currentLine.trim());
              currentLine = word + " ";
            } else {
              currentLine += word + " ";
            }
          });
          lines.push(currentLine.trim());

          const fontSize = orientation === "horizontal" ? 130 : 110;
          const linePadding = 20;
          const totalTextHeight = lines.length * (fontSize + linePadding);

          // SVG oluştur (Beyaz metin ve siyah outline - arka plan kutusu kaldırıldı)
          const tspanElements = lines.map((line, i) => {
            return `<tspan x="50%" dy="${i === 0 ? 0 : fontSize + linePadding}">${line}</tspan>`;
          }).join("");

          const svg = `
            <svg width="${targetWidth}" height="${targetHeight}">
              <style>
                .title { 
                  fill: white; 
                  font-size: ${fontSize}px; 
                  font-weight: bold; 
                  font-family: sans-serif; 
                  text-anchor: middle;
                  stroke: black;
                  stroke-width: 12px;
                  paint-order: stroke fill;
                }
              </style>
              <text x="50%" y="${(targetHeight - totalTextHeight) / 2 + fontSize}" class="title">
                ${tspanElements}
              </text>
            </svg>
          `;

          await sharp(frameBuffer)
            .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
            .toFile(outputPath);

          // Geçici dosyayı sil
          if (fs.existsSync(tempFrame)) fs.unlinkSync(tempFrame);
          resolve();
        } catch (err) {
          reject(err);
        }
      })
      .run();
  });
}

function sanitizeFilename(str) {
  const trMap = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U'
  };
  return str
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, match => trMap[match])
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

/**
 * @param {number} jobId
 * @param {object} opts
 * @param {boolean} opts.skipScript - true ise senaryo/keywords adımını atla (regenerate)
 */
async function _processJobInternal(jobId, opts = {}) {

  const job = getJob(jobId);
  if (!job) throw new Error(`İş bulunamadı: ${jobId}`);

  // Task'tan ayarları miras al
  const task = job.task_id ? getTask(job.task_id) : null;
  const settings = getJobEffectiveSettings(job, task);

  const newsText = job.news_text;
  const langCode = settings.language;
  const lang = LANGUAGES[langCode] || LANGUAGES.tr;
  const durationPreset = settings.duration_preset;
  const selectedVoice = settings.voice || lang.defaultVoice;
  const useOutro = settings.use_outro !== 0;
  const outroText = settings.outro_text;
  const outroVideo = settings.outro_video;
  const useSubtitles = settings.use_subtitles !== 0;
  const useTts = settings.use_tts !== 0;
  const useBgMusic = settings.use_bgmusic !== 0;
  const orientation = settings.orientation || "vertical";
  const theme = settings.theme;

  const jobDir = path.join(config.TEMP_DIR, `job_${jobId}`);
  fs.mkdirSync(jobDir, { recursive: true });

  try {
    updateJob(jobId, { status: "processing", voice: selectedVoice, step: "script", step_progress: 0 });

    let scriptText = job.script_text;
    let keywords = job.keywords ? job.keywords.split(",").map(k => k.trim()).filter(Boolean) : null;

    // 1. Senaryo (skip edilebilir — regenerate veya zaten varsa)
    if (!opts.skipScript || !scriptText) {
      console.log(`Job ${jobId} - Gemini ile metin düzenleniyor (${lang.name}, ${durationPreset})...`);
      scriptText = await rewriteContent(newsText, langCode, durationPreset);
      console.log(`Job ${jobId} - Senaryo hazır (${scriptText.length} karakter)`);
      updateJob(jobId, { script_text: scriptText, step: "keywords", step_progress: 14 });
    } else {
      updateJob(jobId, { step: "keywords", step_progress: 14 });
    }

    // 2. Anahtar kelimeler
    if (!opts.skipScript || !keywords || !keywords.length) {
      keywords = await extractKeywordsAI(newsText, theme);
      const keywordSummary = keywords.map((k) =>
        typeof k === "string" ? k : `${k.primary} (fallback: ${k.fallback})`
      );
      console.log(`Job ${jobId} - Anahtar kelimeler:`, keywordSummary);
      const keywordsStr = keywords.map((k) =>
        typeof k === "string" ? k : k.primary
      ).join(", ");
      updateJob(jobId, { keywords: keywordsStr, step: "meta", step_progress: 28 });
    } else {
      updateJob(jobId, { step: "meta", step_progress: 28 });
    }

    // 3. Video meta
    const videoMeta = await generateVideoMeta(scriptText, langCode);
    console.log(`Job ${jobId} - Video başlığı: ${videoMeta.title}`);
    updateJob(jobId, { video_title: videoMeta.title, step: "tts", step_progress: 42 });

    // 4. TTS
    let audioPath = null;
    let wordTimingPath = null;
    const subtitlePath = path.join(jobDir, "subtitles.srt");

    if (useTts) {
      audioPath = path.join(jobDir, "speech.mp3");
      wordTimingPath = path.join(jobDir, "word_timing.json");
      await generateSpeechWithSubtitles(scriptText, audioPath, subtitlePath, selectedVoice, wordTimingPath);
      console.log(`Job ${jobId} - Ses oluşturuldu (${selectedVoice})`);
    }
    updateJob(jobId, { step: "media", step_progress: 56 });

    // 5. Stok medya indir
    const mediaDir = path.join(jobDir, "media");
    const mediaPaths = await fetchMediaForNews(keywords, mediaDir, { orientation });
    console.log(`Job ${jobId} - ${mediaPaths.length} medya indirildi`);
    if (mediaPaths.length === 0) {
      throw new Error("Medya bulunamadı: Pexels ve Pixabay'dan hiç klip indirilemedi. API kotası veya ağ sorunu olabilir.");
    }
    updateJob(jobId, { step: "video", step_progress: 70 });


    // 5.5. Outro TTS
    let outroAudioPath = null;
    if (useOutro && outroText && useTts) {
      outroAudioPath = path.join(jobDir, "outro_speech.mp3");
      await generateSpeechWithSubtitles(outroText, outroAudioPath, path.join(jobDir, "outro_sub.srt"), selectedVoice);
      console.log(`Job ${jobId} - Outro sesi oluşturuldu`);
    }

    // 6. Outro video yolu
    let outroVideoPath = null;
    if (useOutro && outroVideo) {
      const candidatePath = path.join(config.BASE_DIR, "outro", outroVideo);
      if (fs.existsSync(candidatePath)) {
        outroVideoPath = candidatePath;
      }
    }

    // 7. Output klasörü (task varsa task adıyla)
    let outputDir = config.OUTPUT_DIR;
    if (task) {
      const taskFolder = sanitizeFilename(task.name);
      outputDir = path.join(config.OUTPUT_DIR, taskFolder);
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 8. Video oluştur
    const safeTitle = sanitizeFilename(videoMeta.title);
    const outputFilename = `${jobId}-video-${safeTitle}.mp4`;
    const outputPath = path.join(outputDir, outputFilename);
    await createShortVideo(mediaPaths, audioPath, subtitlePath, outputPath, wordTimingPath, useOutro, {
      outroVideoPath,
      outroAudioPath,
      outroText,
      useSubtitles,
      useBgMusic,
      orientation,
    });
    console.log(`Job ${jobId} - Video oluşturuldu: ${outputPath}`);
    updateJob(jobId, { step: "thumbnail", step_progress: 90 });

    // 9. Thumbnail
    const thumbPath = outputPath.replace(".mp4", ".jpg");
    await generateCustomThumbnail(mediaPaths[0], videoMeta.title, thumbPath, orientation);
    console.log(`Job ${jobId} - Thumbnail oluşturuldu: ${thumbPath}`);

    // 10. Metadata txt
    const txtPath = outputPath.replace(".mp4", ".txt");
    const txtContent = `Title: ${videoMeta.title}\nDescription: ${videoMeta.description}\nTags: ${videoMeta.tags.join(", ")}`;
    fs.writeFileSync(txtPath, txtContent, "utf-8");

    updateJob(jobId, {
      status: "awaiting_approval",
      video_path: outputPath,
      thumbnail_path: thumbPath,
      video_description: videoMeta.description,
      video_tags: videoMeta.tags.join(", "),
      step: "done",
      step_progress: 100
    });
    return outputPath;
  } catch (err) {
    updateJob(jobId, { status: "failed", error: err.message });
    throw err;
  } finally {
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
}

let isQueueRunning = false;
const jobQueue = [];

async function _runQueue() {
  if (isQueueRunning || jobQueue.length === 0) return;
  isQueueRunning = true;

  while (jobQueue.length > 0) {
    const { jobId, opts, resolve, reject } = jobQueue.shift();
    const timeoutMs = config.JOB_TIMEOUT_MS;

    const timeoutPromise = new Promise((_, rej) =>
      setTimeout(() => {
        rej(new Error(`Video üretimi zaman aşımına uğradı (${Math.round(timeoutMs / 60000)} dakika)`));
      }, timeoutMs)
    );

    try {
      const result = await Promise.race([
        _processJobInternal(jobId, opts),
        timeoutPromise,
      ]);
      resolve(result);
    } catch (err) {
      // Timeout veya diğer hatalarda job'u fail'e çek
      const job = getJob(jobId);
      if (job && job.status !== "failed") {
        updateJob(jobId, { status: "failed", error: err.message });
      }
      console.error(`Queue - Job ${jobId} failed:`, err.message);
      reject(err);
    }
  }

  isQueueRunning = false;
}

/**
 * Sıralı (Sequential) processJob.
 * İşler bir kuyruğa eklenir ve arka arkaya işlenir.
 */
function processJob(jobId, opts = {}) {
  return new Promise((resolve, reject) => {
    jobQueue.push({ jobId, opts, resolve, reject });
    _runQueue();
  });
}

module.exports = { processJob };
