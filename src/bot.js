const TelegramBot = require("node-telegram-bot-api");
const config = require("./config");
const { createJob, getJob, updateJob, getAllJobs, getSetting, setSetting, getAllTasks, getTask } = require("./database");
const { processJob } = require("./pipeline");
const { LANGUAGES } = require("./languages");

let bot;

// Kullanıcı bazlı geçici state
const userState = new Map();

function startBot() {
  bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      "AutoShorts Bot'a hoş geldiniz!\nİçerik metnini gönderin, short video oluşturulsun.\n\nKomutlar:\n/jobs - Aktif işleri listele\n/cancel <ID> - Bekleyen/işlenen işi iptal et\n/retry <ID> - Başarısız işi tekrar dene"
    );
  });

  bot.onText(/\/jobs/, (msg) => {
    setSetting("admin_chat_id", String(msg.chat.id));
    const jobs = getAllJobs(100);
    const active = jobs.filter(j => ["pending", "processing", "awaiting_approval"].includes(j.status));
    if (!active.length) {
      return bot.sendMessage(msg.chat.id, "Aktif iş bulunmuyor.");
    }
    const txt = active.map(j => `ID: ${j.id} | Durum: ${j.status} | Adım: ${j.step || 'yok'} (${j.step_progress || 0}%)`).join("\n");
    bot.sendMessage(msg.chat.id, `Aktif İşler:\n\n${txt}`);
  });

  bot.onText(/\/cancel (.+)/, (msg, match) => {
    setSetting("admin_chat_id", String(msg.chat.id));
    const jobId = parseInt(match[1]);
    const job = getJob(jobId);
    if (!job) return bot.sendMessage(msg.chat.id, `İş #${jobId} bulunamadı.`);
    if (["pending", "processing"].includes(job.status)) {
      updateJob(jobId, { status: "failed", error: "Manuel iptal (Telegram)" });
      bot.sendMessage(msg.chat.id, `✅ İş #${jobId} iptal edildi.`);
    } else {
      bot.sendMessage(msg.chat.id, `İş #${jobId} şu an iptal edilebilir durumda değil (${job.status}).`);
    }
  });

  bot.onText(/\/retry (.+)/, (msg, match) => {
    setSetting("admin_chat_id", String(msg.chat.id));
    const jobId = parseInt(match[1]);
    const job = getJob(jobId);
    if (!job) return bot.sendMessage(msg.chat.id, `İş #${jobId} bulunamadı.`);
    if (["failed", "rejected"].includes(job.status)) {
      updateJob(jobId, { status: "pending", error: null, video_path: null, step: null, step_progress: 0 });
      bot.sendMessage(msg.chat.id, `🔄 İş #${jobId} kuyruğa alındı...`);
      processJob(jobId, { skipScript: true }).catch((err) => console.error("retry fail", err));
    } else {
      bot.sendMessage(msg.chat.id, `İş #${jobId} sadece failed/rejected durumundayken tekrar başlatılabilir.`);
    }
  });


  // 1. Metin gelince → dil seçimi göster
  bot.on("message", (msg) => {
    setSetting("admin_chat_id", String(msg.chat.id));
  });

  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;

    const text = msg.text.trim();
    if (text.length < 10) {
      bot.sendMessage(msg.chat.id, "Lütfen en az 10 karakterlik bir metin gönderin.");
      return;
    }

    userState.set(msg.chat.id, {
      text,
      messageId: String(msg.message_id),
    });

    // Görev (Task) butonları
    const tasks = getAllTasks();
    if (tasks.length === 0) {
      bot.sendMessage(msg.chat.id, "Sistemde hiç görev (Task) bulunmuyor. Önce web panelinden bir Task oluşturun.");
      return;
    }

    const keyboard = [];
    for (let i = 0; i < tasks.length; i += 2) {
      const row = [{ text: tasks[i].name, callback_data: `task_${tasks[i].id}` }];
      if (tasks[i + 1]) {
        row.push({ text: tasks[i + 1].name, callback_data: `task_${tasks[i + 1].id}` });
      }
      keyboard.push(row);
    }

    bot.sendMessage(msg.chat.id, "Hangi göreve (Task) eklensin?", {
      reply_markup: { inline_keyboard: keyboard },
    });
  });

  // Callback handler
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith("task_")) {
      await handleTaskSelection(chatId, query);
    } else if (data.startsWith("approve_")) {
      await handleApprove(chatId, query);
    } else if (data.startsWith("retry_")) {
      await handleRetry(chatId, query);
    }
  });

  console.log("Telegram bot başlatıldı");
}

async function handleTaskSelection(chatId, query) {
  const taskId = parseInt(query.data.replace("task_", ""));
  const task = getTask(taskId);
  if (!task) return bot.answerCallbackQuery(query.id, { text: "Task bulunamadı." });

  const pending = userState.get(chatId);
  if (!pending) {
    bot.answerCallbackQuery(query.id, { text: "Önce bir metin gönderin." });
    return;
  }

  bot.answerCallbackQuery(query.id, { text: "Video hazırlanıyor..." });
  bot.editMessageText(
    `✓ Görev: ${task.name}\n\n⏳ Video hazırlanıyor...`,
    {
      chat_id: chatId,
      message_id: query.message.message_id,
    }
  );

  const jobId = createJob(pending.text, {
    telegramMessageId: pending.messageId,
    telegramChatId: String(chatId),
    taskId: task.id
  });

  userState.delete(chatId);

  try {
    const videoPath = await processJob(jobId);

    bot.sendVideo(chatId, videoPath, {
      caption: `🎬 Short #${jobId} hazır!\n\nBeğendiniz mi?`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Onayla", callback_data: `approve_${jobId}` },
            { text: "🔄 Tekrar Oluştur", callback_data: `retry_${jobId}` },
          ],
        ],
      },
    });
  } catch (err) {
    console.error(`Job ${jobId} failed:`, err);
    bot.sendMessage(chatId, `✗ İş #${jobId} başarısız: ${err.message}`);
  }
}

async function handleApprove(chatId, query) {
  const jobId = parseInt(query.data.replace("approve_", ""));
  const job = getJob(jobId);
  if (!job) return;

  bot.answerCallbackQuery(query.id, { text: "Onaylandı!" });

  bot.editMessageCaption(`✅ Short #${jobId} onaylandı!`, {
    chat_id: chatId,
    message_id: query.message.message_id,
  });

  updateJob(jobId, { status: "ready" });
}

async function handleRetry(chatId, query) {
  const jobId = parseInt(query.data.replace("retry_", ""));
  const job = getJob(jobId);
  if (!job) return;

  bot.answerCallbackQuery(query.id, { text: "Tekrar oluşturuluyor..." });

  bot.editMessageCaption(`🔄 Short #${jobId} tekrar oluşturuluyor...`, {
    chat_id: chatId,
    message_id: query.message.message_id,
  });

  const newJobId = createJob(job.news_text, {
    telegramMessageId: job.telegram_message_id,
    telegramChatId: String(chatId),
    language: job.language,
    voice: job.voice,
    durationPreset: job.duration_preset,
    useOutro: job.use_outro !== 0,
  });

  updateJob(jobId, { status: "rejected" });

  try {
    const videoPath = await processJob(newJobId);

    bot.sendVideo(chatId, videoPath, {
      caption: `🎬 Short #${newJobId} hazır! (yeniden oluşturuldu)\n\nBeğendiniz mi?`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Onayla", callback_data: `approve_${newJobId}` },
            { text: "🔄 Tekrar Oluştur", callback_data: `retry_${newJobId}` },
          ],
        ],
      },
    });
  } catch (err) {
    console.error(`Job ${newJobId} failed:`, err);
    bot.sendMessage(chatId, `✗ İş #${newJobId} başarısız: ${err.message}`);
  }
}

function getAdminChatId() {
  return getSetting("admin_chat_id", null);
}

async function notifyJobResult(job, videoPath, error) {
  if (!bot) return; // Bot başlatılmamışsa atla

  const chatId = job.telegram_chat_id || getAdminChatId() || config.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) return; // Hedef chat ID yoksa atla

  try {
    if (videoPath) {
      const title = job.video_title || `İş #${job.id}`;
      await bot.sendVideo(chatId, videoPath, {
        caption: `✅ *${title}*\n\nİş #${job.id} başarıyla tamamlandı.\nLütfen onaylayın veya reddedin.`,
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Onayla", callback_data: `approve_${job.id}` },
              { text: "🔄 Yeniden Üret", callback_data: `retry_${job.id}` },
            ],
          ],
        },
      });
    } else {
      const reason = error?.message || error || "Bilinmeyen hata";
      await bot.sendMessage(
        chatId,
        `❌ *İş #${job.id} başarısız*\n\nNeden: ${reason}`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (notifyErr) {
    console.error(`Telegram bildirim hatası (Job ${job.id}):`, notifyErr.message);
  }
}

module.exports = { startBot, getBot: () => bot, getAdminChatId, notifyJobResult };

