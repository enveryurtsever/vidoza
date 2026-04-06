const fs = require("fs");
const axios = require("axios");
const authService = require("../services/authService");

async function uploadToTiktok(account, videoPath, title) {
  const accessToken = await authService.refreshTikTokToken(account);

  // 1. Video upload'u başlat
  const fileSize = fs.statSync(videoPath).size;
  const initResp = await axios.post(
    "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
    {
      source_info: {
        source: "FILE_UPLOAD",
        video_size: fileSize,
        chunk_size: fileSize,
        total_chunk_count: 1,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (initResp.data.error && initResp.data.error.code !== 'ok') {
    throw new Error(`TikTok Init Error: ${initResp.data.error.message}`);
  }

  const uploadUrl = initResp.data.data.upload_url;
  const publishId = initResp.data.data.publish_id;

  // 2. Video dosyasını yükle
  const videoBuffer = fs.readFileSync(videoPath);
  await axios.put(uploadUrl, videoBuffer, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${fileSize - 1}/${fileSize}`,
    },
  });

  console.log(`TikTok'a [${account.account_name}] yüklendi. Publish ID: ${publishId}`);
  return publishId;
}

module.exports = { uploadToTiktok };
