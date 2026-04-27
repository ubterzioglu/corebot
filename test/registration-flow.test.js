process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildReply,
  setUpdateUserForTests
} = require("../index");

function createConversation(initialStep = "MENU") {
  const user = {
    wa_id: "905300000000",
    current_step: initialStep,
    conversation_mode: "flow"
  };
  const updates = [];

  setUpdateUserForTests(async (waId, patch) => {
    assert.equal(waId, user.wa_id);
    updates.push(patch);
    Object.assign(user, patch);
  });

  return {
    user,
    updates,
    send: (text) => buildReply(user, text)
  };
}

test("menu 2 collects the detailed registration flow and completes with consent", async () => {
  const conversation = createConversation();

  let reply = await conversation.send("2");
  assert.equal(conversation.user.current_step, "ASK_CATEGORY");
  assert.match(reply, /İlginizi Kaydedin/);

  reply = await conversation.send("1");
  assert.equal(conversation.user.category, "career");
  assert.equal(conversation.user.current_step, "ASK_FULL_NAME");
  assert.match(reply, /Ad Soyad/);

  await conversation.send("Ada Lovelace");
  assert.equal(conversation.user.name, "Ada");
  assert.equal(conversation.user.surname, "Lovelace");
  assert.equal(conversation.user.current_step, "ASK_COUNTRY");

  await conversation.send("Almanya");
  assert.equal(conversation.user.country, "Almanya");

  await conversation.send("Berlin");
  assert.equal(conversation.user.city, "Berlin");

  await conversation.send("geç");
  assert.equal(conversation.user.organization, null);

  await conversation.send("AI destekli eşleştirme");
  assert.equal(conversation.user.occupation_interest, "AI destekli eşleştirme");

  await conversation.send("ada@example.com");
  assert.equal(conversation.user.email, "ada@example.com");

  await conversation.send("+49 170 1234567");
  assert.equal(conversation.user.phone, "+49 170 1234567");

  await conversation.send("3");
  assert.equal(conversation.user.discovery_source, "linkedin");

  await conversation.send("geç");
  assert.equal(conversation.user.referral_code, null);

  await conversation.send("geç");
  assert.equal(conversation.user.note, null);

  await conversation.send("1");
  assert.equal(conversation.user.whatsapp_group_interest, true);

  reply = await conversation.send("onaylıyorum");
  assert.equal(conversation.user.privacy_consent, true);
  assert.equal(conversation.user.registration_status, "completed");
  assert.equal(conversation.user.current_step, "DONE");
  assert.ok(conversation.user.registration_completed_at);
  assert.match(reply, /Kaydınızı aldık/);
});

test("invalid email is rejected without advancing the registration step", async () => {
  const conversation = createConversation("ASK_EMAIL");

  const reply = await conversation.send("bad-email");

  assert.equal(conversation.user.current_step, "ASK_EMAIL");
  assert.equal(conversation.user.email, undefined);
  assert.match(reply, /E-posta formatı geçerli görünmüyor/);
});

test("phone must start with plus and include country code", async () => {
  const conversation = createConversation("ASK_PHONE");

  const reply = await conversation.send("0170 1234567");

  assert.equal(conversation.user.current_step, "ASK_PHONE");
  assert.equal(conversation.user.phone, undefined);
  assert.match(reply, /Telefon numarası \+ ile başlamalı/);
});

test("declining privacy consent keeps the registration incomplete", async () => {
  const conversation = createConversation("ASK_PRIVACY_CONSENT");

  const reply = await conversation.send("hayır");

  assert.equal(conversation.user.privacy_consent, false);
  assert.equal(conversation.user.registration_status, "consent_declined");
  assert.equal(conversation.user.current_step, "ASK_PRIVACY_CONSENT");
  assert.match(reply, /Onay olmadan kayıt tamamlanamaz/);
});

test("menu command returns to the main menu from any registration step", async () => {
  const conversation = createConversation("ASK_PHONE");

  const reply = await conversation.send("m");

  assert.equal(conversation.user.current_step, "MENU");
  assert.equal(conversation.user.conversation_mode, "flow");
  assert.match(reply, /CorteQS’e Hoş Geldiniz/);
});
