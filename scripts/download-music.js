/**
 * Background müzik indirme script'i
 *
 * Pixabay Music sayfasından müzik indirmek için:
 * 1. https://pixabay.com/music/search/background/ adresine git
 * 2. Beğendiğin 8-10 parçayı indir
 * 3. public/music/ klasörüne koy
 *
 * Veya bu scripti çalıştır: node scripts/download-music.js
 * Bu script bilinen royalty-free müzik kaynaklarından indirir.
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const MUSIC_DIR = path.join(__dirname, "..", "public", "music");

// Royalty-free, no-attribution-required background music URLs
// These are from sources that allow free commercial use
const MUSIC_SOURCES = [
  {
    name: "upbeat-corporate-01.mp3",
    url: "https://cdn.pixabay.com/audio/2024/11/29/audio_a504b55ad9.mp3",
  },
  {
    name: "inspiring-cinematic-02.mp3",
    url: "https://cdn.pixabay.com/audio/2024/09/10/audio_6e56242e42.mp3",
  },
  {
    name: "energetic-pop-03.mp3",
    url: "https://cdn.pixabay.com/audio/2024/10/07/audio_86e81dca60.mp3",
  },
  {
    name: "motivational-04.mp3",
    url: "https://cdn.pixabay.com/audio/2024/08/08/audio_0625e3031c.mp3",
  },
  {
    name: "happy-upbeat-05.mp3",
    url: "https://cdn.pixabay.com/audio/2024/06/11/audio_4dfe627dfe.mp3",
  },
  {
    name: "modern-tech-06.mp3",
    url: "https://cdn.pixabay.com/audio/2024/04/17/audio_faa3d00ea4.mp3",
  },
  {
    name: "soft-ambient-07.mp3",
    url: "https://cdn.pixabay.com/audio/2024/03/12/audio_de4d05cce5.mp3",
  },
  {
    name: "dramatic-news-08.mp3",
    url: "https://cdn.pixabay.com/audio/2024/05/20/audio_dd015c16a8.mp3",
  },
  {
    name: "chill-lofi-09.mp3",
    url: "https://cdn.pixabay.com/audio/2024/07/23/audio_58a3f9b816.mp3",
  },
  {
    name: "epic-cinematic-10.mp3",
    url: "https://cdn.pixabay.com/audio/2024/02/14/audio_08b8295f1e.mp3",
  },
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(destPath);

    client
      .get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(destPath);
          return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
  });
}

async function main() {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });

  console.log(`Müzik dosyaları indiriliyor → ${MUSIC_DIR}\n`);

  let downloaded = 0;
  for (const track of MUSIC_SOURCES) {
    const destPath = path.join(MUSIC_DIR, track.name);
    if (fs.existsSync(destPath)) {
      console.log(`  ✓ ${track.name} (zaten var)`);
      downloaded++;
      continue;
    }

    try {
      process.stdout.write(`  ⬇ ${track.name}...`);
      await downloadFile(track.url, destPath);
      const size = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
      console.log(` ✓ (${size} MB)`);
      downloaded++;
    } catch (err) {
      console.log(` ✗ ${err.message}`);
    }
  }

  console.log(`\n${downloaded}/${MUSIC_SOURCES.length} müzik dosyası hazır.`);

  if (downloaded === 0) {
    console.log("\nOtomatik indirme başarısız oldu.");
    console.log("Manuel indirme için: https://pixabay.com/music/search/background/");
    console.log(`İndirdiğiniz dosyaları şuraya koyun: ${MUSIC_DIR}`);
  }
}

main().catch(console.error);
