const fs = require("fs");
const { google } = require("googleapis");
const authService = require("../services/authService");

async function uploadToYoutube(account, videoPath, title, description, tags = []) {
  const accessToken = await authService.refreshYouTubeToken(account);

  const oauth2Client = authService.getYouTubeOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const tagsArray = Array.isArray(tags) ? tags : (tags ? tags.split(",").map(t => t.trim()) : []);
  const res = await youtube.videos.insert({
    part: "snippet,status",
    requestBody: {
      snippet: {
        title: title.substring(0, 100),
        description: (description || "") + "\n\n#Shorts",
        tags: tagsArray,
        categoryId: "25",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = res.data.id;
  console.log(`YouTube'a [${account.account_name}] yüklendi: https://youtube.com/shorts/${videoId}`);
  return videoId;
}

module.exports = { uploadToYoutube };
