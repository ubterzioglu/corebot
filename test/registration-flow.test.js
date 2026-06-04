process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildReply,
  setCreateSuggestionForTests,
  setUpdateSuggestionForTests,
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

test("menu 2 routes users to the detailed form instead of collecting registration data", async () => {
  const conversation = createConversation();

  const reply = await conversation.send("2");

  assert.equal(conversation.user.current_step, "REFERRAL_ASK");
  assert.match(reply, /kayıt akışı kaldırıldı/i);
  assert.match(reply, /Detaylı başvuru formu:/);
});

test("legacy registration steps are retired and bounce the user back to the main menu", async () => {
  const conversation = createConversation("ASK_EMAIL");

  const reply = await conversation.send("devam");

  assert.equal(conversation.user.current_step, "MENU");
  assert.equal(conversation.user.conversation_mode, "flow");
  assert.match(reply, /kayıt alma akışı kaldırıldı/i);
  assert.match(reply, /5️⃣ CorteQS AI'ya Sor/);
});

test("registration keywords now route to the detailed form option", async () => {
  const conversation = createConversation("MENU");

  const reply = await conversation.send("kayıt olmak istiyorum");

  assert.equal(conversation.user.current_step, "REFERRAL_ASK");
  assert.match(reply, /Detaylı başvuru formu:/);
});

test("menu command returns to the main menu from the suggestion flow", async () => {
  const conversation = createConversation("ASK_SUGGESTION_CONTACT_PHONE");

  const reply = await conversation.send("m");

  assert.equal(conversation.user.current_step, "MENU");
  assert.equal(conversation.user.conversation_mode, "flow");
  assert.match(reply, /CorteQS’e Hoş Geldiniz/);
});

test("menu 4 stores a suggestion without contact number", async () => {
  const conversation = createConversation();
  const createdSuggestions = [];
  const updatedSuggestions = [];

  setCreateSuggestionForTests(async (payload) => {
    createdSuggestions.push(payload);
    return { id: 42 };
  });

  setUpdateSuggestionForTests(async (id, updates) => {
    updatedSuggestions.push({ id, updates });
  });

  let reply = await conversation.send("4");
  assert.equal(conversation.user.current_step, "ASK_SUGGESTION_MESSAGE");
  assert.match(reply, /İstek ve Öneri Menüsü/);

  reply = await conversation.send("Topluluk etkinlikleri için şehir bazlı filtre eklenmeli.");
  assert.equal(conversation.user.current_step, "ASK_SUGGESTION_CONTACT_PERMISSION");
  assert.equal(conversation.user.active_suggestion_id, 42);
  assert.equal(createdSuggestions[0].suggestion_text, "Topluluk etkinlikleri için şehir bazlı filtre eklenmeli.");
  assert.match(reply, /WhatsApp numarası bırakmak ister misin/);

  reply = await conversation.send("2");
  assert.equal(conversation.user.current_step, "DONE");
  assert.equal(conversation.user.active_suggestion_id, null);
  assert.deepEqual(updatedSuggestions, [
    { id: 42, updates: { contact_opt_in: false } }
  ]);
  assert.match(reply, /istek ve önerinizi kaydettik/i);
});

test("menu 4 asks for a valid WhatsApp number when contact is requested", async () => {
  const conversation = createConversation("ASK_SUGGESTION_CONTACT_PERMISSION");
  const updatedSuggestions = [];

  conversation.user.active_suggestion_id = 77;

  setUpdateSuggestionForTests(async (id, updates) => {
    updatedSuggestions.push({ id, updates });
  });

  let reply = await conversation.send("1");
  assert.equal(conversation.user.current_step, "ASK_SUGGESTION_CONTACT_PHONE");
  assert.deepEqual(updatedSuggestions[0], { id: 77, updates: { contact_opt_in: true } });
  assert.match(reply, /WhatsApp numaranızı ülke kodu ile yazın/);

  reply = await conversation.send("0530 111 22 33");
  assert.equal(conversation.user.current_step, "ASK_SUGGESTION_CONTACT_PHONE");
  assert.match(reply, /Telefon numarası \+ ile başlamalı/);

  reply = await conversation.send("+90 530 111 22 33");
  assert.equal(conversation.user.current_step, "DONE");
  assert.equal(conversation.user.active_suggestion_id, null);
  assert.deepEqual(updatedSuggestions[1], {
    id: 77,
    updates: { contact_opt_in: true, contact_phone: "+90 530 111 22 33" }
  });
  assert.match(reply, /\+90 530 111 22 33/);
});
