require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Bot, GrammyError, HttpError, Keyboard, InlineKeyboard, session } = require('grammy');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { logger } = require('./utils/logger');
const { updateUserData, recordUserInteraction, recordSocialNetworkRequest, recordPromoCodeRequest, isAdmin, createKeyboard, getUsageStats, getMessages } = require('./utils/helpers');
const { socialNetworks, promoCodes } = require('./utils/buttons');

const bot = new Bot(process.env.BOT_API_KEY);

bot.use(session({
  initial: () => ({})
}));

async function createTables(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    timesStarted INTEGER DEFAULT 0,
    lastSeen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    interactionTime TIMESTAMP
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS socialNetworkRequests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    networkName TEXT,
    requestTime TIMESTAMP
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS promoCodeRequests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    promoName TEXT,
    requestTime TIMESTAMP
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    message TEXT,
    media_type TEXT,
    media_id TEXT,
    replied INTEGER DEFAULT 0,
    first_name TEXT,
    username TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  logger.info('Tables created or already exist');
}

let db;
(async () => {
  const dbPath = './userData.db';

  const dbExists = fs.existsSync(dbPath);

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  if (!dbExists) {
    await createTables(db);
  }

  logger.info('Database initialized and connection established');
})();

bot.command('start', async (ctx) => {
  logger.info(`User ${ctx.from.id} started the bot`);
  await updateUserData(db, ctx.from.id);
  const startKeyboard = new Keyboard()
    .text('🧕 Предложка')
    .row()
    .text('📲 Социальные сети')
    .row()
    .text('📚 Полезные книги и источники')
    .row();
  await ctx.reply('Ас Салам Алейкум! Я бот помощник канала @Khalsiratii!');
  await ctx.reply('🧕 Предложка - тут ты можешь направить нам сообщение с вопросом или предложить новость для публикации на канале');
  await ctx.reply('📲 Социальные сети - мы во всех социальных сетях');
  await ctx.reply('📚 Полезные книги - полезные книги, которые укрепят твои знания');
  await ctx.reply('С чего начнем? Выбирай 👇', {
    reply_markup: startKeyboard,
  });
});

bot.command('admin', async (ctx) => {
  if (isAdmin(ctx.from.id, process.env.ADMIN_ID)) {
    const stats = await getUsageStats(db);
    let response = `Статистика использования бота:\nВсего запусков: ${stats.totalStarts}\nИспользовали бота сегодня: ${stats.todayStarts}\nВсего взаимодействий: ${stats.totalInteractions}\nВзаимодействий сегодня: ${stats.todayInteractions}\n\n`;

    response += 'Запросы на социальные сети:\n';
    for (const { networkName, total } of stats.totalSocialNetworkRequests) {
      const today = stats.todaySocialNetworkRequests.find(n => n.networkName === networkName)?.today || 0;
      response += `${networkName} - Всего: ${total}, Сегодня: ${today}\n`;
    }

    response += '\nЗапросы на книги:\n';
    for (const { promoName, total } of stats.totalPromoCodeRequests) {
      const today = stats.todayPromoCodeRequests.find(p => p.promoName === promoName)?.today || 0;
      response += `${promoName} - Всего: ${total}, Сегодня: ${today}\n`;
    }

    await ctx.reply(response);
  } else {
    await ctx.reply('У вас нет прав администратора!');
  }
});

bot.use(async (ctx, next) => {
  await recordUserInteraction(db, ctx.from.id);
  return next();
});

function handleButtonClicks(items, recordRequest) {
  items.forEach(item => {
    bot.hears(item.name, async (ctx) => {
      await recordUserInteraction(db, ctx.from.id);
      await recordRequest(db, ctx.from.id, item.name);
      let message = '';
      if (item.type === 'social') {
        message = `<b><i>Вот ссылка на ${item.name}:</i></b> ${item.url}`;
      } else if (item.type === 'promo') {
        message = `<b><i>Название:</i></b> ${item.name}\n\n<b><i>Автор:</i></b> ${item.author}\n\n<b><i>Описание:</i></b> ${item.description}\n\n<b><i>Страниц:</i></b> ${item.list}\n\n<b><i>Ссылка:</i></b> ${item.url}`;
      }
      await ctx.reply(message, { parse_mode: 'HTML' });
    });
  });
}

handleButtonClicks(socialNetworks, recordSocialNetworkRequest);
handleButtonClicks(promoCodes, recordPromoCodeRequest);

bot.hears('📲 Социальные сети', async (ctx) => {
  const socialKeyboard = createKeyboard(socialNetworks);
  await ctx.reply('Выберите социальную сеть:', {
    reply_markup: socialKeyboard,
  });
});

bot.hears('📚 Полезные книги и источники', async (ctx) => {
  const promoKeyboard = createKeyboard(promoCodes);
  await ctx.reply('Выберите категорию книг:', {
    reply_markup: promoKeyboard,
  });
});

bot.hears('Назад ↩️', async (ctx) => {
  const startKeyboard = new Keyboard()
    .text('🧕 Предложка')
    .row()
    .text('📲 Социальные сети')
    .row()
    .text('📚 Полезные книги и источники')
    .row();
  await ctx.reply('Выберите действие:', {
    reply_markup: startKeyboard,
  });
});

let suggestionClicked = {};
let unreadMessagesCount = 0;

bot.hears('🧕 Предложка', async (ctx) => {
  if (isAdmin(ctx.from.id, process.env.ADMIN_ID)) {
    console.log('Admin accessed suggestions');
    const adminKeyboard = new Keyboard()
      .text('Все полученные сообщения')
      .row()
      .text('Сообщения без ответа')
      .row()
      .text('Назад ↩️')
      .row();
    await ctx.reply('Выберите действие:', {
      reply_markup: adminKeyboard,
    });
    suggestionClicked[ctx.from.id] = true;
  } else {
    suggestionClicked[ctx.from.id] = true;
    await ctx.reply('Опишите ваше предложение или сообщение, которое вы хотели бы отправить автору бота.');
  }
});

bot.hears('Все полученные сообщения', async (ctx) => {
  if (!isAdmin(ctx.from.id, process.env.ADMIN_ID)) return;
  const messages = await getMessages(db);
  if (messages.length === 0) {
    await ctx.reply('Сообщений нет.');
  } else {
    for (const message of messages) {
      const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply-${message.id}`);
      const userInfo = `Сообщение от ${message.first_name} (@${message.username}, ID: ${message.userId})`;

      if (message.message) {
        await ctx.reply(`${userInfo}: ${message.message}`, { reply_markup: inlineKeyboard });
      } else {
        const mediaType = message.media_type;
        if (mediaType === 'photo') {
          await ctx.api.sendPhoto(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        } else if (mediaType === 'video') {
          await ctx.api.sendVideo(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        } else if (mediaType === 'document') {
          await ctx.api.sendDocument(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        } else if (mediaType === 'audio') {
          await ctx.api.sendAudio(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        } else if (mediaType === 'voice') {
          await ctx.api.sendVoice(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        } else if (mediaType === 'video_note') {
          await ctx.api.sendVideoNote(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        }
      }
    }
  }
});

bot.hears('Сообщения без ответа', async (ctx) => {
  if (!isAdmin(ctx.from.id, process.env.ADMIN_ID)) return;

  const messages = await getMessages(db, 0);

  if (messages.length === 0) {
    await ctx.reply('Сообщений без ответа нет.');
  } else {
    for (const message of messages) {
      const inlineKeyboard = new InlineKeyboard().text('Ответить', `reply-${message.id}`);
      const userInfo = `Сообщение от ${message.first_name} (@${message.username}, ID: ${message.userId})`;

      if (message.message) {
        await ctx.reply(`${userInfo}: ${message.message}`, { reply_markup: inlineKeyboard });
      } else {
        const mediaType = message.media_type;
        if (mediaType === 'photo') {
          await ctx.api.sendPhoto(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        } else if (mediaType === 'video') {
          await ctx.api.sendVideo(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        } else if (mediaType === 'document') {
          await ctx.api.sendDocument(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        } else if (mediaType === 'audio') {
          await ctx.api.sendAudio(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        } else if (mediaType === 'voice') {
          await ctx.api.sendVoice(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        } else if (mediaType === 'video_note') {
          await ctx.api.sendVideoNote(ctx.chat.id, message.media_id, {
            caption: userInfo,
            reply_markup: inlineKeyboard
          });
        }
      }
    }
  }
});

bot.on('message', async (ctx) => {
  const authorId = process.env.ADMIN_ID;
  const fromId = ctx.from.id.toString();

  console.log(`unreadMessagesCount: ${unreadMessagesCount}`);
  console.log(`fromId: ${fromId}, authorId: ${authorId}`);

  if (fromId === authorId && ctx.session.replyToUser) {
    const targetMessageId = ctx.session.replyToMessageId;

    await db.run(`UPDATE messages SET replied = 1 WHERE id = ?`, [targetMessageId]);
    await ctx.api.sendMessage(ctx.session.replyToUser, 'На ваше сообщение получен ответ от админа канала.');

    if (ctx.message.text) {
      await ctx.api.sendMessage(ctx.session.replyToUser, ctx.message.text);
    } else if (ctx.message.voice) {
      await ctx.api.sendVoice(ctx.session.replyToUser, ctx.message.voice.file_id);
    } else if (ctx.message.video) {
      await ctx.api.sendVideo(ctx.session.replyToUser, ctx.message.video.file_id);
    } else if (ctx.message.photo) {
      const photo = ctx.message.photo.pop();
      await ctx.api.sendPhoto(ctx.session.replyToUser, photo.file_id);
    } else if (ctx.message.audio) {
      await ctx.api.sendAudio(ctx.session.replyToUser, ctx.message.audio.file_id);
    } else if (ctx.message.document) {
      await ctx.api.sendDocument(ctx.session.replyToUser, ctx.message.document.file_id);
    } else if (ctx.message.video_note) {
      await ctx.api.sendVideoNote(ctx.session.replyToUser, ctx.message.video_note.file_id);
    }

    await ctx.reply('Ответ направлен.');
    ctx.session.replyToUser = undefined;
    ctx.session.replyToMessageId = undefined;

    if (unreadMessagesCount > 0) {
      unreadMessagesCount--;
    }
    return;
  }

  if (suggestionClicked[fromId]) {
    console.log('User sent a suggestion.');
    let mediaType = '';
    let mediaId = '';

    if (ctx.message.text) {
      await db.run(`INSERT INTO messages (userId, message, first_name, username) VALUES (?, ?, ?, ?)`, 
                   [ctx.from.id, ctx.message.text, ctx.from.first_name, ctx.from.username]);
    } else {
      if (ctx.message.photo) {
        const photo = ctx.message.photo.pop();
        mediaType = 'photo';
        mediaId = photo.file_id;
      } else if (ctx.message.video) {
        mediaType = 'video';
        mediaId = ctx.message.video.file_id;
      } else if (ctx.message.document) {
        mediaType = 'document';
        mediaId = ctx.message.document.file_id;
      } else if (ctx.message.audio) {
        mediaType = 'audio';
        mediaId = ctx.message.audio.file_id;
      } else if (ctx.message.voice) {
        mediaType = 'voice';
        mediaId = ctx.message.voice.file_id;
      } else if (ctx.message.video_note) {
        mediaType = 'video_note';
        mediaId = ctx.message.video_note.file_id;
      }

      await db.run(`INSERT INTO messages (userId, media_type, media_id, first_name, username) VALUES (?, ?, ?, ?, ?)`,
                   [ctx.from.id, mediaType, mediaId, ctx.from.first_name, ctx.from.username]);
    }

    await ctx.reply('Ваше сообщение успешно отправлено автору бота');
    suggestionClicked[fromId] = false;

    unreadMessagesCount++;
    console.log(`Admin notified, new unreadMessagesCount: ${unreadMessagesCount}`);
    await ctx.api.sendMessage(authorId, `Вам пришло сообщение. Неотвеченных сообщений: ${unreadMessagesCount}`);
  } else {
    if (fromId !== authorId) {
      console.log('User is not admin and did not click suggestion.');
      await ctx.reply('Пожалуйста, сначала нажмите кнопку "Предложка" для отправки сообщения автору канала!');
    } else {
      console.log('Admin received a new message.');
      unreadMessagesCount++;
      console.log(`Admin notified, new unreadMessagesCount: ${unreadMessagesCount}`);
      await ctx.api.sendMessage(authorId, `Вам пришло сообщение. Неотвеченных сообщений: ${unreadMessagesCount}`);
    }
  }
});

bot.callbackQuery(/^reply-(\d+)$/, async (ctx) => {
  const targetMessageId = ctx.match[1];
  const targetMessage = await db.get('SELECT userId FROM messages WHERE id = ?', [targetMessageId]);

  if (targetMessage) {
    ctx.session.replyToUser = targetMessage.userId;
    ctx.session.replyToMessageId = targetMessageId;
    await ctx.answerCallbackQuery('Вы можете ответить текстом, аудио, видео или фото.');
  } else {
    await ctx.answerCallbackQuery('Сообщение не найдено.', { show_alert: true });
  }
});

bot.catch((err) => {
  const ctx = err.ctx;
  logger.error(`Error while handling update ${ctx.update.update_id}:`, err);
});

bot.start();