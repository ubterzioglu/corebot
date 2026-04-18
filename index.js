const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const PORT = process.env.PORT || 3000;

// -----------------------------
// Webhook verification (GET)
// -----------------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// -----------------------------
// Incoming messages (POST)
// -----------------------------
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    // Eğer mesaj yoksa (status update vs.) çık
    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = (message.text?.body || "").toLowerCase().trim();

    console.log("Incoming from:", from);
    console.log("Incoming message:", text);

    // -----------------------------
    // BOT LOGIC
    // -----------------------------
    let reply = "Ne demek istediğini anlayamadım. 'yardım' yazabilirsin.";

    if (text === "merhaba") {
      reply = "Selam. Bot aktif 🚀";
    } 
    else if (text === "yardım") {
      reply = "Komutlar:\n- merhaba\n- fiyat\n- saat";
    } 
    else if (text === "fiyat") {
      reply = "Fiyat bilgisi yakında eklenecek.";
    } 
    else if (text === "saat") {
      reply = "Çalışma saatleri: 09:00 - 18:00";
    }

    // -----------------------------
    // SEND MESSAGE
    // -----------------------------
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: {
          body: reply
        }
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error(
      "Webhook error:",
      error.response?.data || error.message
    );
    res.sendStatus(200);
  }
});

// -----------------------------
// Health check
// -----------------------------
app.get("/", (req, res) => {
  res.send("WhatsApp bot is running");
});

// -----------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});