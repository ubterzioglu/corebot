const express = require("express");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -----------------------------
// Helpers
// -----------------------------
async function sendWhatsAppMessage(to, body) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

async function logMessage(wa_id, message_text, reply_text) {
  const { error } = await supabase.from("whatsapp_messages").insert({
    wa_id,
    message_text,
    reply_text
  });

  if (error) {
    console.error("Message log insert error:", error);
  }
}

async function createTask(wa_id, task) {
  const { error } = await supabase.from("tasks").insert({
    wa_id,
    task,
    status: "pending"
  });

  if (error) {
    console.error("Task insert error:", error);
  }
}

function normalizeIntent(text) {
  const t = text.toLowerCase().trim();

  if (t === "1" || t.includes("danışman")) return "advisor";
  if (t === "2" || t.includes("etkinlik")) return "events";
  if (t === "3" || t.includes("işimi") || t.includes("hizmetimi") || t.includes("büyüt")) return "business";
  if (t === "4" || t.includes("ambassador") || t.includes("şehrimi")) return "ambassador";
  if (t === "5" || t.includes("içerik")) return "creator";

  return null;
}

function getIntentLabel(intent) {
  switch (intent) {
    case "advisor":
      return "Danışman bulmak";
    case "events":
      return "Etkinliklere katılmak";
    case "business":
      return "İşimi / hizmetimi büyütmek";
    case "ambassador":
      return "Şehrimi temsil etmek (Ambassador)";
    case "creator":
      return "İçerik üretmek";
    default:
      return "Bilinmiyor";
  }
}

function getTaskByIntent(intent, city) {
  switch (intent) {
    case "advisor":
      return `${city} için danışmanlık ihtiyacını netleştir ve profilini tamamla.`;
    case "events":
      return `${city} için ilk etkinliğini seç ve katılım durumunu bildir.`;
    case "business":
      return `${city} bölgesinde ulaşmak istediğin müşteri tipini tek cümleyle yaz.`;
    case "ambassador":
      return `${city} için ilk hafta 1 etkinlik önerisi ve 3 kullanıcı daveti hedefi oluştur.`;
    case "creator":
      return `${city} için ilk içerik konunu belirle ve paylaşım fikrini yaz.`;
    default:
      return `${city} için ilk aksiyonunu tamamla.`;
  }
}

async function getOrCreateUser(wa_id) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("wa_id", wa_id)
    .maybeSingle();

  if (error) {
    console.error("User fetch error:", error);
    throw error;
  }

  if (data) {
    return data;
  }

  const { data: newUser, error: insertError } = await supabase
    .from("users")
    .insert({
      wa_id,
      current_step: "ASK_INTENT"
    })
    .select()
    .single();

  if (insertError) {
    console.error("User insert error:", insertError);
    throw insertError;
  }

  return newUser;
}

async function updateUser(wa_id, updates) {
  const payload = {
    ...updates,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("users")
    .update(payload)
    .eq("wa_id", wa_id);

  if (error) {
    console.error("User update error:", error);
    throw error;
  }
}

async function buildReply(user, incomingText) {
  const text = (incomingText || "").trim();
  const lowered = text.toLowerCase();

  if (lowered === "reset") {
    await updateUser(user.wa_id, {
      intent: null,
      city: null,
      role: null,
      current_step: "ASK_INTENT"
    });

    return (
      "Sıfırlandı.\n\n" +
      "CorteQS’e hoş geldin 🚀\n\n" +
      "Ne yapmak istiyorsun?\n" +
      "1. Danışman bulmak\n" +
      "2. Etkinliklere katılmak\n" +
      "3. İşimi / hizmetimi büyütmek\n" +
      "4. Şehrimi temsil etmek (Ambassador)\n" +
      "5. İçerik üretmek"
    );
  }

  if (user.current_step === "ASK_INTENT") {
    const intent = normalizeIntent(text);

    if (!intent) {
      return (
        "Lütfen aşağıdaki seçeneklerden birini yaz:\n" +
        "1. Danışman bulmak\n" +
        "2. Etkinliklere katılmak\n" +
        "3. İşimi / hizmetimi büyütmek\n" +
        "4. Şehrimi temsil etmek (Ambassador)\n" +
        "5. İçerik üretmek\n\n" +
        "İstersen sadece 1, 2, 3, 4 veya 5 yaz."
      );
    }

    await updateUser(user.wa_id, {
      intent,
      current_step: "ASK_CITY"
    });

    return (
      `Seçimin alındı: ${getIntentLabel(intent)}\n\n` +
      "Şimdi hangi şehirde olduğunu yaz."
    );
  }

  if (user.current_step === "ASK_CITY") {
    if (text.length < 2) {
      return "Lütfen geçerli bir şehir yaz.";
    }

    const city = text;

    await updateUser(user.wa_id, {
      city,
      current_step: "DONE"
    });

    const task = getTaskByIntent(user.intent, city);
    await createTask(user.wa_id, task);

    return (
      `Süper. Şehir: ${city}\n` +
      `Alan: ${getIntentLabel(user.intent)}\n\n` +
      `İlk görevin:\n${task}\n\n` +
      "Profilini tamamlamak için yakında sana link göndereceğim.\n" +
      "Baştan başlamak için 'reset' yazabilirsin."
    );
  }

  if (user.current_step === "DONE") {
    return (
      "Seni kaydettim ✅\n\n" +
      "Yeni bir akış başlatmak istersen 'reset' yaz.\n" +
      "Mevcut profilini güncellemek istersen yakında panel linki göndereceğim."
    );
  }

  return "Bir şeyler karıştı. Baştan başlamak için 'reset' yaz.";
}

// -----------------------------
// Webhook verification
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
// Incoming messages
// -----------------------------
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body || "";

    console.log("Incoming from:", from);
    console.log("Incoming message:", text);

    const user = await getOrCreateUser(from);
    const reply = await buildReply(user, text);

    await sendWhatsAppMessage(from, reply);
    await logMessage(from, text, reply);

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error.response?.data || error.message || error);
    return res.sendStatus(200);
  }
});

// -----------------------------
// Health check
// -----------------------------
app.get("/", (req, res) => {
  res.send("WhatsApp bot is running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});