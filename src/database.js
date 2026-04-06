const Database = require("better-sqlite3");
const path = require("path");
const config = require("./config");

const DB_PATH = path.join(config.BASE_DIR, "autoshorts.db");

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}

function initDb() {
  const conn = getDb();

  // Tasks tablosu
  conn.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      theme TEXT,
      language TEXT DEFAULT 'tr',
      voice TEXT,
      duration_preset TEXT DEFAULT '30-60s',
      orientation TEXT DEFAULT 'vertical',
      use_outro INTEGER DEFAULT 1,
      outro_video TEXT,
      outro_text TEXT,
      use_subtitles INTEGER DEFAULT 1,
      use_tts INTEGER DEFAULT 1,
      use_bgmusic INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Jobs tablosu
  conn.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      telegram_message_id TEXT,
      telegram_chat_id TEXT,
      news_text TEXT NOT NULL,
      language TEXT,
      voice TEXT,
      duration_preset TEXT,
      orientation TEXT,
      use_outro INTEGER,
      outro_video TEXT,
      outro_text TEXT,
      use_subtitles INTEGER,
      use_tts INTEGER,
      use_bgmusic INTEGER,
      status TEXT DEFAULT 'pending',
      script_text TEXT,
      keywords TEXT,
      video_title TEXT,
      video_path TEXT,
      thumbnail_path TEXT,
      video_description TEXT,
      video_tags TEXT,
      error TEXT,
      step TEXT,
      step_progress INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);

  // Settings tablosu
  conn.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Social Connections tablosu (Updated for multiple accounts)
  conn.exec(`
    CREATE TABLE IF NOT EXISTS social_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      account_name TEXT,
      platform_account_id TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at DATETIME,
      additional_data TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: if provider was PK, we need to handle it. 
  // However, for simplicity in SQLite, we can just check if 'id' column exists.
  try {
    const info = conn.prepare("PRAGMA table_info(social_connections)").all();
    const hasId = info.some(c => c.name === 'id');
    if (!hasId) {
      console.log("Migrating social_connections table...");
      // Backup old data
      const oldData = conn.prepare("SELECT * FROM social_connections").all();
      conn.exec("DROP TABLE social_connections");
      // Re-create with new schema
      conn.exec(`
        CREATE TABLE IF NOT EXISTS social_connections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          account_name TEXT,
          platform_account_id TEXT,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expires_at DATETIME,
          additional_data TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // Restore old data (mapping provider as account_name if needed)
      const insert = conn.prepare("INSERT INTO social_connections (provider, account_name, access_token, refresh_token, expires_at, additional_data) VALUES (?, ?, ?, ?, ?, ?)");
      for (const row of oldData) {
        insert.run(row.provider, row.account_name || row.provider, row.access_token, row.refresh_token, row.expires_at, row.additional_data);
      }
    }
  } catch (e) {
    console.error("Migration error:", e);
  }

  // Scheduled Posts tablosu
  conn.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      provider TEXT,
      publish_datetime DATETIME,
      status TEXT DEFAULT 'scheduled',
      error TEXT,
      platform_job_id TEXT,
      platform_url TEXT,
      account_id INTEGER, -- Added account_id reference
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id),
      FOREIGN KEY (account_id) REFERENCES social_connections(id)
    )
  `);

  // Migration for scheduled_posts: add account_id and platform_url if they don't exist
  try { conn.exec("ALTER TABLE scheduled_posts ADD COLUMN account_id INTEGER"); } catch (e) { }
  try { conn.exec("ALTER TABLE scheduled_posts ADD COLUMN platform_url TEXT"); } catch (e) { }

  // Migration: add new columns if they don't exist (for existing DBs)

  const jobCols = ["voice", "duration_preset", "script_text", "keywords", "video_title", "use_outro", "step", "step_progress", "outro_text", "outro_video", "task_id", "orientation", "use_subtitles", "use_tts", "use_bgmusic"];
  for (const col of jobCols) {
    try { conn.exec(`ALTER TABLE jobs ADD COLUMN ${col} TEXT`); } catch (e) { /* already exists */ }
  }
  const taskCols = ["use_subtitles", "use_tts", "use_bgmusic"];
  for (const col of taskCols) {
    try { conn.exec(`ALTER TABLE tasks ADD COLUMN ${col} INTEGER DEFAULT 1`); } catch (e) { /* already exists */ }
  }
}

// ── Tasks ──

function createTask(opts = {}) {
  const conn = getDb();
  const stmt = conn.prepare(
    "INSERT INTO tasks (name, theme, language, voice, duration_preset, orientation, use_outro, outro_video, outro_text, use_subtitles, use_tts, use_bgmusic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const result = stmt.run(
    opts.name || "New Task",
    opts.theme || null,
    opts.language || "tr",
    opts.voice || null,
    opts.durationPreset || "30-60s",
    opts.orientation || "vertical",
    opts.useOutro !== undefined ? (opts.useOutro ? 1 : 0) : 1,
    opts.outroVideo || null,
    opts.outroText || null,
    opts.useSubtitles !== undefined ? (opts.useSubtitles ? 1 : 0) : 1,
    opts.useTts !== undefined ? (opts.useTts ? 1 : 0) : 1,
    opts.useBgmusic !== undefined ? (opts.useBgmusic ? 1 : 0) : 1
  );
  return result.lastInsertRowid;
}

function updateTask(taskId, fields) {
  const conn = getDb();
  fields.updated_at = new Date().toISOString();
  const keys = Object.keys(fields);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  conn.prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`).run(...values, taskId);
}

function getTask(taskId) {
  const conn = getDb();
  return conn.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
}

function getAllTasks(limit = 50) {
  const conn = getDb();
  return conn.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?").all(limit);
}

function deleteTask(taskId) {
  const conn = getDb();
  conn.prepare("DELETE FROM jobs WHERE task_id = ?").run(taskId);
  conn.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
}

function getTaskJobCounts() {
  const conn = getDb();
  const rows = conn.prepare("SELECT task_id, COUNT(*) as count FROM jobs WHERE task_id IS NOT NULL GROUP BY task_id").all();
  const map = {};
  for (const r of rows) map[r.task_id] = r.count;
  return map;
}

// ── Jobs ──

function createJob(newsText, opts = {}) {
  const conn = getDb();
  const stmt = conn.prepare(
    "INSERT INTO jobs (news_text, task_id, telegram_message_id, telegram_chat_id, language, voice, duration_preset, orientation, use_outro, outro_text, outro_video, use_subtitles, use_tts, use_bgmusic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const result = stmt.run(
    newsText,
    opts.taskId || null,
    opts.telegramMessageId || null,
    opts.telegramChatId || null,
    opts.language || null,
    opts.voice || null,
    opts.durationPreset || null,
    opts.orientation || null,
    opts.useOutro !== undefined ? (opts.useOutro ? 1 : 0) : null,
    opts.outroText || null,
    opts.outroVideo || null,
    opts.useSubtitles !== undefined ? (opts.useSubtitles ? 1 : 0) : null,
    opts.useTts !== undefined ? (opts.useTts ? 1 : 0) : null,
    opts.useBgmusic !== undefined ? (opts.useBgmusic ? 1 : 0) : null
  );
  return result.lastInsertRowid;
}

function updateJob(jobId, fields) {
  const conn = getDb();
  fields.updated_at = new Date().toISOString();
  const keys = Object.keys(fields);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  conn.prepare(`UPDATE jobs SET ${setClause} WHERE id = ?`).run(...values, jobId);
}

function getJob(jobId) {
  const conn = getDb();
  return conn.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
}

function getJobsByTask(taskId) {
  const conn = getDb();
  return conn.prepare("SELECT * FROM jobs WHERE task_id = ? ORDER BY created_at DESC").all(taskId);
}

function getAllJobs(limit = 50) {
  const conn = getDb();
  return conn.prepare(`
    SELECT j.*, t.name as task_name 
    FROM jobs j 
    LEFT JOIN tasks t ON j.task_id = t.id 
    ORDER BY j.created_at DESC LIMIT ?
  `).all(limit);
}

function getFilteredJobs(filters = {}, limit = 100) {
  const conn = getDb();
  let sql = `
    SELECT j.*, t.name as task_name 
    FROM jobs j 
    LEFT JOIN tasks t ON j.task_id = t.id
  `;
  const params = [];
  const clauses = [];

  if (filters.task_id) {
    clauses.push("task_id = ?");
    params.push(filters.task_id);
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }

  if (clauses.length > 0) {
    sql += " WHERE " + clauses.map(c => "j." + c).join(" AND ");
  }

  sql += " ORDER BY j.created_at DESC LIMIT ?";
  params.push(limit);

  return conn.prepare(sql).all(...params);
}

function getReadyJobs() {
  const conn = getDb();
  return conn.prepare(`
    SELECT j.*, t.name as task_name 
    FROM jobs j 
    LEFT JOIN tasks t ON j.task_id = t.id 
    WHERE j.status IN ('ready', 'posted') 
    ORDER BY j.created_at DESC
  `).all();
}

function getUnscheduledReadyJobs() {
  const conn = getDb();
  return conn.prepare(`
    SELECT j.*, t.name as task_name 
    FROM jobs j 
    LEFT JOIN tasks t ON j.task_id = t.id
    WHERE j.status IN ('ready', 'posted') 
    AND j.id NOT IN (SELECT job_id FROM scheduled_posts)
    ORDER BY j.created_at DESC
  `).all();
}

/**
 * Job'un efektif ayarlarını döndürür.
 * Job'da null olan alanlar task'tan miras alınır.
 */
function getJobEffectiveSettings(job, task) {
  return {
    language: job.language || (task && task.language) || "tr",
    voice: job.voice || (task && task.voice) || null,
    duration_preset: job.duration_preset || (task && task.duration_preset) || "30-60s",
    orientation: job.orientation || (task && task.orientation) || "vertical",
    use_outro: job.use_outro !== null && job.use_outro !== undefined ? job.use_outro : (task ? task.use_outro : 1),
    outro_video: job.outro_video || (task && task.outro_video) || null,
    outro_text: job.outro_text || (task && task.outro_text) || null,
    use_subtitles: job.use_subtitles !== null && job.use_subtitles !== undefined ? job.use_subtitles : (task ? task.use_subtitles : 1),
    use_tts: job.use_tts !== null && job.use_tts !== undefined ? job.use_tts : (task ? task.use_tts : 1),
    use_bgmusic: job.use_bgmusic !== null && job.use_bgmusic !== undefined ? job.use_bgmusic : (task ? task.use_bgmusic : 1),
    theme: (task && task.theme) || null,
  };
}

function getStats() {
  const jobs = getAllJobs(1000);
  return {
    total: jobs.length,
    completed: jobs.filter((j) => ["ready", "posted"].includes(j.status)).length,
    failed: jobs.filter((j) => j.status === "failed").length,
    pending: jobs.filter((j) => ["pending", "processing", "awaiting_approval"].includes(j.status)).length,
  };
}

// ── Global Ayarlar (Settings KV Store) ──

function getSetting(key, defaultValue = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

// ── Social Connections ──

function getSocialConnection(id) {
  const conn = getDb();
  return conn.prepare("SELECT * FROM social_connections WHERE id = ?").get(id);
}

function getSocialConnectionsByProvider(provider) {
  const conn = getDb();
  return conn.prepare("SELECT * FROM social_connections WHERE provider = ?").all(provider);
}

function setSocialConnection(provider, platformAccountId, accountName, accessToken, refreshToken, expiresAt = null, additionalData = null) {
  const conn = getDb();

  // platform_account_id bazında update veya insert
  const existing = conn.prepare("SELECT id FROM social_connections WHERE provider = ? AND platform_account_id = ?").get(provider, platformAccountId);

  if (existing) {
    conn.prepare(`
      UPDATE social_connections SET
        account_name = ?,
        access_token = ?,
        refresh_token = ?,
        expires_at = ?,
        additional_data = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(accountName, accessToken, refreshToken, expiresAt, additionalData, existing.id);
    return existing.id;
  } else {
    const result = conn.prepare(`
      INSERT INTO social_connections (provider, platform_account_id, account_name, access_token, refresh_token, expires_at, additional_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(provider, platformAccountId, accountName, accessToken, refreshToken, expiresAt, additionalData);
    return result.lastInsertRowid;
  }
}

function removeSocialConnection(id) {
  const conn = getDb();
  conn.prepare("DELETE FROM social_connections WHERE id = ?").run(id);
}

function getAllSocialConnections() {
  const conn = getDb();
  return conn.prepare("SELECT * FROM social_connections ORDER BY provider, account_name").all();
}

// ── Scheduled Posts ──

function createScheduledPost(jobId, provider, publishDatetime, accountId = null) {
  const conn = getDb();
  const stmt = conn.prepare(`
    INSERT INTO scheduled_posts (job_id, provider, publish_datetime, account_id, status)
    VALUES (?, ?, ?, ?, 'scheduled')
  `);
  const result = stmt.run(jobId, provider, publishDatetime, accountId);
  return result.lastInsertRowid;
}

function getPendingScheduledPosts() {
  const conn = getDb();
  // 'now' saat dilimi veritabanında UTC olabilir, publish_datetime da UTC kaydedilmeli.
  return conn.prepare("SELECT * FROM scheduled_posts WHERE status = 'scheduled' AND publish_datetime <= datetime('now')").all();
}

function updateScheduledPost(id, fields) {
  const conn = getDb();
  fields.updated_at = new Date().toISOString();
  const keys = Object.keys(fields);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  conn.prepare(`UPDATE scheduled_posts SET ${setClause} WHERE id = ?`).run(...values, id);
}

function deleteScheduledPost(id) {
  const conn = getDb();
  conn.prepare("DELETE FROM scheduled_posts WHERE id = ?").run(id);
}

function getAllScheduledPostsFull() {
  const conn = getDb();
  return conn.prepare(`
    SELECT 
      sp.*, 
      j.video_title, j.video_path,
      sc.account_name, sc.provider as account_provider
    FROM scheduled_posts sp
    LEFT JOIN jobs j ON sp.job_id = j.id
    LEFT JOIN social_connections sc ON sp.account_id = sc.id
    ORDER BY sp.publish_datetime ASC
  `).all();
}

function getRecentScheduledPostsFull(limit = 10) {
  const conn = getDb();
  return conn.prepare(`
    SELECT 
      sp.*, 
      j.video_title, j.video_path,
      sc.account_name, sc.provider as account_provider
    FROM scheduled_posts sp
    LEFT JOIN jobs j ON sp.job_id = j.id
    LEFT JOIN social_connections sc ON sp.account_id = sc.id
    ORDER BY sp.updated_at DESC
    LIMIT ?
  `).all(limit);
}

function getScheduledPostsForJob(jobId) {
  const conn = getDb();
  return conn.prepare("SELECT * FROM scheduled_posts WHERE job_id = ?").all(jobId);
}


module.exports = {
  initDb, getDb,
  createTask, updateTask, getTask, getAllTasks, deleteTask, getTaskJobCounts,
  createJob, updateJob, getJob, getJobsByTask, getAllJobs, getJobEffectiveSettings,
  getStats, getSetting, setSetting,
  getSocialConnection, getSocialConnectionsByProvider, setSocialConnection, removeSocialConnection, getAllSocialConnections,
  createScheduledPost, getPendingScheduledPosts, updateScheduledPost, deleteScheduledPost, getScheduledPostsForJob, getAllScheduledPostsFull, getRecentScheduledPostsFull,
  getReadyJobs, getUnscheduledReadyJobs, getFilteredJobs
};
