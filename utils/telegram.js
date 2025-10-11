import axios from "axios";

export async function sendMessage(chatId, text) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
      { chat_id: chatId, text, parse_mode: "Markdown" }
    );
  } catch (err) {
    console.error("Error sending message:", err.response?.data || err.message);
  }
}

export async function sendMessageWithButton(chatId, text, buttons) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [buttons] },
      }
    );
  } catch (err) {
    console.error(
      "Error sending message with button:",
      err.response?.data || err.message
    );
  }
}
