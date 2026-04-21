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

function normalizeIntent(text) {
  const t = (text || "").toLowerCase().trim();

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
  if (!supabase) {
    return {
      wa_id,
      intent: null,
      city: null,
      role: null,
      current_step: "ASK_INTENT"
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
      current_step: "ASK_INTENT"
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

  if (lowered === "reset") {
    await updateUser(user.wa_id, {
      intent: null,
      city: null,
      role: null,
      current_step: "ASK_INTENT"
    });

    return (
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
        "CorteQS’e hoş geldin 🚀\n\n" +
        "Ne yapmak istiyorsun?\n" +
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
    const task = getTaskByIntent(user.intent, city);

    await updateUser(user.wa_id, {
      city,
      current_step: "DONE"
    });

    await createTask(user.wa_id, task);

    return (
      `Süper. Şehir: ${city}\n` +
      `Alan: ${getIntentLabel(user.intent)}\n\n` +
      `İlk görevin:\n${task}\n\n` +
      "Baştan başlamak için 'reset' yazabilirsin."
    );
  }

  if (user.current_step === "DONE") {
    return (
      "Kaydını aldım ✅\n\n" +
      "Baştan başlamak istersen 'reset' yaz.\n" +
      "Yakında profil tamamlama linkini de göndereceğim."
    );
  }

  return "Bir şeyler karıştı. Baştan başlamak için 'reset' yaz.";
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
    const reply = await buildReply(user, text);

    await sendWhatsAppMessage(from, reply);
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
