const express = require("express");
const path = require("path");
const fs = require("fs");
const config = require("./config");
const {
  getAllTasks, getTask, createTask, updateTask, deleteTask, getTaskJobCounts,
  getAllJobs, getJob, getJobsByTask, createJob, updateJob, getJobEffectiveSettings, getStats, getSetting, setSetting,
  getAllSocialConnections, getSocialConnection, removeSocialConnection,
  createScheduledPost, updateScheduledPost, deleteScheduledPost, getAllScheduledPostsFull, getRecentScheduledPostsFull, getReadyJobs, getUnscheduledReadyJobs, getFilteredJobs, getScheduledPostsForJob
} = require("./database");
const { processJob } = require("./pipeline");
const { LANGUAGES } = require("./languages");
const { getBot, getAdminChatId, notifyJobResult } = require("./bot");

const authService = require("./services/authService");
const { uploadToYoutube } = require("./upload/youtube");
const { uploadToTiktok } = require("./upload/tiktok");
const { uploadToInstagram } = require("./upload/instagram");


const OUTRO_DIR = path.join(config.BASE_DIR, "outro");

const router = express.Router();

// ── Telegram bildirim yardımcısı ──

// Auth middleware
function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.redirect("/login");
}

function getOutroFiles() {
  if (!fs.existsSync(OUTRO_DIR)) return [];
  return fs.readdirSync(OUTRO_DIR).filter(f => /\.(mp4|mov|webm)$/i.test(f));
}

// ── Auth ──

router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === config.DASHBOARD_USERNAME && password === config.DASHBOARD_PASSWORD) {
    req.session.loggedIn = true;
    return res.redirect("/");
  }
  res.render("login", { error: "Invalid username or password" });
});

router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

// ── Dashboard (Stats + Recent Jobs) ──

router.get("/", requireLogin, (req, res) => {
  const now = new Date();
  // Default to 1 hour + 5 mins buffer
  const future = new Date(now.getTime() + 65 * 60000);
  const stats = getStats();
  const recentJobs = getAllJobs(20);
  const recentActivities = getRecentScheduledPostsFull(10);
  const tasks = getAllTasks(500);
  const taskMap = {};
  for (const t of tasks) taskMap[t.id] = t;
  res.render("dashboard", {
    stats,
    recentJobs,
    recentActivities,
    taskMap,
    languages: LANGUAGES,
  });
});

// ── Tasks List ──

router.get("/tasks", requireLogin, (req, res) => {
  const tasks = getAllTasks();
  const jobCounts = getTaskJobCounts();
  res.render("tasks", {
    tasks,
    jobCounts,
    languages: LANGUAGES,
    durationPresets: config.DURATION_PRESETS,
    outroFiles: getOutroFiles(),
  });
});

// ── Task CRUD ──

router.post("/task/create", requireLogin, (req, res) => {
  const { name, theme, language, voice, duration_preset, orientation, use_outro, outro_video, outro_text, use_subtitles, use_tts, use_bgmusic } = req.body;
  const taskId = createTask({
    name: name || "New Task",
    theme: theme || null,
    language: language || "tr",
    voice: voice || null,
    durationPreset: duration_preset || "30-60s",
    orientation: orientation || "vertical",
    useOutro: use_outro === "1",
    outroVideo: outro_video || null,
    outroText: outro_text || null,
    useSubtitles: use_subtitles === "1",
    useTts: use_tts === "1",
    useBgmusic: use_bgmusic === "1",
  });
  res.redirect(`/task/${taskId}`);
});

router.get("/task/:id", requireLogin, (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).send("Task not found");
  const jobs = getJobsByTask(task.id);
  res.render("task_detail", {
    task,
    jobs,
    languages: LANGUAGES,
    durationPresets: config.DURATION_PRESETS,
    outroFiles: getOutroFiles(),
  });
});

router.get("/approved", (req, res) => res.redirect("/videos"));

router.get("/videos", requireLogin, (req, res) => {
  const taskIdRaw = req.query.task_id;
  const taskId = (taskIdRaw && !isNaN(parseInt(taskIdRaw))) ? parseInt(taskIdRaw) : null;
  const status = req.query.status || "ready";

  const filters = {};
  if (taskId) filters.task_id = taskId;
  if (status && status !== "all") filters.status = status;

  const rawJobs = getFilteredJobs(filters, 100);
  const tasks = getAllTasks();
  const connections = getAllSocialConnections();
  const now = new Date();
  const future = new Date(now.getTime() + 65 * 60000);

  // Map jobs for UI
  const jobs = rawJobs.map(job => {
    let thumbUrl = "/img/placeholder.jpg";
    if (job.thumbnail_path) {
      const relative = path.relative(config.OUTPUT_DIR, job.thumbnail_path);
      thumbUrl = "/v/" + relative.replace(/\\/g, "/");
    }
    
    // Check if scheduled
    const scheduledPosts = getScheduledPostsForJob(job.id);
    
    return { ...job, thumbUrl, scheduledPosts };
  });

  res.render("videos", { 
    jobs, 
    connections, 
    tasks,
    future,
    currentFilters: { task_id: taskId, status },
    activePage: "videos"
  });
});


router.post("/task/:id/update", requireLogin, (req, res) => {
  const { name, theme, language, voice, duration_preset, orientation, use_outro, outro_video, outro_text, use_subtitles, use_tts, use_bgmusic } = req.body;
  updateTask(req.params.id, {
    name: name || "New Task",
    theme: theme || null,
    language: language || "tr",
    voice: voice || null,
    duration_preset: duration_preset || "30-60s",
    orientation: orientation || "vertical",
    use_outro: use_outro === "1" ? 1 : 0,
    outro_video: outro_video || null,
    outro_text: outro_text || null,
    use_subtitles: use_subtitles === "1" ? 1 : 0,
    use_tts: use_tts === "1" ? 1 : 0,
    use_bgmusic: use_bgmusic === "1" ? 1 : 0,
  });
  res.redirect(`/task/${req.params.id}`);
});

router.post("/task/:id/delete", requireLogin, (req, res) => {
  deleteTask(req.params.id);
  res.redirect("/tasks");
});

// ── Task altında Job oluştur ──

router.post("/task/:id/job", requireLogin, async (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).send("Task not found");

  const { news_text } = req.body;
  if (!news_text || news_text.trim().length < 5) {
    return res.redirect(`/task/${task.id}?error=Text too short`);
  }

  // Toplu ekleme desteği: ## ile ayır
  const contents = news_text
    .split("##")
    .map(c => c.trim())
    .filter(c => c.length > 5);

  if (contents.length === 0) {
    return res.redirect(`/task/${task.id}?error=No valid content found`);
  }

  // İşleri oluştur ve arka planda kuyruğa ekle
  for (const content of contents) {
    const jobId = createJob(content, { taskId: task.id });

    processJob(jobId)
      .then((videoPath) => {
        const job = getJob(jobId);
        notifyJobResult(job, videoPath, null);
      })
      .catch((err) => {
        console.error(`Job ${jobId} failed:`, err);
        const job = getJob(jobId);
        notifyJobResult(job, null, err);
      });
  }

  res.redirect(`/task/${task.id}`);
});


// ── Job Detay ──

router.get("/job/:id", requireLogin, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).send("Job not found");
  const task = job.task_id ? getTask(job.task_id) : null;
  const settings = getJobEffectiveSettings(job, task);
  const scheduledPosts = getScheduledPostsForJob(job.id).map(sp => {
    const account = getSocialConnection(sp.account_id);
    return { ...sp, account_name: account ? account.account_name : 'Unknown' };
  });

  res.render("job_detail", {
    job,
    task,
    settings,
    scheduledPosts,
    languages: LANGUAGES,
    durationPresets: config.DURATION_PRESETS,
    outroFiles: getOutroFiles(),
  });
});

// Job güncelle (senaryo, keywords, ayarlar düzenleme)
router.post("/job/:id/update", requireLogin, (req, res) => {
  const { script_text, keywords, outro_text, language, voice, duration_preset, orientation, use_outro, outro_video, use_subtitles, use_tts, use_bgmusic } = req.body;
  const fields = {};
  if (script_text !== undefined) fields.script_text = script_text.trim();
  if (keywords !== undefined) fields.keywords = keywords.trim();
  if (outro_text !== undefined) fields.outro_text = outro_text.trim() || null;
  if (language) fields.language = language;
  if (voice) fields.voice = voice;
  if (duration_preset) fields.duration_preset = duration_preset;
  if (orientation) fields.orientation = orientation;
  if (use_outro !== undefined) fields.use_outro = use_outro === "1" ? 1 : 0;
  if (outro_video !== undefined) fields.outro_video = outro_video || null;
  if (use_subtitles !== undefined) fields.use_subtitles = use_subtitles === "1" ? 1 : 0;
  if (use_tts !== undefined) fields.use_tts = use_tts === "1" ? 1 : 0;
  if (use_bgmusic !== undefined) fields.use_bgmusic = use_bgmusic === "1" ? 1 : 0;

  updateJob(req.params.id, fields);
  res.redirect(`/job/${req.params.id}`);
});

// Job yeniden üret
router.post("/job/:id/regenerate", requireLogin, async (req, res) => {
  const jobId = parseInt(req.params.id);
  const job = getJob(jobId);
  if (!job) return res.status(404).send("Job not found");

  // Eski video dosyasını ve kalıntı temp verilerini sil
  if (job.video_path && fs.existsSync(job.video_path)) {
    try {
      fs.unlinkSync(job.video_path);
      const thumb = job.video_path.replace(".mp4", ".jpg");
      const txt = job.video_path.replace(".mp4", ".txt");
      if (fs.existsSync(thumb)) fs.unlinkSync(thumb);
      if (fs.existsSync(txt)) fs.unlinkSync(txt);
    } catch (e) { /* ignore */ }
  }

  const tempDir = path.join(config.BASE_DIR, "temp", `job_${jobId}`);
  if (fs.existsSync(tempDir)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }
  }

  updateJob(jobId, { status: "pending", error: null, video_path: null, step: null, step_progress: 0 });

  processJob(jobId, { skipScript: true })
    .then((videoPath) => {
      const updatedJob = getJob(jobId);
      notifyJobResult(updatedJob, videoPath, null);
    })
    .catch((err) => {
      console.error(`Job ${jobId} regenerate failed:`, err);
      const updatedJob = getJob(jobId);
      notifyJobResult(updatedJob, null, err);
    });

  res.redirect(`/job/${jobId}`);
});

// Job onayla (Ready durumuna getir)
router.post("/job/:id/approve", requireLogin, (req, res) => {
  const jobId = parseInt(req.params.id);
  const job = getJob(jobId);
  if (!job) return res.status(404).send("Job not found");

  updateJob(jobId, { status: "ready" });
  res.redirect("/videos");
});

// Job iptal et
router.post("/job/:id/cancel", requireLogin, (req, res) => {
  const jobId = parseInt(req.params.id);
  const job = getJob(jobId);
  if (!job) return res.status(404).send("Job not found");

  if (["processing", "pending"].includes(job.status)) {
    updateJob(jobId, { status: "failed", error: "Manuel iptal: kullanıcı tarafından durduruldu." });
  }

  const tempDir = path.join(config.BASE_DIR, "temp", `job_${jobId}`);
  if (fs.existsSync(tempDir)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }
  }

  res.redirect(`/job/${jobId}`);
});

// Video serve
router.get("/video/:id", requireLogin, (req, res) => {
  const job = getJob(req.params.id);
  if (!job || !job.video_path) return res.status(404).send("Video not found");
  res.sendFile(path.resolve(job.video_path));
});

// ── API ──

router.get("/api/job/:id/status", requireLogin, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({
    status: job.status,
    step: job.step || null,
    step_progress: job.step_progress || 0,
    video_title: job.video_title || null,
    keywords: job.keywords || null,
    script_text: job.script_text || null,
    error: job.error || null,
  });
});

// ── Settings ──

router.get("/settings", requireLogin, (req, res) => {
  const connections = getAllSocialConnections();
  res.render("settings", {
    message: req.query.message || null,
    error: req.query.error || null,
    youtubeConfigured: !!(config.YOUTUBE_CLIENT_ID && config.YOUTUBE_CLIENT_SECRET),
    tiktokConfigured: !!(config.TIKTOK_CLIENT_KEY && config.TIKTOK_CLIENT_SECRET),
    instagramConfigured: !!(config.FACEBOOK_APP_ID || config.INSTAGRAM_CLIENT_ID),
    connections,
  });
});

// ── OAuth Routes ──

router.get("/auth/youtube", requireLogin, (req, res) => {
  res.redirect(authService.getYouTubeAuthUrl());
});

router.get("/auth/youtube/callback", requireLogin, async (req, res) => {
  try {
    await authService.handleYouTubeCallback(req.query.code);
    res.redirect("/settings?message=YouTube account connected successfully");
  } catch (err) {
    console.error("YouTube Auth Error:", err);
    res.redirect(`/settings?error=YouTube connection failed: ${err.message}`);
  }
});


router.get("/auth/tiktok", requireLogin, (req, res) => {
  res.redirect(authService.getTikTokAuthUrl());
});

router.get("/auth/tiktok/callback", requireLogin, async (req, res) => {
  try {
    await authService.handleTikTokCallback(req.query.code);
    res.redirect("/settings?message=TikTok account connected successfully");
  } catch (err) {
    console.error("TikTok Auth Error:", err);
    res.redirect("/settings?error=TikTok connection failed");
  }
});

router.get("/auth/instagram", requireLogin, (req, res) => {
  res.redirect(authService.getInstagramAuthUrl());
});

router.get("/auth/instagram/callback", requireLogin, async (req, res) => {
  try {
    await authService.handleInstagramCallback(req.query.code);
    res.redirect("/settings?message=Instagram account(s) connected successfully");
  } catch (err) {
    console.error("Instagram Auth Error:", err);
    res.redirect("/settings?error=Instagram connection failed");
  }
});

router.post("/auth/disconnect/:id", requireLogin, (req, res) => {
  removeSocialConnection(req.params.id);
  res.redirect("/settings?message=Account disconnected");
});

// ── Schedule Page & APIs ──

router.get("/schedule", requireLogin, async (req, res) => {
  try {
    const connections = getAllSocialConnections();
    const readyJobs = getUnscheduledReadyJobs().map(job => {
      let thumbUrl = '/img/placeholder.jpg';
      if (job.thumbnail_path) {
        // Map absolute path to /v/ static route
        const relative = path.relative(config.OUTPUT_DIR, job.thumbnail_path);
        thumbUrl = '/v/' + relative.replace(/\\/g, '/');
      }
      return { ...job, thumbUrl };
    });

    const now = new Date();
    const future = new Date(now.getTime() + 65 * 60000);

    res.render("schedule", {
      activePage: "schedule",
      connections,
      readyJobs,
      path,
      future
    });
  } catch (err) {
    res.status(500).send("Error loading schedule: " + err.message);
  }
});

router.get("/api/scheduled-posts", requireLogin, (req, res) => {
  try {
    const posts = getAllScheduledPostsFull();
    res.json({ success: true, posts });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post("/api/schedule/create", requireLogin, (req, res) => {
  const { jobId, accountIds, publishDatetime } = req.body;
  if (!jobId || !accountIds || !Array.isArray(accountIds) || !publishDatetime) {
    return res.json({ success: false, error: "Missing fields or invalid accountIds" });
  }
  try {
    const pubDate = new Date(publishDatetime);
    const minDelay = 60 * 60 * 1000; // 1 saat
    if (pubDate.getTime() < Date.now() + minDelay) {
      return res.json({ success: false, error: "Scheduling requires at least 1 hour buffer from now." });
    }
    
    // Convert to UTC string format for SQLite: YYYY-MM-DD HH:mm:ss
    const adjustedPublishDatetime = pubDate.toISOString().replace('T', ' ').substring(0, 19);

    for (const accountId of accountIds) {
      const conn = getSocialConnection(accountId);
      if (conn) {
        createScheduledPost(jobId, conn.provider, adjustedPublishDatetime, accountId);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post("/api/schedule/update", requireLogin, (req, res) => {
  const { id, publishDatetime, accountId } = req.body;
  try {
    const updateData = {};
    if (publishDatetime) {
      const pubDate = new Date(publishDatetime);
      const minDelay = 60 * 60 * 1000; // 1 saat
      if (pubDate.getTime() < Date.now() + minDelay) {
        return res.json({ success: false, error: "Cannot schedule in the past or less than 1 hour from now." });
      }
      updateData.publish_datetime = publishDatetime;
    }
    if (accountId) {
      const conn = getSocialConnection(accountId);
      if (conn) {
        updateData.account_id = accountId;
        updateData.provider = conn.provider;
      }
    }
    updateScheduledPost(id, updateData);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post("/api/schedule/delete", requireLogin, (req, res) => {
  const { id } = req.body;
  try {
    deleteScheduledPost(id);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post("/api/upload-to-channels", requireLogin, async (req, res) => {
  const { jobId, accountIds } = req.body;

  if (!jobId || !accountIds || !Array.isArray(accountIds)) {
    return res.status(400).json({ error: "Job ID and account IDs are required" });
  }

  const job = getJob(jobId);
  if (!job || !job.video_path) {
    return res.status(404).json({ error: "Job or video not found" });
  }

  const results = [];
  for (const accId of accountIds) {
    const account = getSocialConnection(accId);
    if (!account) {
      results.push({ accountId: accId, status: "error", message: "Account not found" });
      continue;
    }

    try {
      const finalDescription = job.video_description || job.script_text;
      const finalTags = job.video_tags ? job.video_tags.split(",").map(t => t.trim()) : [];

      if (account.provider === "youtube") {
        platformJobId = await uploadToYoutube(account, job.video_path, job.video_title, finalDescription, finalTags);
      } else if (account.provider === "tiktok") {
        platformJobId = await uploadToTiktok(account, job.video_path, job.video_title);
      } else if (account.provider === "instagram") {
        platformJobId = await uploadToInstagram(account, job.video_path, finalDescription);
      }

      results.push({ accountId: accId, platform: account.provider, status: "success", platformJobId });
    } catch (err) {
      console.error(`Upload error for account ${accId}:`, err);
      results.push({ accountId: accId, platform: account.provider, status: "error", message: err.message });
    }
  }

  res.json({ success: true, results });
});


router.get("/api/outros", requireLogin, (req, res) => {
  res.json(getOutroFiles());
});

router.get("/outro/:filename", requireLogin, (req, res) => {
  const filePath = path.join(OUTRO_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send("Not found");
  res.sendFile(filePath);
});

// ── Scheduler API ──

router.post("/api/schedule", requireLogin, (req, res) => {
  const { jobId, provider, publishDatetime } = req.body;
  if (!jobId || !provider || !publishDatetime) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // Check if job exists
  const job = getJob(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  try {
    // Add 30 minutes
    const pubDate = new Date(publishDatetime);
    pubDate.setHours(pubDate.getHours() + 1);
    
    // Convert to UTC string format for SQLite: YYYY-MM-DD HH:mm:ss
    const adjustedPublishDatetime = pubDate.toISOString().replace('T', ' ').substring(0, 19);

    const id = createScheduledPost(jobId, provider, adjustedPublishDatetime);
    res.json({ success: true, id });
  } catch (err) {
    console.error("Scheduler error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
