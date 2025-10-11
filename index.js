const { Telegraf } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);
const sessions = {}; // simple in-memory session

module.exports = async (req, res) => {
  if (req.method === "POST") {
    const update = req.body;
    const chatId = update.message?.chat?.id;
    const text = update.message?.text;

    if (!chatId || !text) return res.status(200).send("ok");

    if (!sessions[chatId]) sessions[chatId] = { step: null, data: {} };
    const session = sessions[chatId];

    if (text === "/start") {
      session.step = "name";
      session.data = {};
      await bot.telegram.sendMessage(chatId, "Welcome! What is your name?");
      return res.status(200).send("ok");
    }

    switch (session.step) {
      case "name":
        session.data.name = text;
        session.step = "email";
        await bot.telegram.sendMessage(chatId, "Enter your email:");
        break;

      case "email":
        session.data.email = text;
        session.step = "phone";
        await bot.telegram.sendMessage(chatId, "Enter your phone number:");
        break;

      case "phone":
        session.data.phone = text;
        session.data.chatId = chatId;
        session.step = null;

        try {
          await axios.post(
            `${process.env.BACKEND_URL}/setUserDetails`,
            session.data
          );
          await bot.telegram.sendMessage(
            chatId,
            "Thanks! Your details are saved."
          );
        } catch (err) {
          console.error(err);
          await bot.telegram.sendMessage(chatId, "Error saving details.");
        }
        break;

      default:
        await bot.telegram.sendMessage(chatId, "Type /start to begin.");
    }

    return res.status(200).send("ok");
  } else {
    return res.status(200).send("Bot running");
  }
};
