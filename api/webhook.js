import axios from "axios";

const userStates = new Map(); // Temporary in-memory store for user step tracking

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { message } = req.body;

    if (message) {
      const chatId = message.chat.id;
      const text = message.text?.trim();

      if (text === "/start") {
        userStates.set(chatId, { step: "askName" });
        await sendMessage(chatId, "👋 Welcome! What's your *name*?");
      } else {
        // Continue conversation based on step
        const userState = userStates.get(chatId);

        if (userState?.step === "askName") {
          userState.name = text;
          userState.step = "askEmail";
          await sendMessage(chatId, "📧 Please enter your *email*:");
        } else if (userState?.step === "askEmail") {
          userState.email = text;
          userState.step = "askPhone";
          await sendMessage(chatId, "📱 Please enter your *phone number*:");
        } else if (userState?.step === "askPhone") {
          userState.phone = text;
          userState.step = "askBirthday";
          await sendMessage(
            chatId,
            "🎂 Enter your *birthday* in `DD-MM` format:"
          );
        } else if (userState?.step === "askBirthday") {
          const [day, month] = text.split("-").map(Number);
          if (!day || !month) {
            await sendMessage(
              chatId,
              "❌ Invalid format. Please enter in `DD-MM` format:"
            );
            return res.sendStatus(200);
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
            console.error(err);
            await sendMessage(
              chatId,
              "⚠️ Something went wrong. Please try again later."
            );
          }
        }
      }
    }

    return res.sendStatus(200);
  } else {
    res.status(200).send("Telegram bot webhook running 🚀");
  }
}

async function sendMessage(chatId, text) {
  return axios.post(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }
  );
}
