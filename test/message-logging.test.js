process.env.NODE_ENV = "test";

const assert = require("node:assert/strict");
const test = require("node:test");

const { deliverAndLogMessage } = require("../index");

test("deliverAndLogMessage logs outbound webhook replies with the incoming text", async () => {
  const calls = [];

  await deliverAndLogMessage({
    waId: "905300000001",
    incomingText: "Merhaba",
    outgoingText: "Selam!",
    phoneNumberId: "12345",
    send: async (to, body, phoneNumberId) => {
      calls.push({ type: "send", to, body, phoneNumberId });
    },
    log: async (waId, messageText, replyText) => {
      calls.push({ type: "log", waId, messageText, replyText });
    }
  });

  assert.deepEqual(calls, [
    {
      type: "send",
      to: "905300000001",
      body: "Selam!",
      phoneNumberId: "12345"
    },
    {
      type: "log",
      waId: "905300000001",
      messageText: "Merhaba",
      replyText: "Selam!"
    }
  ]);
});

test("deliverAndLogMessage still logs proactive outbound messages when send fails", async () => {
  const calls = [];
  const sendError = new Error("Meta API down");

  await assert.rejects(
    deliverAndLogMessage({
      waId: "905300000002",
      outgoingText: "Hos geldin",
      send: async () => {
        throw sendError;
      },
      log: async (waId, messageText, replyText) => {
        calls.push({ waId, messageText, replyText });
      }
    }),
    sendError
  );

  assert.deepEqual(calls, [
    {
      waId: "905300000002",
      messageText: null,
      replyText: "Hos geldin"
    }
  ]);
});
