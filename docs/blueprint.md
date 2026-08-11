# Real Estate Lead Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot for a real estate agent to capture leads from the public and manage them in a private interface. Public users submit leads with name, phone, intent (Buy/Rent/Sell), and a short note. The owner receives instant notifications for each new lead and can view, update, or delete leads in a private in-bot interface.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- prospective real estate clients
- real estate agent (owner)

## Success criteria

- Public users can submit leads with all required fields
- Owner receives instant Telegram notifications for new leads
- Owner can view, update, and delete leads in a private interface

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu for public users
- **/myleads** (command, actor: owner, command: /myleads) — Open the private lead management interface for the owner
- **Submit a lead** (button, actor: user, callback: lead:start) — Start the lead submission process for public users

## Flows

### Lead submission
_Trigger:_ lead:start

1. Show name input
2. Collect phone number (contact or typed)
3. Select intent (Buy/Rent/Sell)
4. Enter short note (max 300 chars)
5. Show confirmation summary with edit/confirm/cancel options
6. On confirm: save lead, notify owner, show thank-you

_Data touched:_ Lead

### Lead management
_Trigger:_ /myleads

1. Show paginated list of leads (10 per page)
2. Select lead to view details
3. Update status (New/Done) or delete lead

_Data touched:_ Lead

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram chat ID where lead notifications and management interface are available
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Lead** _(retention: persistent)_ — A lead submitted by a public user
  - fields: id, timestamp, name, phone, intent, note, status, owner_read

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Receive new lead notifications
- View, update, and delete leads

## Notifications

- Instant notification to owner for each new lead submission with all lead details and a quick action to view the lead

## Permissions & privacy

- Only the configured ADMIN_CHAT_ID can access the /myleads command and lead management actions
- Lead data is only visible to the owner and is not shared with third parties

## Edge cases

- User cancels lead submission at any step
- Owner tries to access /myleads from a non-admin chat
- Lead note exceeds 300 characters

## Required tests

- End-to-end test of lead submission flow from start to confirmation
- Test owner notification delivery and quick action functionality
- Test lead management interface with status updates and deletions

## Assumptions

- ADMIN_CHAT_ID will be provided by the owner after setup
- Phone number input will be normalized but not verified
- Lead note length is limited to 300 characters
