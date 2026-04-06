const axios = require("axios");

/**
 * Instagram Reels upload using Graph API.
 * Flow:
 * 1. POST /media (initiate Reels upload)
 * 2. Poll /media (wait for status=FINISHED)
 * 3. POST /media_publish (publish the Reel)
 */
async function uploadToInstagram(account, videoPath, caption) {
  const accessToken = account.access_token;
  const igUserId = account.platform_account_id;

  // Instagram Graph API typically requires a public URL for the video.
  // We need to serve the video temporarily or use a different method.
  // For local development, this is tricky. 
  // However, I will implement the logic assuming the video is accessible via a public URL if available, 
  // or I'll provide a warning about the public URL requirement.

  console.warn("Instagram Reels sharing via API requires a Public URL for the video file.");

  // Assuming the video is served by our server and we have a public URL
  // In a real production environment, we'd use something like S3 or a tunnel.
  // For now, I'll use a placeholder or the server's public URL if configured.
  const videoUrl = `https://your-public-url.com/video-proxy/${igUserId}/${Date.now()}.mp4`;

  try {
    // 1. Create Media Container
    const containerResp = await axios.post(`https://graph.facebook.com/v18.0/${igUserId}/media`, null, {
      params: {
        media_type: 'REELS',
        video_url: videoUrl,
        caption: caption,
        access_token: accessToken
      }
    });

    const containerId = containerResp.data.id;
    console.log(`Instagram container created: ${containerId}. Waiting for processing...`);

    // 2. Poll for status
    let status = 'IN_PROGRESS';
    while (status === 'IN_PROGRESS') {
      await new Promise(r => setTimeout(r, 5000));
      const statusResp = await axios.get(`https://graph.facebook.com/v18.0/${containerId}`, {
        params: { fields: 'status_code', access_token: accessToken }
      });
      status = statusResp.data.status_code;
    }

    if (status !== 'FINISHED') {
      throw new Error(`Instagram upload failed with status: ${status}`);
    }

    // 3. Publish Media
    const publishResp = await axios.post(`https://graph.facebook.com/v18.0/${igUserId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: accessToken }
    });

    console.log(`Instagram Reel published [${account.account_name}]: ${publishResp.data.id}`);
    return publishResp.data.id;

  } catch (err) {
    console.error("Instagram Upload Error:", err.response ? err.response.data : err.message);
    throw err;
  }
}

module.exports = { uploadToInstagram };
