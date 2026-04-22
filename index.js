const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

loadEnvFiles();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = firstDefined("SUPABASE_URL", "VITE_SUPABASE_URL");
const SUPABASE_KEY = firstDefined(
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY"
);

const WA_CHANNEL_LINK = process.env.WA_CHANNEL_LINK || "https://chat.whatsapp.com/PLACEHOLDER";
const DETAILED_FORM_LINK = process.env.DETAILED_FORM_LINK || "https://corteqs.net/PLACEHOLDER";
const HUMAN_CONTACT_LINK = process.env.HUMAN_CONTACT_LINK || "https://wa.me/491637084577";
const WEBSITE_URL = process.env.WEBSITE_URL || "https://corteqs.net/";

function loadEnvFiles() {
  const envFiles = [".env", ".secret"];

  for (const fileName of envFiles) {
    const filePath = path.join(__dirname, fileName);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    const fileContents = fs.readFileSync(filePath, "utf8");
    const lines = fileContents.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (!key || process.env[key] !== undefined) {
        continue;
      }

      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}

function firstDefined(...keys) {
  for (const key of keys) {
    if (process.env[key]) {
      return process.env[key];
    }
  }

  return undefined;
}

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(
      "Supabase environment variables are missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY). Database writes are disabled."
    );
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

const supabase = getSupabaseClient();

// --------------------------------------------------
// WHATSAPP GROUP LINKS CONFIGURATION
// --------------------------------------------------
const GROUP_LINKS = {
  "danisman": process.env.WA_GROUP_DANISMAN || "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN",
  "isletme": process.env.WA_GROUP_ISLETME || "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN", 
  "dernek": process.env.WA_GROUP_DERNEK || "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN",
  "vakif": process.env.WA_GROUP_VAKIF || "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN",
  "radyo-tv": process.env.WA_GROUP_RADYO_TV || "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN",
  "blogger-vlogger": process.env.WA_GROUP_CREATORS || "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN",
  "influencer": process.env.WA_GROUP_CREATORS || "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN",
  "sehir-elcisi": process.env.WA_GROUP_AMBASSADORS || "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN",
  "bireysel": "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN",
  "support": process.env.WA_GROUP_INVESTORS || "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN",
  "backer": process.env.WA_GROUP_BACKERS || "https://chat.whatsapp.com/L3FeJVRpPIb75bQGG7M3oN"
};

// --------------------------------------------------
// HELPERS
// --------------------------------------------------
async function sendWhatsAppMessage(to, body) {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error(
      "WhatsApp environment variables are missing. Set ACCESS_TOKEN and PHONE_NUMBER_ID before sending messages."
    );
  }

  try {
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
  } catch (error) {
    const metaError = error.response?.data?.error;

    if (metaError?.code === 190 && metaError?.error_subcode === 463) {
      throw new Error(
        "WhatsApp access token expired. Generate a new permanent or long-lived Meta access token, update ACCESS_TOKEN, and restart the server."
      );
    }

    if (metaError?.code === 200) {
      throw new Error(
        "Meta API access blocked (code 200). Check App status, WABA restrictions, Business Verification, and token permissions in Meta Business Manager. Then generate a new token and restart."
      );
    }

    if (metaError) {
      console.error("Meta send error payload:", JSON.stringify(metaError));
    }

    throw error;
  }
}

async function logMessage(wa_id, message_text, reply_text) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("wa_messages").insert({
    wa_id,
    message_text,
    reply_text
  });

  if (error) {
    console.error("wa_messages insert error:", error);
  }
}

async function createTask(wa_id, task) {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("wa_tasks").insert({
    wa_id,
    task,
    status: "pending"
  });

  if (error) {
    console.error("wa_tasks insert error:", error);
  }
}

const MENU_TEXT =
  "Ne yapmak istiyorsun?\n" +
  "1️⃣ Hızlı yönlendirme\n" +
  "2️⃣ Kayıt ol / Profil oluştur\n" +
  "3️⃣ Detaylı form (para kazanma & referral)\n" +
  "4️⃣ İnsanla görüş\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";

const CATEGORY_MAP = [
  { key: "career", label: "İş & Kariyer" },
  { key: "networking", label: "Networking" },
  { key: "relocation", label: "Relokasyon" },
  { key: "consulting", label: "Danışmanlık" },
  { key: "partnership", label: "İş ortaklığı" },
  { key: "monetization", label: "Referral / Para kazanma" },
  { key: "other", label: "Diğer" }
];

function isMenuWord(text) {
  const t = (text || "").toLowerCase().trim();
  return t === "menü" || t === "menu" || t === "ana menü" || t === "anaMenü" || t === "m";
}

function isSkipWord(text) {
  const t = (text || "").toLowerCase().trim();
  return ["geç", "skip", "sonra", "hayır", "yok", "gerek yok"].includes(t);
}

function parseMenuChoice(text) {
  const t = (text || "").toLowerCase().trim();
  if (t === "1" || t.includes("hızlı") || t.includes("yonlendir")) return 1;
  if (t === "2" || t.includes("kayıt") || t.includes("kayit") || t.includes("profil")) return 2;
  if (t === "3" || t.includes("detaylı") || t.includes("detayli") || t.includes("form") || t.includes("referral") || t.includes("para")) return 3;
  if (t === "4" || t.includes("insan") || t.includes("görüş") || t.includes("gorus")) return 4;
  return null;
}

function parseCategoryChoice(text) {
  const t = (text || "").toLowerCase().trim();
  const num = parseInt(t, 10);
  if (num >= 1 && num <= 7) return CATEGORY_MAP[num - 1].key;
  for (const cat of CATEGORY_MAP) {
    if (t.includes(cat.key) || t.includes(cat.label.toLowerCase())) return cat.key;
  }
  if (t.includes("kariyer") || t.includes("iş")) return "career";
  if (t.includes("network")) return "networking";
  if (t.includes("relok") || t.includes("taşın") || t.includes("tasin")) return "relocation";
  if (t.includes("danışman") || t.includes("danisman")) return "consulting";
  if (t.includes("ortak")) return "partnership";
  if (t.includes("para") || t.includes("referral") || t.includes("kazan")) return "monetization";
  if (t.includes("diğer") || t.includes("diger")) return "other";
  return null;
}

function parseName(text) {
  const parts = (text || "").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { name: null, surname: null };
  if (parts.length === 1) return { name: parts[0], surname: null };
  return { name: parts[0], surname: parts.slice(1).join(" ") };
}

function parseLocation(text) {
  const t = (text || "").trim();
  if (!t) return { country: null, city: null };
  const parts = t.split(/\s*[-,–—]\s*/);
  if (parts.length >= 2) {
    return { country: parts[0].trim(), city: parts.slice(1).join(" ").trim() };
  }
  const words = t.split(/\s+/);
  if (words.length === 1) return { country: null, city: words[0] };
  return { country: words[0], city: words.slice(1).join(" ") };
}

function buildCategoryText() {
  return "Hangi konuda destek arıyorsun?\n" +
    CATEGORY_MAP.map((c, i) => `${i + 1}️⃣ ${c.label}`).join("\n") +
    "\n\nİstersen sadece numara yaz.";
}

async function getOrCreateUser(wa_id) {
  if (!supabase) {
    return {
      wa_id,
      name: null,
      surname: null,
      city: null,
      country: null,
      category: null,
      note: null,
      funnel_interest: null,
      current_step: "WELCOME"
    };
  }

  const { data, error } = await supabase
    .from("wa_users")
    .select("*")
    .eq("wa_id", wa_id)
    .maybeSingle();

  if (error) {
    console.error("wa_users fetch error:", error);
    throw error;
  }

  if (data) {
    return data;
  }

  const { data: newUser, error: insertError } = await supabase
    .from("wa_users")
    .insert({
      wa_id,
      current_step: "WELCOME"
    })
    .select()
    .single();

  if (insertError) {
    console.error("wa_users insert error:", insertError);
    throw insertError;
  }

  return newUser;
}

async function updateUser(wa_id, updates) {
  if (!supabase) {
    return;
  }

  const payload = {
    ...updates,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("wa_users")
    .update(payload)
    .eq("wa_id", wa_id);

  if (error) {
    console.error("wa_users update error:", error);
    throw error;
  }
}

async function buildReply(user, incomingText) {
  const text = (incomingText || "").trim();
  const lowered = text.toLowerCase();

  if (lowered === "reset" || isMenuWord(text)) {
    await updateUser(user.wa_id, { current_step: "MENU" });
    return "CorteQS'e hoş geldin 🚀\n\n" + MENU_TEXT;
  }

  if (user.current_step === "WELCOME") {
    const choice = parseMenuChoice(text);
    if (choice) {
      await updateUser(user.wa_id, { current_step: "MENU" });
      return handleMenuChoice(user, choice);
    }
    await updateUser(user.wa_id, { current_step: "MENU" });
    return "CorteQS'e hoş geldin 🚀\n\n" + MENU_TEXT + "\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  if (user.current_step === "MENU") {
    const choice = parseMenuChoice(text);
    if (choice) return handleMenuChoice(user, choice);
    return "Anlayamadım 🤔\n\n" + MENU_TEXT + "\n\nİstersen sadece 1, 2, 3 veya 4 yaz.\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  if (user.current_step === "ASK_NAME") {
    if (isMenuWord(text)) {
      await updateUser(user.wa_id, { current_step: "MENU" });
      return MENU_TEXT;
    }
    if (isSkipWord(text)) {
      await updateUser(user.wa_id, { name: null, surname: null, current_step: "ASK_LOCATION" });
      return "Tamam, geçelim. ⏩\n\nŞehir ve ülke bilgisini yaz (örnek: Almanya - Dortmund).\n\nGeçmek için 'geç', menü için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
    }
    const { name, surname } = parseName(text);
    await updateUser(user.wa_id, { name, surname, current_step: "ASK_LOCATION" });
    return `Merhaba ${name}! 👋\n\nŞehir ve ülke bilgisini yaz (örnek: Almanya - Dortmund).\n\nGeçmek için 'geç', menü için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!`;
  }

  if (user.current_step === "ASK_LOCATION") {
    if (isMenuWord(text)) {
      await updateUser(user.wa_id, { current_step: "MENU" });
      return MENU_TEXT;
    }
    if (isSkipWord(text)) {
      await updateUser(user.wa_id, { country: null, city: null, current_step: "ASK_CATEGORY" });
      return "Tamam, geçelim. ⏩\n\n" + buildCategoryText() + "\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
    }
    const { country, city } = parseLocation(text);
    await updateUser(user.wa_id, { country, city, current_step: "ASK_CATEGORY" });
    return "Süper! 📍\n\n" + buildCategoryText() + "\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  if (user.current_step === "ASK_CATEGORY") {
    if (isMenuWord(text)) {
      await updateUser(user.wa_id, { current_step: "MENU" });
      return MENU_TEXT;
    }
    const catKey = parseCategoryChoice(text);
    if (!catKey) return "Anlayamadım 🤔\n\n" + buildCategoryText() + "\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
    await updateUser(user.wa_id, { category: catKey, current_step: "ASK_NOTE" });
    return "Notun var mı? 💬\n\nÖrneğin: \"Almanya'da iş bulmak istiyorum\" veya \"Berlin'de networking arıyorum\"\n\nGeçmek için 'geç', menü için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  if (user.current_step === "ASK_NOTE") {
    if (isMenuWord(text)) {
      await updateUser(user.wa_id, { current_step: "MENU" });
      return MENU_TEXT;
    }
    if (isSkipWord(text)) {
      await updateUser(user.wa_id, { note: null, current_step: "REDIRECT" });
      return buildRedirectText() + "\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
    }
    await updateUser(user.wa_id, { note: text, current_step: "REDIRECT" });
    return buildRedirectText() + "\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  if (user.current_step === "REDIRECT") {
    const num = parseInt(lowered, 10);
    if (num === 1) {
      await updateUser(user.wa_id, { current_step: "REFERRAL_ASK" });
      return `Web sitesi: ${WEBSITE_URL}\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!`;
    }
    if (num === 2) {
      await updateUser(user.wa_id, { current_step: "REFERRAL_ASK" });
      return `WhatsApp kanalı: ${WA_CHANNEL_LINK}\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!`;
    }
    if (num === 3) {
      await updateUser(user.wa_id, { current_step: "REFERRAL_ASK" });
      return `İnsanla direkt iletişim: ${HUMAN_CONTACT_LINK}\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!`;
    }
    if (num === 4) {
      await updateUser(user.wa_id, { current_step: "MENU" });
      return MENU_TEXT;
    }
    return "Anlayamadım 🤔\n\n" + buildRedirectText() + "\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  if (user.current_step === "REFERRAL_ASK") {
    const num = parseInt(lowered, 10);
    if (num === 1) {
      await updateUser(user.wa_id, { funnel_interest: true, current_step: "DONE" });
      return `Detaylı form linki: ${DETAILED_FORM_LINK}\n\nEn kısa sürede dönüş yapacağız! 🙌\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!`;
    }
    if (num === 2 || num === 3) {
      await updateUser(user.wa_id, { funnel_interest: false, current_step: "DONE" });
      return "Sorun değil 👍\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
    }
    return "Anlayamadım 🤔\n\n" +
      "Detaylı form ile para kazanma ve referral fırsatlarına erişmek ister misin?\n" +
      "1️⃣ Evet, detaylı katılmak istiyorum\n" +
      "2️⃣ Hayır\n" +
      "3️⃣ Daha sonra\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  if (user.current_step === "DONE") {
    return "Kaydını aldım ✅\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  await updateUser(user.wa_id, { current_step: "WELCOME" });
  return "Bir şeyler karıştı. Baştan başlıyoruz.\n\n" + MENU_TEXT;
}

async function handleMenuChoice(user, choice) {
  if (choice === 1) {
    await updateUser(user.wa_id, { current_step: "REDIRECT" });
    return "Hızlı yönlendirme ⚡\n\n" + buildRedirectText() + "\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }
  if (choice === 2) {
    await updateUser(user.wa_id, { current_step: "ASK_NAME" });
    return "Kayıt / Profil oluşturma 📝\n\nAdını yaz (örnek: Ahmet Yılmaz).\n\nGeçmek için 'geç', menü için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }
  if (choice === 3) {
    await updateUser(user.wa_id, { current_step: "REFERRAL_ASK" });
    return `Detaylı form ile para kazanma ve referral fırsatlarına erişebilirsin 💰\n\nForm linki: ${DETAILED_FORM_LINK}\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!`;
  }
  if (choice === 4) {
    await updateUser(user.wa_id, { current_step: "DONE" });
    return `İnsanla görüşmek için:\n${HUMAN_CONTACT_LINK}\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!`;
  }
  return MENU_TEXT;
}

function buildRedirectText() {
  return "Seni yönlendirelim 🔗\n\n" +
    "1️⃣ Web sitesi\n" +
    "2️⃣ WhatsApp kanalı\n" +
    "3️⃣ İnsanla direkt iletişim\n" +
    "4️⃣ Ana menüye dön\n\n" +
    "Seçimini yaz.\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
}

// --------------------------------------------------
// FORM SUBMISSION PROCESSING
// --------------------------------------------------
async function processFormSubmission(submission) {
  try {
    // Validate submission data
    if (!submission.phone || !submission.whatsapp_interest || submission.status !== 'new') {
      console.log('Skipping submission - invalid data or already processed:', submission.id);
      return;
    }

    // Determine group link based on category
    let groupLink = GROUP_LINKS[submission.category] || GROUP_LINKS['bireysel'];
    
    // Build personalized welcome message
    const firstName = submission.first_name || '';
    const lastName = submission.last_name || '';
    const fullName = firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Değerli kullanıcı';
    const city = submission.city || '';
    const country = submission.country || '';
    const location = city || country ? `\nKonumun: ${city}${country && city ? `, ${country}` : country}` : '';
    
    const welcomeMessage = 
      `Merhaba ${fullName}! 👋\n\n` +
      `CorteQS topluluğuna hoş geldin! 🚀${location}\n\n` +
      `Aşağıdaki WhatsApp grubuna katılarak topluluğumuzla bağlantı kurabilirsin:\n${groupLink}\n\n` +
      `Herhangi bir sorun olursa bana buradan ulaşabilirsin. 🤝`;

    console.log(`Processing submission ${submission.id} for ${submission.phone}`);
    
    // Send WhatsApp message
    await sendWhatsAppMessage(submission.phone, welcomeMessage);
    
    // Update submission status to prevent reprocessing
    if (supabase) {
      const { error } = await supabase
        .from('submissions')
        .update({ status: 'contacted' })
        .eq('id', submission.id);
      
      if (error) {
        console.error('Failed to update submission status:', error);
      } else {
        console.log(`Successfully processed and updated submission ${submission.id}`);
      }
    }
    
  } catch (error) {
    console.error('Error processing form submission:', error.response?.data || error.message || error);
    // Don't throw error to prevent crashing the Realtime listener
  }
}

// --------------------------------------------------
// WEBHOOK VERIFICATION
// --------------------------------------------------
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

// --------------------------------------------------
// INCOMING MESSAGES
// --------------------------------------------------
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
    console.log("User loaded, step:", user.current_step);

    const reply = await buildReply(user, text);
    console.log("Reply built, length:", reply.length);

    await sendWhatsAppMessage(from, reply);
    console.log("Reply sent OK to:", from);

    await logMessage(from, text, reply);

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error.response?.data || error.message || error);
    return res.sendStatus(200);
  }
});

// --------------------------------------------------
// HEALTHCHECK
// --------------------------------------------------
app.get("/", (req, res) => {
  res.send("WhatsApp bot is running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // --------------------------------------------------
  // REALTIME SUBSCRIPTION FOR FORM SUBMISSIONS
  // --------------------------------------------------
  if (supabase) {
    try {
      const submissionsChannel = supabase
        .channel('submissions-channel')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'submissions',
            filter: 'whatsapp_interest=eq.true'
          },
          (payload) => {
            console.log('New form submission detected:', payload.new.id);
            processFormSubmission(payload.new);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Subscribed to submissions table Realtime channel');
          } else {
            console.error('Realtime subscription status:', status);
          }
        });
      
      // Handle channel errors
      submissionsChannel.on('CHANNEL_ERROR', (error) => {
        console.error('Realtime channel error:', error);
      });
      
      // Handle broadcast errors  
      submissionsChannel.on('BROADCAST_ERROR', (error) => {
        console.error('Realtime broadcast error:', error);
      });
    } catch (error) {
      console.error('Failed to set up Realtime subscription:', error);
    }
  } else {
    console.warn('Supabase client not available - skipping Realtime subscription');
  }
});
