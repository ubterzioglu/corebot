process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  askRag,
  buildReply,
  setUpdateUserForTests
} = require("../index");

function createConversation(initialStep = "MENU", conversationMode = "flow") {
  const user = {
    wa_id: "905300000001",
    current_step: initialStep,
    conversation_mode: conversationMode
  };

  setUpdateUserForTests(async (waId, patch) => {
    assert.equal(waId, user.wa_id);
    Object.assign(user, patch);
  });

  return {
    user,
    send: (text) => buildReply(user, text)
  };
}

test.afterEach(() => {
  delete process.env.RAG_API_URL;
  delete process.env.RAG_API_SECRET;
  delete global.fetch;
});

test("askRag returns the answer from the RAG API", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";
  let request;

  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { answer: "CorteQS diaspora icin bir eslestirme platformudur." };
      }
    };
  };

  const answer = await askRag("CorteQS ne yapiyor?");

  assert.equal(answer, "CorteQS diaspora icin bir eslestirme platformudur.");
  assert.equal(request.url, process.env.RAG_API_URL);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.equal(request.options.headers.Authorization, undefined);
});

test("askRag adds bearer auth when RAG_API_SECRET is set", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";
  process.env.RAG_API_SECRET = "top-secret";
  let headers;

  global.fetch = async (url, options) => {
    headers = options.headers;
    return {
      ok: true,
      async json() {
        return { answer: "secured answer" };
      }
    };
  };

  const answer = await askRag("secure?");

  assert.equal(answer, "secured answer");
  assert.equal(headers.Authorization, "Bearer top-secret");
});

test("askRag returns the fallback answer when the payload has no answer", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";

  global.fetch = async () => ({
    ok: true,
    async json() {
      return {};
    }
  });

  const answer = await askRag("unknown");

  assert.equal(answer, "Bu konuda net bilgi bulamadım.");
});

test("askRag returns the unavailable message on non-200 and network failures", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";

  global.fetch = async () => ({
    ok: false,
    status: 500,
    statusText: "Internal Server Error"
  });

  let answer = await askRag("server error");
  assert.equal(
    answer,
    "Şu anda bilgi sistemine bağlanamıyorum. Lütfen daha sonra tekrar deneyin."
  );

  global.fetch = async () => {
    throw new Error("network down");
  };

  answer = await askRag("network error");
  assert.equal(
    answer,
    "Şu anda bilgi sistemine bağlanamıyorum. Lütfen daha sonra tekrar deneyin."
  );
});

test("MENU option 6 enters AI mode with the premium welcome text", async () => {
  const conversation = createConversation("MENU");

  const reply = await conversation.send("6");

  assert.equal(conversation.user.current_step, "MENU");
  assert.equal(conversation.user.conversation_mode, "rag");
  assert.match(reply, /CorteQS AI bilgi moduna hoş geldiniz/);
  assert.match(reply, /istediğiniz soruyu yazabilirsiniz/);
});

test("WELCOME hello intent returns a short greeting with m guidance", async () => {
  const conversation = createConversation("WELCOME");

  const reply = await conversation.send("merhaba");

  assert.equal(conversation.user.current_step, "WELCOME");
  assert.equal(conversation.user.conversation_mode, "flow");
  assert.match(reply, /^Merhaba!/);
  assert.match(reply, /"m" yazabilirsiniz/);
});

test("MENU hello intent returns a short greeting with m guidance", async () => {
  const conversation = createConversation("MENU");

  const reply = await conversation.send("merhaba");

  assert.equal(conversation.user.current_step, "MENU");
  assert.equal(conversation.user.conversation_mode, "flow");
  assert.match(reply, /^Merhaba!/);
  assert.match(reply, /"m" yazabilirsiniz/);
});

test("MENU support intent returns the friendly misunderstanding fallback", async () => {
  const conversation = createConversation("MENU");

  const reply = await conversation.send("yardım lazım");

  assert.equal(conversation.user.current_step, "MENU");
  assert.equal(conversation.user.conversation_mode, "flow");
  assert.match(reply, /Anlayamadım 🤔/);
  assert.match(reply, /"m" yazabilirsiniz/);
});

test("AI mode sends free-text questions to RAG without changing the current step", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";
  const conversation = createConversation("DONE", "rag");

  global.fetch = async () => ({
    ok: true,
    async json() {
      return { answer: "CorteQS; uyelik, firsatlar ve topluluk konusunda destek sunar." };
    }
  });

  const reply = await conversation.send("CorteQS ne yapiyor?");

  assert.equal(conversation.user.current_step, "DONE");
  assert.equal(conversation.user.conversation_mode, "rag");
  assert.match(reply, /uyelik, firsatlar ve topluluk/);
});

test("AI mode exits cleanly on çık and returns to flow mode", async () => {
  const conversation = createConversation("MENU", "rag");

  const reply = await conversation.send("çık");

  assert.equal(conversation.user.conversation_mode, "flow");
  assert.match(reply, /AI modundan çıkıldı/);
});

test("AI mode does not let hello or support intents override RAG behavior", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";
  const conversation = createConversation("DONE", "rag");

  global.fetch = async () => ({
    ok: true,
    async json() {
      return { answer: "RAG yaniti" };
    }
  });

  const reply = await conversation.send("yardım lazım");

  assert.equal(conversation.user.current_step, "DONE");
  assert.equal(conversation.user.conversation_mode, "rag");
  assert.equal(reply, "RAG yaniti");
});

test("AI mode returns to the main menu on m", async () => {
  const conversation = createConversation("DONE", "rag");

  const reply = await conversation.send("m");

  assert.equal(conversation.user.current_step, "MENU");
  assert.equal(conversation.user.conversation_mode, "flow");
  assert.match(reply, /6️⃣ CorteQS AI'ya Sor/);
});

test("registration flow does not enter AI mode when the user writes 6 mid-flow", async () => {
  const conversation = createConversation("ASK_EMAIL");

  const reply = await conversation.send("6");

  assert.equal(conversation.user.current_step, "ASK_EMAIL");
  assert.equal(conversation.user.conversation_mode, "flow");
  assert.match(reply, /Şu an kayıt adımındayız/);
});

test("MENU free-text no longer falls back to RAG", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";
  const conversation = createConversation("MENU");
  let fetchCalled = false;

  global.fetch = async () => {
    fetchCalled = true;
    return {
      ok: true,
      async json() {
        return { answer: "should not be used" };
      }
    };
  };

  const reply = await conversation.send("CorteQS ne yapiyor?");

  assert.equal(fetchCalled, false);
  assert.equal(conversation.user.conversation_mode, "flow");
  assert.match(reply, /İstersen sadece 1, 2, 3, 4, 5 veya 6 yaz/);
});
