const express = require("express");
const session = require("express-session");
const path = require("path");
const config = require("./src/config");
const { initDb } = require("./src/database");
const routes = require("./src/routes");

// DB başlat
initDb();

const fs = require("fs");
const tempDir = path.join(config.BASE_DIR, "temp");
if (fs.existsSync(tempDir)) {
  console.log("Sunucu başlıyor: Eski geçici (temp) dosyalar temizleniyor...");
  fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir, { recursive: true });

const app = express();

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/v", express.static(config.OUTPUT_DIR));
const SQLiteStore = require("connect-sqlite3")(session);

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.db", dir: "./" }),
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 gün
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);


// Routes
app.use("/", routes);

// Server başlat
app.listen(config.PORT, () => {
  console.log(`Dashboard: http://localhost:${config.PORT}`);
});

// Telegram bot (opsiyonel)
if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_BOT_TOKEN !== "your_telegram_bot_token") {
  const { startBot } = require("./src/bot");
  startBot();
} else {
  console.log("Telegram bot devre dışı (TELEGRAM_BOT_TOKEN ayarlanmamış)");
}

// Zamanlayıcıyı (Publisher Cron) başlat
const { startScheduler } = require("./src/scheduler");
startScheduler();

// Bekleyen işleri kurtar
const { getAllJobs, getJob } = require("./src/database");
const { processJob } = require("./src/pipeline");
const { notifyJobResult } = require("./src/bot");

const recoverJobs = async () => {
  // PENDING veya PROCESSING durumundaki işleri bul
  const jobs = getAllJobs(500).filter(j => ["pending", "processing"].includes(j.status));
  if (jobs.length > 0) {
    console.log(`Sunucu Reboot: ${jobs.length} adet yarım kalan iş kuyruğa geri ekleniyor...`);
    for (const job of jobs) {
      // Background'da kuyruğa ekle
      processJob(job.id)
        .then((videoPath) => {
          const updatedJob = getJob(job.id);
          notifyJobResult(updatedJob, videoPath, null);
        })
        .catch((err) => {
          const updatedJob = getJob(job.id);
          notifyJobResult(updatedJob, null, err);
        });
    }
  }
};

setTimeout(recoverJobs, 5000); // 5 saniye bekle (bot başlasın)
