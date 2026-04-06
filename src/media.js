const axios = require("axios");
const fs = require("fs");
const path = require("path");
const config = require("./config");

const DOWNLOAD_TIMEOUT_MS = 30_000; // 30 sn per clip

/**
 * Pixabay video araması.
 * @param {string} query
 * @param {number} perPage
 * @returns {Promise<Array<{url,source,type}>>}
 */
async function searchPixabay(query, perPage = 5) {
  try {
    const resp = await axios.get("https://pixabay.com/api/videos/", {
      params: {
        key: config.PIXABAY_API_KEY,
        q: query,
        per_page: perPage,
        lang: "en",
        video_type: "film",   // Gerçek çekim (animasyon değil)
        order: "popular",     // En popüler önce
      },
      timeout: 10_000,
    });

    return (resp.data.hits || [])
      .map((hit) => ({
        url: hit.videos?.large?.url || hit.videos?.medium?.url,
        source: "pixabay",
        type: "video",
      }))
      .filter((r) => r.url);
  } catch (err) {
    console.error(`Pixabay arama hatası ("${query}"):`, err.message);
    return [];
  }
}

/**
 * Pexels video araması.
 * @param {string} query
 * @param {number} perPage
 * @param {string} orientation  "portrait" | "landscape" | undefined
 * @returns {Promise<Array<{url,source,type}>>}
 */
async function searchPexels(query, perPage = 5, orientation = undefined) {
  try {
    const params = { query, per_page: perPage };
    if (orientation) params.orientation = orientation;

    const resp = await axios.get("https://api.pexels.com/videos/search", {
      headers: { Authorization: config.PEXELS_API_KEY },
      params,
      timeout: 10_000,
    });

    const videos = resp.data.videos || [];

    // Kaliteye göre sırala: en yüksek genişlik önce
    videos.sort((a, b) => (b.width || 0) - (a.width || 0));

    return videos.map((item) => {
      // Minimum 720p tercih et, yoksa en iyisini al
      const file =
        item.video_files.find((f) => f.height >= 720 && f.file_type === "video/mp4") ||
        item.video_files.find((f) => f.height >= 720) ||
        item.video_files[0];
      return file ? { url: file.link, source: "pexels", type: "video" } : null;
    }).filter(Boolean);
  } catch (err) {
    console.error(`Pexels arama hatası ("${query}"):`, err.message);
    return [];
  }
}

async function downloadFile(url, savePath) {
  const resp = await axios.get(url, {
    responseType: "stream",
    timeout: 15_000, // bağlantı kurma süresi
  });

  const writer = fs.createWriteStream(savePath);
  resp.data.pipe(writer);

  return new Promise((resolve, reject) => {
    // 30 saniye maksimum indirme limiti
    const timer = setTimeout(() => {
      resp.data.destroy();
      writer.destroy();
      reject(new Error("Download timed out after 30s"));
    }, 30_000);

    writer.on("finish", () => {
      clearTimeout(timer);
      resolve(savePath);
    });

    writer.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    resp.data.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}


/**
 * Haber için stok medya çek ve indir.
 * @param {Array<{primary:string,fallback:string}|string>} keywords
 * @param {string} saveDir
 * @param {object} opts
 * @param {string} opts.orientation  "portrait" | "landscape"
 * @returns {Promise<string[]>} İndirilen dosya yolları
 */
async function fetchMediaForNews(keywords, saveDir, opts = {}) {
  fs.mkdirSync(saveDir, { recursive: true });

  let orientation = opts.orientation || "portrait";
  if (orientation === "vertical") orientation = "portrait";
  if (orientation === "horizontal") orientation = "landscape";

  const seenUrls = new Set();
  const allMedia = [];

  // Keywords eski (string) veya yeni ({primary, fallback}) formatta gelebilir
  const normalizedKeywords = keywords.map((k) =>
    typeof k === "string" ? { primary: k, fallback: k.split(" ")[0], is_location: false } : k
  );

  // Önce konum bazlı anahtar kelimeleri (City/Country) başa al
  normalizedKeywords.sort((a, b) => (b.is_location ? 1 : 0) - (a.is_location ? 1 : 0));

  for (const kw of normalizedKeywords) {
    const { primary, fallback, is_location } = kw;
    const beforeCount = allMedia.length;

    // Arama başına limit (Konum ise daha fazla sonuç alabiliriz)
    const limit = is_location ? 6 : 4;

    // 1. Önce Pexels dene (primary)
    let results = await searchPexels(primary, limit, orientation);

    // 2. Pexels primary yetersizse, Pexels fallback dene
    if (results.length < 2 && fallback && fallback !== primary) {
      console.log(`  Pexels: "${primary}" → ${results.length} sonuç, fallback "${fallback}" deneniyor...`);
      const fallbackResults = await searchPexels(fallback, limit, orientation);
      results = [...results, ...fallbackResults];
    }

    // 3. Hala yetersizse Pixabay'a geç (primary)
    if (results.length < 2) {
      console.log(`  Pexels yetersiz (${results.length}), Pixabay deneniyor: "${primary}"`);
      const pixResults = await searchPixabay(primary, limit);
      results = [...results, ...pixResults];

      // 4. Pixabay primary de yetersizse, Pixabay fallback
      if (pixResults.length < 2 && fallback && fallback !== primary) {
        console.log(`  Pixabay: "${primary}" → ${pixResults.length} sonuç, fallback "${fallback}" deneniyor...`);
        const pixFallback = await searchPixabay(fallback, limit);
        results = [...results, ...pixFallback];
      }
    }

    // Dedup ve ekle
    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allMedia.push(r);
      }
    }

    console.log(`  "${primary}" → ${allMedia.length - beforeCount} yeni klip (toplam: ${allMedia.length})`);

    // Yeterli klip toplandıysa dur
    if (allMedia.length >= 12) break;
  }


  console.log(`  Toplam ${allMedia.length} benzersiz klip bulundu, ilk 6 indirilecek.`);

  // Maksimum 6 klip indir
  const toDownload = allMedia.slice(0, 6);
  const downloaded = [];

  for (let i = 0; i < toDownload.length; i++) {
    const filePath = path.join(saveDir, `clip_${i}.mp4`);
    try {
      await downloadFile(toDownload[i].url, filePath);
      downloaded.push(filePath);
      console.log(`  ✓ clip_${i}.mp4 (${toDownload[i].source})`);
    } catch (err) {
      console.error(`  ✗ İndirme başarısız (clip_${i}):`, err.message);
    }
  }

  return downloaded;
}

module.exports = { fetchMediaForNews, searchPexels, searchPixabay, downloadFile };

