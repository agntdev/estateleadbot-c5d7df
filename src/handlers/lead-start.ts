import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { now } from "../clock.js";
import { saveLead, type Lead } from "../lead-store.js";
import {
  adminChatId,
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";

registerMainMenuItem({ label: "Submit a lead", data: "lead:start", order: 10 });

const composer = new Composer<Ctx>();

const cancelKeyboard = inlineKeyboard([[inlineButton("Cancel", "lead:cancel")]]);

function reset(ctx: Ctx): void {
  ctx.session.leadDraft = undefined;
  ctx.session.leadStep = undefined;
}

function cleanPhone(value: string): string {
  return value.trim().replace(/[\s()\-.]/g, "");
}

function summary(ctx: Ctx): string {
  const draft = ctx.session.leadDraft;
  return `Please confirm your details:\n\nName: ${draft?.name}\nPhone: ${draft?.phone}\nInterest: ${draft?.intent}\nNote: ${draft?.note}`;
}

async function askName(ctx: Ctx): Promise<void> {
  ctx.session.leadStep = "name";
  await ctx.reply("What is your name?", { reply_markup: cancelKeyboard });
}

async function askPhone(ctx: Ctx): Promise<void> {
  ctx.session.leadStep = "phone";
  await ctx.reply("What is the best phone number to reach you? You can type it or share a contact.", {
    reply_markup: cancelKeyboard,
  });
}

async function askNote(ctx: Ctx): Promise<void> {
  ctx.session.leadStep = "note";
  await ctx.reply("Add a short note about what you need. Keep it under 300 characters.", {
    reply_markup: cancelKeyboard,
  });
}

async function showConfirmation(ctx: Ctx): Promise<void> {
  ctx.session.leadStep = "confirm";
  await ctx.reply(summary(ctx), {
    reply_markup: inlineKeyboard([
      [inlineButton("Confirm", "lead:confirm")],
      [
        inlineButton("Edit name", "lead:edit:name"),
        inlineButton("Edit phone", "lead:edit:phone"),
      ],
      [
        inlineButton("Edit interest", "lead:edit:intent"),
        inlineButton("Edit note", "lead:edit:note"),
      ],
      [inlineButton("Cancel", "lead:cancel")],
    ]),
  });
}

composer.callbackQuery("lead:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  reset(ctx);
  ctx.session.leadDraft = {};
  await askName(ctx);
});

composer.callbackQuery("lead:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  reset(ctx);
  await ctx.editMessageText("Your lead submission was cancelled.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery("lead:intent:buy", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.leadDraft) ctx.session.leadDraft = {};
  ctx.session.leadDraft.intent = "Buy";
  await askNote(ctx);
});
composer.callbackQuery("lead:intent:rent", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.leadDraft) ctx.session.leadDraft = {};
  ctx.session.leadDraft.intent = "Rent";
  await askNote(ctx);
});
composer.callbackQuery("lead:intent:sell", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.leadDraft) ctx.session.leadDraft = {};
  ctx.session.leadDraft.intent = "Sell";
  await askNote(ctx);
});

composer.callbackQuery(/^lead:edit:(name|phone|intent|note)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const field = ctx.match[1];
  if (field === "name") return askName(ctx);
  if (field === "phone") return askPhone(ctx);
  if (field === "note") return askNote(ctx);
  ctx.session.leadStep = undefined;
  await ctx.reply("Choose what you are interested in.", {
    reply_markup: inlineKeyboard([
      [inlineButton("Buy", "lead:intent:buy"), inlineButton("Rent", "lead:intent:rent")],
      [inlineButton("Sell", "lead:intent:sell")],
      [inlineButton("Cancel", "lead:cancel")],
    ]),
  });
});

composer.callbackQuery("lead:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const lead = ctx.session.leadDraft;
  if (!lead?.name || !lead.phone || !lead.intent || lead.note === undefined) {
    reset(ctx);
    await ctx.editMessageText("Those details are no longer available. Start again from the menu.");
    return;
  }

  const saved: Lead = {
    id: crypto.randomUUID(),
    timestamp: now(),
    name: lead.name,
    phone: lead.phone,
    intent: lead.intent,
    note: lead.note,
    status: "New",
    owner_read: false,
  };
  try {
    await saveLead(ctx, saved);
  } catch {
    await ctx.editMessageText("We couldn't save your details just now. Please try again shortly.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
    });
    return;
  }
  const owner = adminChatId(ctx as unknown as { env?: Record<string, unknown> });
  if (owner) {
    try {
      await ctx.api.sendMessage(owner, `New lead received:\n\nName: ${saved.name}\nPhone: ${saved.phone}\nInterest: ${saved.intent}\nNote: ${saved.note}`, {
        reply_markup: inlineKeyboard([[inlineButton("View lead", `leads:view:${saved.id}`)]]),
      });
    } catch {
      // A blocked or unavailable owner must not prevent the client confirmation.
    }
  }
  reset(ctx);
  await ctx.editMessageText("Thank you. The agent has received your details and will be in touch.", {
    reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
  });
});

composer.on("message:contact", async (ctx, next) => {
  if (ctx.session.leadStep !== "phone") return next();
  const phone = cleanPhone(ctx.message.contact.phone_number);
  if (phone.length < 5) {
    await ctx.reply("That phone number looks too short. Try again.", { reply_markup: cancelKeyboard });
    return;
  }
  if (!ctx.session.leadDraft) ctx.session.leadDraft = {};
  ctx.session.leadDraft.phone = phone;
  ctx.session.leadStep = undefined;
  await ctx.reply("What are you interested in?", {
    reply_markup: inlineKeyboard([
      [inlineButton("Buy", "lead:intent:buy"), inlineButton("Rent", "lead:intent:rent")],
      [inlineButton("Sell", "lead:intent:sell")],
      [inlineButton("Cancel", "lead:cancel")],
    ]),
  });
});

composer.on("message:text", async (ctx, next) => {
  const value = ctx.message.text.trim();
  if (!ctx.session.leadStep) return next();
  if (value === "/start" || value === "/help") return next();
  if (ctx.session.leadStep === "name") {
    if (value.length < 2 || value.length > 80) {
      await ctx.reply("Enter a name between 2 and 80 characters.", { reply_markup: cancelKeyboard });
      return;
    }
    if (!ctx.session.leadDraft) ctx.session.leadDraft = {};
    ctx.session.leadDraft.name = value;
    await askPhone(ctx);
    return;
  }
  if (ctx.session.leadStep === "phone") {
    const phone = cleanPhone(value);
    if (phone.length < 5 || phone.length > 25) {
      await ctx.reply("Enter a valid phone number, or share a contact.", { reply_markup: cancelKeyboard });
      return;
    }
    if (!ctx.session.leadDraft) ctx.session.leadDraft = {};
    ctx.session.leadDraft.phone = phone;
    ctx.session.leadStep = undefined;
    await ctx.reply("What are you interested in?", {
      reply_markup: inlineKeyboard([
        [inlineButton("Buy", "lead:intent:buy"), inlineButton("Rent", "lead:intent:rent")],
        [inlineButton("Sell", "lead:intent:sell")],
        [inlineButton("Cancel", "lead:cancel")],
      ]),
    });
    return;
  }
  if (ctx.session.leadStep === "note") {
    if (value.length > 300) {
      await ctx.reply("Keep your note to 300 characters or fewer.", { reply_markup: cancelKeyboard });
      return;
    }
    if (!ctx.session.leadDraft) ctx.session.leadDraft = {};
    ctx.session.leadDraft.note = value;
    await showConfirmation(ctx);
  }
});

export default composer;
