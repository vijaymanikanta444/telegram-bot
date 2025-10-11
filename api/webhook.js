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
    } catch (err) {
      res.statusCode = 400;
      res.end("Invalid JSON");
      return;
    }
  }

  if (!body) {
    res.statusCode = 200;
    res.end("No body received");
    return;
  }

  const chatId = body.message?.chat?.id || body.callback_query?.from?.id;

  console.log({ body });

  // --- Handle callback query (inline buttons) ---
  if (body.callback_query) {
    const callbackQuery = body.callback_query;
    const data = callbackQuery.data;

    const userState = userStates.get(chatId);

    if (data === "no_email") {
      if (userState) {
        userState.email = null;
        userState.step = "askPhone";
        await sendMessage(
          chatId,
          "📱 Please enter your *phone number* (digits only, e.g., 9876543210):"
        );
      }
    }

    // Handle update field selection
    if (data?.startsWith("update_")) {
      if (!userState) {
        await sendMessage(
          chatId,
          "⚠️ Something went wrong. Try /register again."
        );
      } else {
        const field = data.replace("update_", "");
        userState.step = `update_${field}`;
        const current = userState.user[field] ?? "Not set";
        await sendMessage(
          chatId,
          `📝 Current ${field}: ${current}\nEnter new value:`
        );
      }
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

  // --- Handle normal messages ---
  if (req.method === "POST" && body.message) {
    const message = body.message;
    const text = message.text?.trim();

    // Fetch user from backend by chatId
    let existingUser = null;
    try {
      const resp = await axios.get(
        `${process.env.BACKEND_URL}/getUser/${chatId}`
      );
      if (resp.status === 200) existingUser = resp.data;
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error("Error fetching user:", err.message);
        await sendMessage(chatId, "⚠️ Could not check user. Try again later.");
        res.statusCode = 200;
        res.end("OK");
        return;
      }
    }

    console.log("Existing user:", chatId, existingUser);

    // New user
    if (!existingUser && text === "/register") {
      userStates.set(chatId, { step: "askName" });
      await sendMessage(chatId, "👋 Welcome! What's your *name*?");
      res.statusCode = 200;
      res.end("OK");
      return;
    }

    // Existing user: offer update menu
    if (existingUser && !userStates.get(chatId)) {
      userStates.set(chatId, { step: "update_menu", user: existingUser });
      const buttons = [
        { text: "Name", callback_data: "update_name" },
        { text: "Email", callback_data: "update_email" },
        { text: "Phone", callback_data: "update_phone" },
        { text: "Birthday", callback_data: "update_birthday" },
      ];
      await sendMessageWithButton(
        chatId,
        "📝 You are already registered. What would you like to update?",
        buttons
      );
      res.statusCode = 200;
      res.end("OK");
      return;
    }

    const userState = userStates.get(chatId);
    if (!userState) {
      res.statusCode = 200;
      res.end("OK");
      return;
    }

    // --- Handle update steps ---
    if (userState.step?.startsWith("update_")) {
      const field = userState.step.replace("update_", "");

      // Validate field
      if (field === "email" && text !== "No email" && !isValidEmail(text)) {
        await sendMessageWithButton(
          chatId,
          "❌ Invalid email. Enter valid or 'No email'",
          [{ text: "No email", callback_data: "no_email" }]
        );
        res.statusCode = 200;
        res.end("OK");
        return;
      }
      if (field === "phone" && !isValidPhone(text)) {
        await sendMessage(
          chatId,
          "❌ Invalid phone number. Enter digits only (7-15 digits)."
        );
        res.statusCode = 200;
        res.end("OK");
        return;
      }
      if (field === "birthday") {
        const [day, month] = text.split("-").map(Number);
        if (!isValidBirthday(day, month)) {
          await sendMessage(
            chatId,
            "❌ Invalid birthday. Enter in DD-MM format (e.g., 25-12)."
          );
          res.statusCode = 200;
          res.end("OK");
          return;
        }
        userState.user.birthdayDay = day;
        userState.user.birthdayMonth = month;
      } else {
        userState.user[field] = text === "No email" ? null : text;
      }

      // Save updated field to backend
      try {
        await axios.patch(
          `${process.env.BACKEND_URL}/updateUser/${chatId}`,
          userState.user
        );
        await sendMessage(chatId, `✅ Updated ${field} successfully.`);
        userStates.delete(chatId);
      } catch (err) {
        console.error("Error updating user:", err.message);
        await sendMessage(chatId, "⚠️ Could not update. Try again later.");
      }

      res.statusCode = 200;
      res.end("OK");
      return;
    }

    // --- Normal new user flow continues ---
    if (userState.step === "askName") {
      userState.name = text;
      userState.step = "askEmail";
      await sendMessageWithButton(
        chatId,
        "📧 Please enter your *email* (e.g., name@example.com):",
        [{ text: "No email", callback_data: "no_email" }]
      );
    } else if (userState.step === "askEmail") {
      if (text !== "No email" && !isValidEmail(text)) {
        await sendMessageWithButton(
          chatId,
          "❌ Invalid email. Enter valid or 'No email':",
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
    } else if (userState.step === "askPhone") {
      if (!isValidPhone(text)) {
        await sendMessage(
          chatId,
          "❌ Invalid phone number. Enter digits only (7-15 digits)."
        );
        res.statusCode = 200;
        res.end("OK");
        return;
      }
      userState.phone = text;
      userState.step = "askBirthday";
      await sendMessage(
        chatId,
        "🎂 Enter your *birthday* in `DD-MM` format (e.g., 25-12):"
      );
    } else if (userState.step === "askBirthday") {
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

      userState.birthdayDay = day;
      userState.birthdayMonth = month;

      // Save new user
      try {
        await axios.post(`${process.env.BACKEND_URL}/createUser`, {
          chatId,
          name: userState.name,
          email: userState.email,
          phone: userState.phone,
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
