process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  askRag,
  buildReply,
  setUpdateUserForTests
} = require("../index");

function createConversation(initialStep = "MENU") {
  const user = {
    wa_id: "905300000001",
    current_step: initialStep
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
  assert.equal(request.options.body, JSON.stringify({ question: "CorteQS ne yapiyor?" }));
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

test("WELCOME uses RAG for free-text questions and keeps the current step", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";
  const conversation = createConversation("WELCOME");

  global.fetch = async () => ({
    ok: true,
    async json() {
      return { answer: "CorteQS, diaspora icin AI destekli bir topluluk platformudur." };
    }
  });

  const reply = await conversation.send("CorteQS ne yapiyor?");

  assert.equal(conversation.user.current_step, "WELCOME");
  assert.match(reply, /AI destekli bir topluluk platformudur/);
  assert.match(reply, /İstersen sadece 1, 2, 3 veya 4 yaz/);
});

test("MENU uses RAG for free-text questions but keeps numeric options in the existing flow", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";
  const conversation = createConversation("MENU");

  global.fetch = async () => ({
    ok: true,
    async json() {
      return { answer: "CorteQS, diaspora uyeleri icin rehberlik saglar." };
    }
  });

  let reply = await conversation.send("CorteQS ne yapiyor?");
  assert.equal(conversation.user.current_step, "MENU");
  assert.match(reply, /rehberlik saglar/);

  reply = await conversation.send("2");
  assert.equal(conversation.user.current_step, "ASK_CATEGORY");
  assert.match(reply, /İlginizi Kaydedin/);
});

test("registration validation still wins over RAG in ASK_EMAIL", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";
  const conversation = createConversation("ASK_EMAIL");
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

  const reply = await conversation.send("gecersiz-email");

  assert.equal(fetchCalled, false);
  assert.equal(conversation.user.current_step, "ASK_EMAIL");
  assert.match(reply, /E-posta formatı geçerli görünmüyor/);
});

test("DONE uses RAG for follow-up questions and menu command still returns to MENU", async () => {
  process.env.RAG_API_URL = "https://rag.corteqs.net/api/chat";
  const conversation = createConversation("DONE");

  global.fetch = async () => ({
    ok: true,
    async json() {
      return { answer: "CorteQS; kariyer, network ve relocation alanlarinda destek sunar." };
    }
  });

  let reply = await conversation.send("Hangi konularda yardimci oluyorsunuz?");
  assert.equal(conversation.user.current_step, "DONE");
  assert.match(reply, /kariyer, network ve relocation/);

  reply = await conversation.send("m");
  assert.equal(conversation.user.current_step, "MENU");
  assert.match(reply, /CorteQS’e Hoş Geldiniz/);
});
