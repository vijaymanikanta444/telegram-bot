import { userStates } from "../states/userStates.js";
import { sendMessage, sendMessageWithButton } from "../utils/telegram.js";
import {
  isValidEmail,
  isValidPhone,
  isValidBirthday,
} from "../utils/validators.js";
import axios from "axios";

export default async function handler(req, res) {
  // Parse body safely
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.statusCode = 400;
      res.end("Invalid JSON");
      return;
    }
  }

  if (!body) {
    res.statusCode = 200;
    res.end("No body");
    return;
  }

  // Handle callback_query (inline buttons)
  if (body.callback_query) {
    await handleCallback(body.callback_query);
    res.statusCode = 200;
    res.end("OK");
    return;
  }

  // Handle normal messages
  if (req.method === "POST" && body.message) {
    await handleMessage(body.message);
    res.statusCode = 200;
    res.end("OK");
  } else {
    res.statusCode = 200;
    res.end("Telegram bot webhook running 🚀");
  }
}

// ---------------- Handlers ----------------

async function handleCallback(callback) {
  const chatId = callback.from.id;
  const data = callback.data;

  if (data === "no_email") {
    const userState = userStates.get(chatId);
    if (userState) {
      userState.email = null;
      userState.step = "askPhone";
      await sendMessage(
        chatId,
        "📱 Please enter your phone number (digits only):"
      );
    }

    // Answer callback to remove Telegram loading spinner
    await axios.post(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerCallbackQuery`,
      { callback_query_id: callback.id }
    );
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text?.trim();
  let userState = userStates.get(chatId);

  if (text === "/start") {
    userStates.set(chatId, { step: "askName" });
    await sendMessage(chatId, "👋 Welcome! What's your *name*?");
    return;
  }

  if (!userState) return; // No active flow

  // ---------------- Flow Steps ----------------
  switch (userState.step) {
    case "askName":
      userState.name = text;
      userState.step = "askEmail";
      await sendMessageWithButton(chatId, "📧 Please enter your email:", [
        { text: "No email", callback_data: "no_email" },
      ]);
      break;

    case "askEmail":
      if (text !== "No email" && !isValidEmail(text)) {
        await sendMessageWithButton(
          chatId,
          "❌ Invalid email. Enter valid or 'No email':",
          [{ text: "No email", callback_data: "no_email" }]
        );
        return;
      }
      userState.email = text === "No email" ? null : text;
      userState.step = "askPhone";
      await sendMessage(
        chatId,
        "📱 Please enter your phone number (digits only):"
      );
      break;

    case "askPhone":
      if (!isValidPhone(text)) {
        await sendMessage(
          chatId,
          "❌ Invalid phone number. Enter 7-15 digits."
        );
        return;
      }
      userState.phone = text;
      userState.step = "askBirthday";
      await sendMessage(
        chatId,
        "🎂 Enter your birthday in `DD-MM` format (e.g., 25-12):"
      );
      break;

    case "askBirthday":
      const [day, month] = text.split("-").map(Number);
      if (!day || !month || !isValidBirthday(day, month)) {
        await sendMessage(chatId, "❌ Invalid birthday format. Use `DD-MM`.");
        return;
      }
      userState.birthdayDay = day;
      userState.birthdayMonth = month;

      // Save to backend
      try {
        await axios.post(`${process.env.BACKEND_URL}/createUser`, {
          chatId,
          name: userState.name,
          email: userState.email,
          phone: userState.phone,
          birthdayDay: userState.birthdayDay,
          birthdayMonth: userState.birthdayMonth,
        });
        await sendMessage(
          chatId,
          "✅ Your details have been saved. Thank you!"
        );
        userStates.delete(chatId);
      } catch (err) {
        console.error("Error saving user:", err.response?.data || err.message);
        await sendMessage(chatId, "⚠️ Something went wrong. Try again later.");
      }
      break;
  }
}
