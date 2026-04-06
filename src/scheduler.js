const { getPendingScheduledPosts, updateScheduledPost, getJob, getSocialConnection, updateJob } = require("./database");
const { uploadToYoutube } = require("./upload/youtube");
const { uploadToTiktok } = require("./upload/tiktok");
const { uploadToInstagram } = require("./upload/instagram");

/**
 * Platform bazlı gerçek yükleme işlemini yapar.
 */
async function publishToPlatform(post, job) {
    const account = getSocialConnection(post.account_id);
    if (!account) {
        throw new Error(`Account #${post.account_id} not found for provider ${post.provider}`);
    }

    console.log(`[Scheduler] 🚀 Gerçek Yükleme Başlıyor: Job #${post.job_id} -> ${post.provider} (${account.account_name})`);

    const finalDescription = job.video_description || job.script_text;
    const finalTags = job.video_tags ? job.video_tags.split(",").map(t => t.trim()) : [];

    if (account.provider === "youtube") {
        platformJobId = await uploadToYoutube(account, job.video_path, job.video_title, finalDescription, finalTags);
        platformUrl = `https://youtube.com/shorts/${platformJobId}`;
    } else if (account.provider === "tiktok") {
        platformJobId = await uploadToTiktok(account, job.video_path, job.video_title);
        // platformUrl can be updated later if TikTok API provides a direct link
    } else if (account.provider === "instagram") {
        platformJobId = await uploadToInstagram(account, job.video_path, finalDescription);
    } else {
        throw new Error(`Unsupported provider: ${account.provider}`);
    }

    return { platformJobId, platformUrl };
}

function startScheduler() {
    console.log("Scheduler başlatıldı. Bekleyen paylaşımlar dakikada bir kontrol edilecek...");

    // Her 1 dakikada bir kontrol et
    setInterval(async () => {
        const pending = getPendingScheduledPosts();
        if (pending.length === 0) return;

        for (const post of pending) {
            try {
                const job = getJob(post.job_id);
                if (!job || !job.video_path) {
                    updateScheduledPost(post.id, { status: "failed", error: "Job veya video bulunamadı" });
                    continue;
                }

                // Gerçek paylaşım adımı
                const { platformJobId, platformUrl } = await publishToPlatform(post, job);
                updateScheduledPost(post.id, { 
                    status: "posted", 
                    platform_job_id: platformJobId,
                    platform_url: platformUrl
                });
                
                // Job statusunu da 'posted' yap (senkronizasyon)
                updateJob(post.job_id, { status: "posted" });
                
                console.log(`[Scheduler] ✅ Başarılı: Job #${post.job_id} (${post.provider})`);

            } catch (err) {
                updateScheduledPost(post.id, { status: "failed", error: err.message });
                console.error(`[Scheduler] ❌ Hata: Job #${post.job_id} -> ${err.message}`);
            }
        }
    }, 60_000);
}

module.exports = { startScheduler };
