const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const config = require("./config");

async function generateSpeechWithSubtitles(text, audioPath, subtitlePath, voice = null, wordTimingPath = null) {
  const tts = new MsEdgeTTS();
  const selectedVoice = voice;
  if (!selectedVoice) throw new Error("TTS Error: No voice specified.");
  await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
  });

  const audioDir = path.dirname(audioPath);
  fs.mkdirSync(audioDir, { recursive: true });

  // toStream kullanarak hem audio hem metadata al
  const { audioStream, metadataStream } = await tts.toStream(text);

  // Audio'yu dosyaya yaz
  const audioWritePromise = new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(audioPath);
    audioStream.pipe(writeStream);
    writeStream.once("close", () => {
      if (writeStream.bytesWritten > 0) resolve();
      else reject(new Error("No audio data received"));
    });
    writeStream.once("error", reject);
  });

  // Metadata'dan word boundary'leri topla
  const wordBoundaries = [];
  const metadataPromise = new Promise((resolve) => {
    if (!metadataStream) return resolve();
    metadataStream.on("data", (chunk) => {
      try {
        const data = JSON.parse(chunk.toString());
        if (data.Metadata) {
          for (const item of data.Metadata) {
            if (item.Type === "WordBoundary") {
              wordBoundaries.push({
                text: item.Data.text.Text,
                offset: item.Data.Offset / 10000, // 100ns ticks → ms
                duration: item.Data.Duration / 10000,
              });
            }
          }
        }
      } catch (e) { /* ignore parse errors */ }
    });
    metadataStream.once("close", resolve);
    metadataStream.once("end", resolve);
  });

  await Promise.all([audioWritePromise, metadataPromise]);
  tts.close();

  // Ses hızlandırma
  const speed = config.TTS_SPEED || 1.0;
  if (speed !== 1.0) {
    await speedUpAudio(audioPath, speed);
  }

  // Kelime timing'lerini oluştur
  let phraseGroups;
  if (wordBoundaries.length > 0) {
    // Gerçek word boundary verilerinden timing oluştur
    phraseGroups = wordBoundaries.map((wb) => {
      const startSec = (wb.offset / 1000) / speed;
      const endSec = ((wb.offset + wb.duration) / 1000) / speed;
      return {
        words: [{
          text: wb.text,
          start: Math.round(startSec * 1000) / 1000,
          end: Math.round(endSec * 1000) / 1000,
        }],
      };
    });
  } else {
    // Fallback: ses süresinden tahmin et
    const duration = await getAudioDuration(audioPath);
    phraseGroups = buildWordTimingFallback(text, duration);
  }

  // Word timing JSON
  if (wordTimingPath) {
    fs.writeFileSync(wordTimingPath, JSON.stringify(phraseGroups, null, 2), "utf-8");
  }

  // SRT dosyası
  const srt = buildSrtFromPhraseGroups(phraseGroups);
  fs.writeFileSync(subtitlePath, srt, "utf-8");

  return { audioPath, subtitlePath, wordTimingPath };
}

function speedUpAudio(filePath, rate) {
  return new Promise((resolve, reject) => {
    const tempOut = filePath + ".fast.mp3";
    ffmpeg(filePath)
      .audioFilters(`atempo=${rate}`)
      .output(tempOut)
      .on("end", () => {
        fs.renameSync(tempOut, filePath);
        resolve();
      })
      .on("error", reject)
      .run();
  });
}

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

// Fallback: karakter bazlı tahmin (word boundary alınamazsa)
function buildWordTimingFallback(text, totalDuration) {
  const words = text.split(/\s+/).filter(Boolean);
  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  let currentTime = 0;
  const phraseGroups = [];

  for (const word of words) {
    const wordDuration = (word.length / totalChars) * totalDuration;
    phraseGroups.push({
      words: [{
        text: word,
        start: Math.round(currentTime * 1000) / 1000,
        end: Math.round((currentTime + wordDuration) * 1000) / 1000,
      }],
    });
    currentTime += wordDuration;
  }

  return phraseGroups;
}

function buildSrtFromPhraseGroups(phraseGroups) {
  const lines = [];
  let index = 1;

  for (const group of phraseGroups) {
    if (!group.words.length) continue;
    const start = group.words[0].start;
    const end = group.words[group.words.length - 1].end;
    const text = group.words.map((w) => w.text).join(" ");

    lines.push(`${index}`);
    lines.push(`${msToSrtTime(start * 1000)} --> ${msToSrtTime(end * 1000)}`);
    lines.push(text);
    lines.push("");
    index++;
  }

  return lines.join("\n");
}

function msToSrtTime(ms) {
  const totalMs = Math.floor(ms);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}

module.exports = { generateSpeechWithSubtitles };
