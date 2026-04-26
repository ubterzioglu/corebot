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
  "CorteQS’e Hoş Geldiniz 🚀\n" +
  "Size nasıl yardımcı olabiliriz?\n" +
  "1️⃣ Hızlı yönlendirme\n" +
  "2️⃣ Kayıt ol / Profil oluştur\n" +
  "3️⃣ Detaylı başvuru (gelir & referans sistemi)\n" +
  "4️⃣ Yetkili ile görüşme\n" +
  "Ana menüye dönmek için “m” yazabilirsiniz.\n" +
  "Türk diasporasına verdiğiniz destek için teşekkür ederiz.";

const CATEGORY_MAP = [
  { key: "career", label: "İş & Kariyer" },
  { key: "networking", label: "Networking" },
  { key: "relocation", label: "Relokasyon" },
  { key: "consulting", label: "Danışmanlık" },
  { key: "partnership", label: "İş ortaklığı" },
  { key: "monetization", label: "Referral / Para kazanma" },
  { key: "other", label: "Diğer" }
];

const DISCOVERY_SOURCE_MAP = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "referral", label: "Arkadaş / tavsiye" },
  { key: "event", label: "Etkinlik" },
  { key: "google_web", label: "Google / web" },
  { key: "other", label: "Diğer" }
];

const REGISTRATION_FOOTER =
  "Ana menüye dönmek için “m” yazabilirsiniz.\n" +
  "Opsiyonel alanları geçmek için “geç” yazabilirsiniz.";

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

function parseDiscoverySource(text) {
  const t = (text || "").toLowerCase().trim();
  const num = parseInt(t, 10);
  if (num >= 1 && num <= DISCOVERY_SOURCE_MAP.length) return DISCOVERY_SOURCE_MAP[num - 1].key;
  for (const source of DISCOVERY_SOURCE_MAP) {
    if (t.includes(source.key) || t.includes(source.label.toLowerCase())) return source.key;
  }
  if (t.includes("arkadaş") || t.includes("arkadas") || t.includes("tavsiye")) return "referral";
  if (t.includes("etkin")) return "event";
  if (t.includes("google") || t.includes("web")) return "google_web";
  return null;
}

function parseName(text) {
  const parts = (text || "").trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { name: null, surname: null };
  if (parts.length === 1) return { name: parts[0], surname: null };
  return { name: parts[0], surname: parts.slice(1).join(" ") };
}

function isValidEmail(text) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((text || "").trim());
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

function buildCategoryText() {
  return "Kategori / İlgi Alanı\n" +
    CATEGORY_MAP.map((c, i) => `${i + 1}️⃣ ${c.label}`).join("\n") +
    "\n\nİstersen sadece numara yaz.";
}

function buildDiscoverySourceText() {
  return "Bizi nereden buldunuz?\n" +
    DISCOVERY_SOURCE_MAP.map((source, i) => `${i + 1}️⃣ ${source.label}`).join("\n") +
    "\n\nLütfen numara veya kaynak adını yazın.";
}

function buildRegistrationIntroText() {
  return "İlginizi Kaydedin\n" +
    "🚀 Yakında açılıyoruz! İlk erişim için bilgilerinizi bırakın.\n\n" +
    "🎯 Yakında: AI Destekli Eşleştirme\n" +
    "🌍 Yakında: 50+ Şehir Ağı\n\n" +
    buildCategoryText() +
    "\n\nAna menüye dönmek için “m” yazabilirsiniz.";
}

function buildPrivacyConsentText() {
  return "Kişisel bilgilerimi, CorteQS tarafından tarafıma ulaşılması amacıyla paylaşıyorum. Bilgilerim üçüncü şahıslarla paylaşılmayacaktır.\n\n" +
    "1️⃣ Onaylıyorum\n" +
    "2️⃣ Onaylamıyorum";
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

async function buildReply(user, incomingText) {
  const text = (incomingText || "").trim();
  const lowered = text.toLowerCase();

  if (lowered === "reset" || isMenuWord(text)) {
    await updateUser(user.wa_id, { current_step: "MENU" });
    return MENU_TEXT;
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
    return "Anlayamadım 🤔\n\n" + MENU_TEXT + "\n\nİstersen sadece 1, 2, 3 veya 4 yaz.\n\nAna menüye dönmek için 'm' yazın.\n\nTürk Diasporası CorteQS'e desteğin için teşekkürler!";
  }

  if (user.current_step === "ASK_CATEGORY") {
    const catKey = parseCategoryChoice(text);
    if (!catKey) return "Anlayamadım 🤔\n\n" + buildCategoryText() + "\n\nAna menüye dönmek için “m” yazabilirsiniz.";
    await updateUser(user.wa_id, {
      category: catKey,
      registration_status: "in_progress",
      current_step: "ASK_FULL_NAME"
    });
    return "Ad Soyad\nAdınız Soyadınız\n\n" + REGISTRATION_FOOTER;
  }

  if (user.current_step === "ASK_FULL_NAME") {
    if (!text || isSkipWord(text)) return "Ad Soyad zorunludur.\nLütfen adınızı ve soyadınızı yazın.";
    const { name, surname } = parseName(text);
    await updateUser(user.wa_id, { name, surname, current_step: "ASK_COUNTRY" });
    return "Ülke\nÖrnek: Almanya\n\nAna menüye dönmek için “m” yazabilirsiniz.";
  }

  if (user.current_step === "ASK_COUNTRY") {
    if (!text || isSkipWord(text)) return "Ülke bilgisi zorunludur.\nÖrnek: Almanya";
    await updateUser(user.wa_id, { country: text, current_step: "ASK_CITY" });
    return "Şehir\nÖrnek: Berlin\n\nAna menüye dönmek için “m” yazabilirsiniz.";
  }

  if (user.current_step === "ASK_CITY") {
    if (!text || isSkipWord(text)) return "Şehir bilgisi zorunludur.\nÖrnek: Berlin";
    await updateUser(user.wa_id, { city: text, current_step: "ASK_ORGANIZATION" });
    return "İşletme / Kuruluş (opsiyonel)\nŞirket veya kuruluş adı\n\n" + REGISTRATION_FOOTER;
  }

  if (user.current_step === "ASK_ORGANIZATION") {
    if (isSkipWord(text)) {
      await updateUser(user.wa_id, { organization: null, current_step: "ASK_OCCUPATION_INTEREST" });
    } else {
      await updateUser(user.wa_id, { organization: text, current_step: "ASK_OCCUPATION_INTEREST" });
    }
    return "İştigal / İlgi Sahası\nFaaliyet veya ilgi alanınız\n\nAna menüye dönmek için “m” yazabilirsiniz.";
  }

  if (user.current_step === "ASK_OCCUPATION_INTEREST") {
    if (!text || isSkipWord(text)) return "İştigal / İlgi Sahası zorunludur.\nFaaliyet veya ilgi alanınızı yazın.";
    await updateUser(user.wa_id, { occupation_interest: text, current_step: "ASK_EMAIL" });
    return "E-posta\nÖrnek: ornek@mail.com\n\nAna menüye dönmek için “m” yazabilirsiniz.";
  }

  if (user.current_step === "ASK_EMAIL") {
    if (!isValidEmail(text)) {
      return "E-posta formatı geçerli görünmüyor.\nÖrnek: ornek@mail.com";
    }
    await updateUser(user.wa_id, { email: text, current_step: "ASK_PHONE" });
    return "Telefon (ülke kodu ile)\nÖrnek: +49 170 1234567\n\n+ ile başlatın, ülke kodu zorunlu.";
  }

  if (user.current_step === "ASK_PHONE") {
    if (!isValidPhone(text)) {
      return "Telefon numarası + ile başlamalı ve ülke kodu içermelidir.\nÖrnek: +49 170 1234567";
    }
    await updateUser(user.wa_id, { phone: text, current_step: "ASK_DISCOVERY_SOURCE" });
    return buildDiscoverySourceText() + "\n\nAna menüye dönmek için “m” yazabilirsiniz.";
  }

  if (user.current_step === "ASK_DISCOVERY_SOURCE") {
    const sourceKey = parseDiscoverySource(text);
    if (!sourceKey) return "Anlayamadım 🤔\n\n" + buildDiscoverySourceText();
    await updateUser(user.wa_id, { discovery_source: sourceKey, current_step: "ASK_REFERRAL_CODE" });
    return "Referral Kodu (opsiyonel)\nAdmin / davet kodu\n\nSizi yönlendiren admin veya davet kodunu girebilirsiniz.\n\n" + REGISTRATION_FOOTER;
  }

  if (user.current_step === "ASK_REFERRAL_CODE") {
    await updateUser(user.wa_id, {
      referral_code: isSkipWord(text) ? null : text,
      current_step: "ASK_DEMANDS"
    });
    return "Arz & Talepleriniz (opsiyonel)\nÖrn: İş arıyorum • Araç satıyorum • Etkinlik sponsoru arıyorum • Eleman arıyorum...\n\nDiasporadaki arz ve taleplerinizi serbestçe yazın. Detaylı veri AI eşleşme kalitesini artırır.\n\n" + REGISTRATION_FOOTER;
  }

  if (user.current_step === "ASK_DEMANDS") {
    await updateUser(user.wa_id, {
      note: isSkipWord(text) ? null : text,
      current_step: "ASK_WHATSAPP_GROUP_INTEREST"
    });
    return "💬 Kategori WhatsApp grubuna katılmak istiyorum.\nErken erişim, açılış avantajları ve topluluk duyuruları için davet linki size iletilecek.\n\n1️⃣ Evet, katılmak istiyorum\n2️⃣ Hayır";
  }

  if (user.current_step === "ASK_WHATSAPP_GROUP_INTEREST") {
    if (!isAffirmative(text) && !isNegative(text)) {
      return "Lütfen WhatsApp grubu tercihinizi seçin:\n1️⃣ Evet, katılmak istiyorum\n2️⃣ Hayır";
    }
    await updateUser(user.wa_id, {
      whatsapp_group_interest: isAffirmative(text),
      current_step: "ASK_PRIVACY_CONSENT"
    });
    return buildPrivacyConsentText();
  }

  if (user.current_step === "ASK_PRIVACY_CONSENT") {
    if (isAffirmative(text)) {
      await updateUser(user.wa_id, {
        privacy_consent: true,
        registration_status: "completed",
        registration_completed_at: new Date().toISOString(),
        current_step: "DONE"
      });
      return "Kayıt Bırak / Takip Et →\n\nKaydınızı aldık ✅\n⏳ Yakında! Platform açılır açılmaz size ilk haber vereceğiz. Erken kayıt avantajlarından yararlanın.\n\n✉️ info@corteqs.net\n\nAna menüye dönmek için “m” yazabilirsiniz.";
    }

    if (isNegative(text)) {
      await updateUser(user.wa_id, {
        privacy_consent: false,
        registration_status: "consent_declined",
        current_step: "ASK_PRIVACY_CONSENT"
      });
      return "Onay olmadan kayıt tamamlanamaz.\n\n" + buildPrivacyConsentText();
    }

    return "Lütfen kişisel bilgi onayı için seçim yapın:\n\n" + buildPrivacyConsentText();
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
    return "Anlayamadım 🤔\n\n" + buildRedirectText();
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
    return buildRedirectText();
  }
  if (choice === 2) {
    await updateUser(user.wa_id, {
      current_step: "ASK_CATEGORY",
      registration_status: "in_progress",
      privacy_consent: null,
      registration_completed_at: null
    });
    return buildRegistrationIntroText();
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
  return "Hızlı Yönlendirme ⚡\n" +
    "Sizi ilgili kanallara yönlendirelim:\n" +
    "🌐 Web sitesi\n" +
    `${WEBSITE_URL}\n` +
    "📲 WhatsApp kanalı\n" +
    `${WA_CHANNEL_LINK}\n` +
    "💬 İnsanla direkt iletişim\n" +
    `${HUMAN_CONTACT_LINK}\n\n` +
    "Ana menüye dönmek için “m” yazabilirsiniz.\n\n" +
    "Türk diasporasına verdiğiniz destek için teşekkür ederiz.";
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

    await sendWhatsAppMessage(from, reply, incomingPhoneNumberId);
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
  buildReply,
  buildCategoryText,
  buildDiscoverySourceText,
  parseCategoryChoice,
  parseDiscoverySource,
  isValidEmail,
  isValidPhone,
  setUpdateUserForTests
};
