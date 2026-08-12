import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, requireOwner, type OwnerAwareCtx } from "../toolkit/index.js";
import { deleteLead, getLead, listLeads, updateLead, type Lead } from "../lead-store.js";

const composer = new Composer<Ctx>();

async function ownerOnly(ctx: unknown): Promise<boolean> {
  return requireOwner(ctx as OwnerAwareCtx);
}

async function emptyDesk(ctx: Ctx): Promise<void> {
  await ctx.reply("No leads yet. New enquiries will appear here as they arrive.");
}

function leadLabel(lead: Lead): string {
  return `${lead.status === "Done" ? "Done" : "New"}: ${lead.name}`.slice(0, 60);
}

function detail(lead: Lead): string {
  return `Lead details\n\nName: ${lead.name}\nPhone: ${lead.phone}\nInterest: ${lead.intent}\nNote: ${lead.note}\nStatus: ${lead.status}`;
}

async function showPage(ctx: Ctx, requestedPage: number, edit: boolean): Promise<void> {
  const leads = await listLeads(ctx);
  if (leads.length === 0) {
    if (edit) {
      await ctx.editMessageText("No leads yet. New enquiries will appear here as they arrive.", {
        reply_markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]),
      });
    } else await emptyDesk(ctx);
    return;
  }
  const pages = Math.ceil(leads.length / 10);
  const page = Math.max(0, Math.min(requestedPage, pages - 1));
  const pageLeads = leads.slice(page * 10, page * 10 + 10);
  const rows = pageLeads.map((lead) => [inlineButton(leadLabel(lead), `leads:view:${lead.id}`)]);
  const navigation = [];
  if (page > 0) navigation.push(inlineButton("Previous", `leads:page:${page - 1}`));
  if (page < pages - 1) navigation.push(inlineButton("Next", `leads:page:${page + 1}`));
  if (navigation.length > 0) rows.push(navigation);
  const text = `Your leads (${leads.length})\nPage ${page + 1} of ${pages}`;
  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

composer.command("myleads", async (ctx) => {
  if (!(await ownerOnly(ctx))) return;
  try {
    await showPage(ctx, 0, false);
  } catch {
    await ctx.reply("Lead storage isn't available yet. Try again shortly.");
  }
});

// The owner-only /start menu points here. Keep this route separate from the
// public menu so a forged callback still passes through the same owner check.
composer.callbackQuery("view_leads", async (ctx) => {
  if (!(await ownerOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  try {
    await showPage(ctx, 0, true);
  } catch {
    await ctx.editMessageText("Lead storage isn't available yet. Try again shortly.");
  }
});

composer.callbackQuery(/^leads:page:\d+$/, async (ctx) => {
  if (!(await ownerOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  try {
    await showPage(ctx, Number(ctx.callbackQuery.data.split(":")[2]), true);
  } catch {
    await ctx.editMessageText("Lead storage isn't available yet. Try again shortly.");
  }
});

composer.callbackQuery(/^leads:view:([0-9a-f-]+)$/, async (ctx) => {
  if (!(await ownerOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  try {
    const lead = await getLead(ctx, ctx.match[1]);
    if (!lead) {
      await ctx.editMessageText("That lead is no longer available.");
      return;
    }
    if (!lead.owner_read) await updateLead(ctx, { ...lead, owner_read: true });
    await ctx.editMessageText(detail(lead), {
      reply_markup: inlineKeyboard([
        [inlineButton(lead.status === "New" ? "Mark done" : "Mark new", `leads:status:${lead.id}`)],
        [inlineButton("Delete lead", `leads:delete:${lead.id}`)],
        [inlineButton("Back to leads", "leads:page:0")],
      ]),
    });
  } catch {
    await ctx.editMessageText("Lead storage isn't available yet. Try again shortly.");
  }
});

composer.callbackQuery(/^leads:status:([0-9a-f-]+)$/, async (ctx) => {
  if (!(await ownerOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  try {
    const lead = await getLead(ctx, ctx.match[1]);
    if (!lead) {
      await ctx.editMessageText("That lead is no longer available.");
      return;
    }
    const updated = { ...lead, status: lead.status === "New" ? "Done" as const : "New" as const };
    await updateLead(ctx, updated);
    await ctx.editMessageText(detail(updated), {
      reply_markup: inlineKeyboard([
        [inlineButton(updated.status === "New" ? "Mark done" : "Mark new", `leads:status:${updated.id}`)],
        [inlineButton("Delete lead", `leads:delete:${updated.id}`)],
        [inlineButton("Back to leads", "leads:page:0")],
      ]),
    });
  } catch {
    await ctx.editMessageText("Lead storage isn't available yet. Try again shortly.");
  }
});

composer.callbackQuery(/^leads:delete:([0-9a-f-]+)$/, async (ctx) => {
  if (!(await ownerOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Delete this lead?", {
    reply_markup: inlineKeyboard([
      [inlineButton("Delete", `leads:delete:yes:${ctx.match[1]}`), inlineButton("Keep lead", `leads:view:${ctx.match[1]}`)],
    ]),
  });
});

composer.callbackQuery(/^leads:delete:yes:([0-9a-f-]+)$/, async (ctx) => {
  if (!(await ownerOnly(ctx))) return;
  await ctx.answerCallbackQuery();
  try {
    await deleteLead(ctx, ctx.match[1]);
    await ctx.editMessageText("Lead deleted.", {
      reply_markup: inlineKeyboard([[inlineButton("Back to leads", "leads:page:0")]]),
    });
  } catch {
    await ctx.editMessageText("Lead storage isn't available yet. Try again shortly.");
  }
});

export default composer;
