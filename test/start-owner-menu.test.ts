import { describe, expect, it } from "vitest";
import { buildBot } from "../src/bot.js";
import { runSpec } from "../src/toolkit/harness/runner.js";

describe("owner start menu", () => {
  it("shows View leads only to the configured owner and opens the private desk", async () => {
    const previousAdmin = process.env.ADMIN_CHAT_ID;
    process.env.ADMIN_CHAT_ID = "77";
    try {
      const owner = await runSpec(await buildBot("123456:TEST"), {
        name: "configured owner can open leads from start",
        steps: [
          {
            send: { text: "/start", chatId: 77, userId: 77 },
            expect: [
              {
                method: "sendMessage",
                payload: {
                  text: "Share your property plans and an agent will contact you. Tap 'Submit request' to begin.",
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "Submit request", callback_data: "lead:start" }],
                      [{ text: "❓ Help", callback_data: "menu:help" }],
                      [{ text: "View leads", callback_data: "view_leads" }],
                    ],
                  },
                },
              },
            ],
          },
          {
            send: { callback: "view_leads", chatId: 77, userId: 77 },
            expect: [
              {
                method: "editMessageText",
                payload: { text: "No leads yet. New enquiries will appear here as they arrive." },
              },
            ],
          },
        ],
      });
      expect(owner.ok, JSON.stringify(owner)).toBe(true);

      const publicUser = await runSpec(await buildBot("123456:TEST"), {
        name: "public user does not receive owner controls",
        steps: [
          {
            send: { text: "/start", chatId: 1, userId: 1 },
            expect: [
              {
                method: "sendMessage",
                payload: {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "Submit request", callback_data: "lead:start" }],
                      [{ text: "❓ Help", callback_data: "menu:help" }],
                    ],
                  },
                },
              },
            ],
          },
        ],
      });
      expect(publicUser.ok, JSON.stringify(publicUser)).toBe(true);
    } finally {
      if (previousAdmin === undefined) delete process.env.ADMIN_CHAT_ID;
      else process.env.ADMIN_CHAT_ID = previousAdmin;
    }
  });
});
