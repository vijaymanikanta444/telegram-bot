import { userStates } from "../states/userStates";
import { sendMessage, sendMessageWithButton } from "../utils/telegram";
import {
  isValidEmail,
  isValidPhone,
  isValidBirthday,
} from "../utils/validators";
import axios from "axios";

export default async function handler(req, res) {
  // Handle Telegram callback query (inline button clicks)
  if (req.body.callback_query) {
    const callbackQuery = req.body.callback_query;
    const chatId = callbackQuery.from.id;
    const data = callbackQuery.data;

    if (data === "no_email") {
      const userState = userStates.get(chatId);
      if (userState) {
        userState.email = null;
        userState.step = "askPhone";
        await sendMessage(
          chatId,
          "📱 Please enter your *phone number* (digits only, e.g., 9876543210):"
        );
      }

      // Answer callback to remove loading spinner
      await axios.post(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerCallbackQuery`,
        { callback_query_id: callbackQuery.id }
      );

      res.statusCode = 200;
      res.end("OK");
      return;
    }
  }

  // Handle normal messages
  if (req.method === "POST") {
    const { message } = req.body;
    console.log({ message });

    if (!message) {
      res.statusCode = 200;
      res.end("OK");
      return;
    }

    const chatId = message.chat.id;
    const text = message.text?.trim();

    if (text === "/start") {
      userStates.set(chatId, { step: "askName" });
      await sendMessage(chatId, "👋 Welcome! What's your *name*?");
    } else {
      const userState = userStates.get(chatId);

      // Ask Name
      if (userState?.step === "askName") {
        userState.name = text;
        userState.step = "askEmail";
        await sendMessageWithButton(
          chatId,
          "📧 Please enter your *email* (e.g., name@example.com):",
          [{ text: "No email", callback_data: "no_email" }]
        );

        // Ask Email
      } else if (userState?.step === "askEmail") {
        if (text !== "No email" && !isValidEmail(text)) {
          await sendMessageWithButton(
            chatId,
            "❌ Invalid email format. Enter a valid email or click 'No email':",
            [{ text: "No email", callback_data: "no_email" }]
          );
          res.statusCode = 200;
          res.end("OK");
          return;
        }

        userState.email = text === "No email" ? null : text;
        userState.step = "askPhone";
        await sendMessage(
          chatId,
          "📱 Please enter your *phone number* (digits only, e.g., 9876543210):"
        );

        // Ask Phone
      } else if (userState?.step === "askPhone") {
        if (!isValidPhone(text)) {
          await sendMessage(
            chatId,
            "❌ Invalid phone number. Enter digits only (7-15 digits, e.g., 9876543210):"
          );
          res.statusCode = 200;
          res.end("OK");
          return;
        }

        userState.phone = text;
        userState.step = "askBirthday";
        await sendMessage(
          chatId,
          "🎂 Enter your *birthday* in `DD-MM` format (e.g., 25-12 for 25th December):"
        );

        // Ask Birthday
      } else if (userState?.step === "askBirthday") {
        const [day, month] = text.split("-").map(Number);

        if (!day || !month || !isValidBirthday(day, month)) {
          await sendMessage(
            chatId,
            "❌ Invalid format. Enter your birthday in `DD-MM` format (e.g., 25-12):"
          );
          res.statusCode = 200;
          res.end("OK");
          return;
        }

        userState.birthdayDay = day;
        userState.birthdayMonth = month;

        // Call backend API to save user
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
          console.error(
            "Error saving user:",
            err.response?.data || err.message
          );
          await sendMessage(
            chatId,
            `⚠️ ${err.response?.data?.message || "Something went wrong"}`
          );
        }
      }
    }

    res.statusCode = 200;
    res.end("OK");
  } else {
    res.statusCode = 200;
    res.end("Telegram bot webhook running 🚀");
  }
}
