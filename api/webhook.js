import { userStates } from "../states/userStates.js";
import { sendMessage } from "../utils/telegram.js";
import { isValidBirthday } from "../utils/validators.js";
import axios from "axios";

export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      res.statusCode = 400;
      res.end("Invalid JSON");
      return;
    }
  }

  const chatId = body.message?.chat?.id;
  if (!chatId) {
    res.statusCode = 200;
    res.end("No chat ID");
    return;
  }

  if (req.method === "POST" && body.message) {
    const text = body.message.text?.trim();
    let userState = userStates.get(chatId);

    // --- Check if user already exists ---
    if (!userState && text === "/register") {
      try {
        const resp = await axios.get(
          `${process.env.BACKEND_URL}/getUser/${chatId}`
        );
        if (resp.status === 200 && resp.data) {
          await sendMessage(chatId, "⚠️ You are already registered!");
          res.statusCode = 200;
          res.end("OK");
          return;
        }
      } catch (err) {
        if (err.response?.status !== 404) {
          console.error("Error checking user:", err.message);
          await sendMessage(
            chatId,
            "⚠️ Could not check registration. Try again later."
          );
          res.statusCode = 200;
          res.end("OK");
          return;
        }
        // 404 means user not found → continue registration
      }

      // Start registration for new user
      userStates.set(chatId, { step: "askName" });
      await sendMessage(chatId, "👋 Welcome! What's your *name*?");
      res.statusCode = 200;
      res.end("OK");
      return;
    }

    if (!userState) {
      res.statusCode = 200;
      res.end("OK");
      return;
    }

    // Ask for name
    if (userState.step === "askName") {
      userState.name = text;
      userState.step = "askBirthday";
      await sendMessage(
        chatId,
        "🎂 Enter your *birthday* in `DD-MM` format (e.g., 25-12):"
      );
    }
    // Ask for birthday
    else if (userState.step === "askBirthday") {
      const [day, month] = text.split("-").map(Number);
      if (!isValidBirthday(day, month)) {
        await sendMessage(
          chatId,
          "❌ Invalid birthday. Enter in DD-MM format (e.g., 25-12):"
        );
        res.statusCode = 200;
        res.end("OK");
        return;
      }

      // Save user to backend
      try {
        await axios.post(`${process.env.BACKEND_URL}/createUser`, {
          chatId,
          name: userState.name,
          birthdayDay: day,
          birthdayMonth: month,
        });
        await sendMessage(
          chatId,
          "✅ Your details have been saved. Thank you!"
        );
        userStates.delete(chatId);
      } catch (err) {
        console.error("Error saving user:", err.message);
        await sendMessage(chatId, "⚠️ Could not save. Try again later.");
      }
    }

    res.statusCode = 200;
    res.end("OK");
  } else {
    res.statusCode = 200;
    res.end("Telegram bot webhook running 🚀");
  }
}
