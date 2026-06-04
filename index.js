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

const WA_CHANNEL_LINK = process.env.WA_CHANNEL_LINK || "https://chat.whatsapp.com/JDMyCOx0m2w3lqejP7vA6M";
const DETAILED_FORM_LINK = process.env.DETAILED_FORM_LINK || "https://corteqs.net/PLACEHOLDER";
const HUMAN_CONTACT_LINK = process.env.HUMAN_CONTACT_LINK || "https://wa.me/905302404995?text=CorteQS%20-%20Bilgi%20almak%20istiyorum!";
const WEBSITE_URL = process.env.WEBSITE_URL || "https://corteqs.net";
const RAG_UNAVAILABLE_TEXT =
  "Şu anda bilgi sistemine bağlanamıyorum. Lütfen daha sonra tekrar deneyin.";
const RAG_NO_ANSWER_TEXT = "Bu konuda net bilgi bulamadım.";

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
  if (process.env.NODE_ENV === "test") {
    return null;
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn(
      "Supabase environment variables are missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY). Database writes are disabled."
    );
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

const supabase = getSupabaseClient();
let submissionsChannel = null;

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
async function sendWhatsAppMessage(to, body, phoneNumberId = PHONE_NUMBER_ID) {
  if (!ACCESS_TOKEN || !phoneNumberId) {
    throw new Error(
      "WhatsApp environment variables are missing. Set ACCESS_TOKEN and PHONE_NUMBER_ID before sending messages."
    );
  }

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
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

    if (metaError?.code === 190) {
      const suffix = metaError.error_subcode
        ? ` Meta subcode: ${metaError.error_subcode}.`
        : "";
      throw new Error(
        `WhatsApp access token is invalid or expired.${suffix} Generate a new permanent or long-lived Meta access token, update ACCESS_TOKEN, and restart the server.`
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

async function deliverAndLogMessage({
  waId,
  outgoingText,
  incomingText = null,
  phoneNumberId = PHONE_NUMBER_ID,
  send = sendWhatsAppMessage,
  log = logMessage
}) {
  let sendError = null;

  try {
    await send(waId, outgoingText, phoneNumberId);
  } catch (error) {
    sendError = error;
  }

  await log(waId, incomingText, outgoingText);

  if (sendError) {
    throw sendError;
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

async function askRag(question) {
  const ragApiUrl = process.env.RAG_API_URL;

  if (!ragApiUrl) {
    return RAG_UNAVAILABLE_TEXT;
  }

  try {
    const response = await fetch(ragApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.RAG_API_SECRET
          ? { Authorization: `Bearer ${process.env.RAG_API_SECRET}` }
          : {})
      },
      body: JSON.stringify({ question })
    });

    if (!response.ok) {
      console.error(`RAG API returned ${response.status} ${response.statusText}`);
      return RAG_UNAVAILABLE_TEXT;
    }

    const data = await response.json();
    return data.answer || RAG_NO_ANSWER_TEXT;
  } catch (error) {
    console.error("RAG request error:", error.message || error);
    return RAG_UNAVAILABLE_TEXT;
  }
}

const MENU_TEXT =
  "CorteQS’e Hoş Geldiniz 🚀\n" +
  "Size nasıl yardımcı olabiliriz?\n\n" +
  "1️⃣ Hızlı yönlendirme\n\n" +
  "2️⃣ Detaylı başvuru (gelir & referans sistemi)\n\n" +
  "3️⃣ Yetkili ile görüşme\n\n" +
  "4️⃣ İstek ve Öneri Bırak\n\n" +
  "5️⃣ CorteQS AI'ya Sor\n\n" +
  "Ana menüye dönmek için “m” yazabilirsiniz.\n\n" +
  "Türk diasporasına verdiğiniz destek için teşekkür ederiz.\n" +
  `${WEBSITE_URL}`;

const AI_MODE_WELCOME_TEXT =
  "CorteQS AI bilgi moduna hoş geldiniz.\n" +
  "Platform, üyelik, fırsatlar ve kullanım hakkında istediğiniz soruyu yazabilirsiniz.\n" +
  "Ana menüye dönmek için \"m\", bu moddan çıkmak için \"çık\" yazın.";

const AI_MODE_EXIT_TEXT =
  "AI modundan çıkıldı.\n\nAna menüye dönmek için \"m\" yazın veya menüden bir seçim yapın.";

const AI_MODE_FLOW_GUARD_TEXT =
  "Şu an aktif bir akıştayız. AI soruları için ana menüye dönüp 5'i seçebilirsiniz.";

const HELLO_INTENT_TEXT =
  "Merhaba!\n\nAna menüye gitmek için \"m\" yazabilirsiniz.";

const SUPPORT_INTENT_TEXT =
  "Anlayamadım 🤔\n\n" +
  "Sizi doğru yere yönlendirebilmem için ana menüye gitmek üzere \"m\" yazabilirsiniz.";

const LEGACY_REGISTRATION_STEPS = [
  "ASK_CATEGORY",
  "ASK_FULL_NAME",
  "ASK_COUNTRY",
  "ASK_CITY",
  "ASK_ORGANIZATION",
  "ASK_OCCUPATION_INTEREST",
  "ASK_EMAIL",
  "ASK_PHONE",
  "ASK_DISCOVERY_SOURCE",
  "ASK_REFERRAL_CODE",
  "ASK_DEMANDS",
  "ASK_WHATSAPP_GROUP_INTEREST",
  "ASK_PRIVACY_CONSENT"
];

const REGISTRATION_FLOW_REMOVED_TEXT =
  "WhatsApp içindeki kayıt alma akışı kaldırıldı.\n\n" +
  "Güncel seçenekler için sizi ana menüye yönlendirdim.\n\n" +
  MENU_TEXT;

function isMenuWord(text) {
  const t = (text || "").toLowerCase().trim();
  return t === "menü" || t === "menu" || t === "ana menü" || t === "anaMenü" || t === "m";
}

function isHelloIntent(text) {
  const t = (text || "").toLowerCase().trim();
  return t === "merhaba";
}

function isSupportIntent(text) {
  const t = (text || "").toLowerCase().trim();
  return ["problem", "sorun", "yardım", "destek"].some((keyword) => t.includes(keyword));
}

function parseMenuChoice(text) {
  const t = (text || "").toLowerCase().trim();
  if (t === "1" || t.includes("hızlı") || t.includes("yonlendir")) return 1;
  if (
    t === "2" ||
    t.includes("detaylı") ||
    t.includes("detayli") ||
    t.includes("form") ||
    t.includes("referral") ||
    t.includes("para") ||
    t.includes("kayıt") ||
    t.includes("kayit") ||
    t.includes("profil")
  ) {
    return 2;
  }
  if (t === "3" || t.includes("insan") || t.includes("görüş") || t.includes("gorus")) return 3;
  if (
    t === "5" ||
    t === "6" ||
    t === "ai" ||
    t === "yapay zeka" ||
    t === "asistan" ||
    t === "akıllı yardımcı" ||
    t === "akilli yardimci" ||
    t === "corteqs ai" ||
    t === "corteqs ai'ya sor" ||
    t === "corteqs hakkında ai'ya sor" ||
    t === "corteqs hakkinda ai'ya sor" ||
    t === "soru sor"
  ) {
    return 5;
  }
  if (t === "4" || t.includes("istek") || t.includes("öneri") || t.includes("oneri") || t.includes("feedback")) return 4;
  return null;
}

function isValidPhone(text) {
  return /^\+\d[\d\s().-]{5,}$/.test((text || "").trim());
}

function isAffirmative(text) {
  const t = (text || "").toLowerCase().trim();
  return ["1", "evet", "e", "yes", "onaylıyorum", "onayliyorum", "kabul", "kabul ediyorum"].includes(t);
}

function isNegative(text) {
  const t = (text || "").toLowerCase().trim();
  return ["2", "hayır", "hayir", "h", "no", "istemiyorum", "reddediyorum", "red"].includes(t);
}

function buildSuggestionIntroText() {
  return "İstek ve Öneri Menüsü\n\n" +
    "Lütfen istek, öneri veya geri bildiriminizi detaylı şekilde yazın.\n\n" +
    "Ana menüye dönmek için “m” yazabilirsiniz.\n" +
    `${WEBSITE_URL}/`;
}

function buildSuggestionContactPromptText() {
  return "Teşekkürler 🙌\n\n" +
    "Sana ulaşabileceğimiz WhatsApp numarası bırakmak ister misin?\n\n" +
    "1️⃣ Evet\n" +
    "2️⃣ Hayır\n\n" +
    "Ana menüye dönmek için “m” yazabilirsiniz.";
}

function isAiExitWord(text) {
  const t = (text || "").toLowerCase().trim();
  return t === "çık" || t === "cik" || t === "kapat";
}

function isLegacyRegistrationStep(step) {
  return LEGACY_REGISTRATION_STEPS.includes(step);
}

function isStructuredFlowStep(step) {
  return [
    "ASK_SUGGESTION_MESSAGE",
    "ASK_SUGGESTION_CONTACT_PERMISSION",
    "ASK_SUGGESTION_CONTACT_PHONE",
    "REDIRECT",
    "REFERRAL_ASK"
  ].includes(step);
}

function isFreeTextSafeStep(step) {
  return ["WELCOME", "MENU", "DONE"].includes(step);
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
      organization: null,
      occupation_interest: null,
      email: null,
      phone: null,
      discovery_source: null,
      referral_code: null,
      whatsapp_group_interest: null,
      privacy_consent: null,
      registration_status: null,
      registration_completed_at: null,
      active_suggestion_id: null,
      funnel_interest: null,
      current_step: "WELCOME",
      conversation_mode: "flow"
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
      current_step: "WELCOME",
      conversation_mode: "flow"
    })
    .select()
    .single();

  if (insertError) {
    console.error("wa_users insert error:", insertError);
    throw insertError;
  }

  return newUser;
}

let updateUserImpl = async function updateUserInSupabase(wa_id, updates) {
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
};

async function updateUser(wa_id, updates) {
  return updateUserImpl(wa_id, updates);
}

function setUpdateUserForTests(updateFn) {
  updateUserImpl = updateFn;
}

let createSuggestionImpl = async function createSuggestionInSupabase({
  wa_id,
  suggestion_text,
  contact_opt_in = null,
  contact_phone = null
}) {
  if (!supabase) {
    return { id: null };
  }

  const { data, error } = await supabase
    .from("wa_suggestions")
    .insert({
      wa_id,
      suggestion_text,
      contact_opt_in,
      contact_phone
    })
    .select()
    .single();

  if (error) {
    console.error("wa_suggestions insert error:", error);
    throw error;
  }

  return data;
};

async function createSuggestion(payload) {
  return createSuggestionImpl(payload);
}

function setCreateSuggestionForTests(createFn) {
  createSuggestionImpl = createFn;
}

let updateSuggestionImpl = async function updateSuggestionInSupabase(id, updates) {
  if (!supabase || !id) {
    return;
  }

  const payload = {
    ...updates,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("wa_suggestions")
    .update(payload)
    .eq("id", id);

  if (error) {
    console.error("wa_suggestions update error:", error);
    throw error;
  }
};

async function updateSuggestion(id, updates) {
  return updateSuggestionImpl(id, updates);
}

function setUpdateSuggestionForTests(updateFn) {
  updateSuggestionImpl = updateFn;
}

async function buildReply(user, incomingText) {
  const text = (incomingText || "").trim();
  const lowered = text.toLowerCase();
  const conversationMode = user.conversation_mode || "flow";

  if (lowered === "reset" || isMenuWord(text)) {
    await updateUser(user.wa_id, { current_step: "MENU", conversation_mode: "flow" });
    return MENU_TEXT;
  }

  if (conversationMode === "rag") {
    if (isAiExitWord(text)) {
      await updateUser(user.wa_id, { conversation_mode: "flow" });
      return AI_MODE_EXIT_TEXT;
    }

    return askRag(text);
  }

  if (isFreeTextSafeStep(user.current_step)) {
    if (isHelloIntent(text)) {
      return HELLO_INTENT_TEXT;
    }

    if (isSupportIntent(text)) {
      return SUPPORT_INTENT_TEXT;
    }
  }

  if (user.current_step === "WELCOME") {
    const choice = parseMenuChoice(text);
    if (choice) {
      await updateUser(user.wa_id, { current_step: "MENU" });
      return handleMenuChoice(user, choice);
    }
    await updateUser(user.wa_id, { current_step: "MENU" });
    return MENU_TEXT;
  }

  if (user.current_step === "MENU") {
    const choice = parseMenuChoice(text);
    if (choice) return handleMenuChoice(user, choice);
    return "Anlayamadım 🤔\n\n" + MENU_TEXT + "\n\nİstersen sadece 1, 2, 3, 4 veya 5 yaz.\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  if (isLegacyRegistrationStep(user.current_step)) {
    await updateUser(user.wa_id, {
      current_step: "MENU",
      conversation_mode: "flow"
    });
    return REGISTRATION_FLOW_REMOVED_TEXT;
  }

  if (user.current_step === "ASK_SUGGESTION_MESSAGE") {
    if (parseMenuChoice(text) === 5) return AI_MODE_FLOW_GUARD_TEXT;
    if (!text) {
      return "Lütfen istek veya önerinizi detaylı şekilde yazın.\n\nAna menüye dönmek için “m” yazabilirsiniz.";
    }

    const suggestion = await createSuggestion({
      wa_id: user.wa_id,
      suggestion_text: text
    });

    await updateUser(user.wa_id, {
      active_suggestion_id: suggestion?.id || null,
      current_step: "ASK_SUGGESTION_CONTACT_PERMISSION"
    });

    return buildSuggestionContactPromptText();
  }

  if (user.current_step === "ASK_SUGGESTION_CONTACT_PERMISSION") {
    if (parseMenuChoice(text) === 5) return AI_MODE_FLOW_GUARD_TEXT;
    if (!isAffirmative(text) && !isNegative(text)) {
      return "Lütfen bir seçim yapın:\n\n" + buildSuggestionContactPromptText();
    }

    if (isAffirmative(text)) {
      await updateSuggestion(user.active_suggestion_id, { contact_opt_in: true });
      await updateUser(user.wa_id, { current_step: "ASK_SUGGESTION_CONTACT_PHONE" });
      return "WhatsApp numaranızı ülke kodu ile yazın.\nÖrnek: +49 170 1234567\n\nAna menüye dönmek için “m” yazabilirsiniz.";
    }

    await updateSuggestion(user.active_suggestion_id, { contact_opt_in: false });
    await updateUser(user.wa_id, {
      active_suggestion_id: null,
      current_step: "DONE"
    });
    return "Teşekkürler, istek ve önerinizi kaydettik ✅\n\nAna menüye dönmek için “m” yazabilirsiniz.\n" +
      `${WEBSITE_URL}/`;
  }

  if (user.current_step === "ASK_SUGGESTION_CONTACT_PHONE") {
    if (parseMenuChoice(text) === 5) return AI_MODE_FLOW_GUARD_TEXT;
    if (!isValidPhone(text)) {
      return "Telefon numarası + ile başlamalı ve ülke kodu içermelidir.\nÖrnek: +49 170 1234567";
    }

    await updateSuggestion(user.active_suggestion_id, {
      contact_opt_in: true,
      contact_phone: text
    });
    await updateUser(user.wa_id, {
      active_suggestion_id: null,
      current_step: "DONE"
    });
    return "Teşekkürler, istek ve önerinizi kaydettik ✅\n\nSize bu numara üzerinden ulaşabiliriz: " +
      `${text}\n\nAna menüye dönmek için “m” yazabilirsiniz.\n${WEBSITE_URL}/`;
  }

  if (user.current_step === "REDIRECT") {
    if (parseMenuChoice(text) === 5) return AI_MODE_FLOW_GUARD_TEXT;
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
    return "Anlayamadım 🤔\n\n" + buildRedirectText();
  }

  if (user.current_step === "REFERRAL_ASK") {
    if (parseMenuChoice(text) === 5) return AI_MODE_FLOW_GUARD_TEXT;
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
    const choice = parseMenuChoice(text);
    if (choice) return handleMenuChoice(user, choice);
    return "Kaydını aldım ✅\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  await updateUser(user.wa_id, { current_step: "WELCOME" });
  return "Bir şeyler karıştı. Baştan başlıyoruz.\n\n" + MENU_TEXT;
}

async function handleMenuChoice(user, choice) {
  if (choice === 1) {
    await updateUser(user.wa_id, { current_step: "REDIRECT" });
    return buildRedirectText();
  }
  if (choice === 2) {
    await updateUser(user.wa_id, { current_step: "REFERRAL_ASK" });
    return "WhatsApp içi kayıt akışı kaldırıldı.\n\n" +
      `Detaylı başvuru formu: ${DETAILED_FORM_LINK}\n\n` +
      "İsterseniz referral ve gelir fırsatları için devam edebilirsiniz.\n\n" +
      "Ana menüye dönmek için 'm' yazın.\n\n" +
      "Türk Diasporası CorteQS'e desteğin için teşekkürler!";
  }
  if (choice === 3) {
    await updateUser(user.wa_id, { current_step: "DONE" });
    return `Yetkili ile görüşmek için:\n${HUMAN_CONTACT_LINK}\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!\n${WEBSITE_URL}`;
  }
  if (choice === 4) {
    await updateUser(user.wa_id, {
      active_suggestion_id: null,
      current_step: "ASK_SUGGESTION_MESSAGE"
    });
    return buildSuggestionIntroText();
  }
  if (choice === 5) {
    const updates = { conversation_mode: "rag" };
    if (isStructuredFlowStep(user.current_step)) {
      return AI_MODE_FLOW_GUARD_TEXT;
    }
    await updateUser(user.wa_id, updates);
    return AI_MODE_WELCOME_TEXT;
  }
  return MENU_TEXT;
}

function buildRedirectText() {
  return "Hızlı Yönlendirme ⚡\n\n" +
    "Sizi ilgili kanallara yönlendirelim:\n\n" +
    "🌐 Web sitesi\n" +
    `${WEBSITE_URL}\n\n` +
    "📲 WhatsApp kanalı\n" +
    `${WA_CHANNEL_LINK}\n\n` +
    "💬 Yetkili ile direkt iletişim\n" +
    `${HUMAN_CONTACT_LINK}\n\n` +
    "Ana menüye dönmek için “m” yazabilirsiniz.\n\n" +
    "Türk diasporasına verdiğiniz destek için teşekkür ederiz.\n" +
    `${WEBSITE_URL}/`;
}

// --------------------------------------------------
// FORM SUBMISSION PROCESSING
// --------------------------------------------------
async function processFormSubmission(submission) {
  try {
    if (submission.form_type === "whatsapp_bot") {
      console.log("Skipping bot-originated submission:", submission.id);
      return;
    }

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
    await deliverAndLogMessage({
      waId: submission.phone,
      outgoingText: welcomeMessage
    });
    
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

function setupFormSubmissionSubscription() {
  if (!supabase) {
    console.warn('Supabase client not available - skipping Realtime subscription');
    return;
  }

  if (submissionsChannel) {
    console.log('Realtime subscription already initialized - skipping duplicate setup');
    return;
  }

  try {
    submissionsChannel = supabase
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
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to submissions table Realtime channel');
          return;
        }

        if (status === 'CHANNEL_ERROR') {
          console.error(
            'Realtime subscription failed. Check Supabase Realtime is enabled for public.submissions and the configured Supabase key has access.',
            error || ''
          );
          return;
        }

        if (status === 'TIMED_OUT' || status === 'CLOSED') {
          console.error('Realtime subscription status:', status, error || '');
        }
      });
  } catch (error) {
    submissionsChannel = null;
    console.error('Failed to set up Realtime subscription:', error);
  }
}

async function cleanupFormSubmissionSubscription() {
  if (!supabase || !submissionsChannel) {
    return;
  }

  const channel = submissionsChannel;
  submissionsChannel = null;
  await supabase.removeChannel(channel);
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
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    const status = value?.statuses?.[0];

    if (!message) {
      if (status) {
        console.log(
          "Status update:",
          JSON.stringify({
            recipient_id: status.recipient_id,
            status: status.status,
            timestamp: status.timestamp,
            conversation: status.conversation?.id,
            errors: status.errors
          })
        );
      }
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body || "";
    const incomingPhoneNumberId = value?.metadata?.phone_number_id || PHONE_NUMBER_ID;

    console.log("Incoming from:", from);
    console.log("Incoming message:", text);
    console.log("Reply via phone_number_id:", incomingPhoneNumberId);

    const user = await getOrCreateUser(from);
    console.log("User loaded, step:", user.current_step);

    const reply = await buildReply(user, text);
    console.log("Reply built, length:", reply.length);

    await deliverAndLogMessage({
      waId: from,
      incomingText: text,
      outgoingText: reply,
      phoneNumberId: incomingPhoneNumberId
    });
    console.log("Reply sent OK to:", from);

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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    setupFormSubmissionSubscription();
  });

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

async function shutdown(signal) {
  console.log(`${signal} received - shutting down`);
  await cleanupFormSubmissionSubscription();
  process.exit(0);
}

module.exports = {
  askRag,
  buildReply,
  isValidPhone,
  createSuggestion,
  deliverAndLogMessage,
  setCreateSuggestionForTests,
  setUpdateSuggestionForTests,
  setUpdateUserForTests
};
