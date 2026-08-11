import type { Ctx } from "./bot.js";

export type LeadIntent = "Buy" | "Rent" | "Sell";

export interface Lead {
  id: string;
  timestamp: number;
  name: string;
  phone: string;
  intent: LeadIntent;
  note: string;
  status: "New" | "Done";
  owner_read: boolean;
}

type WorkerDataStore = {
  CHAT_DO?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(input: string, init?: { method: string; body?: string }): Promise<Response> };
  };
};

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
};

const INDEX_KEY = "real-estate-leads:index";
const leadKey = (id: string) => `real-estate-leads:${id}`;

function workerStore(ctx: Ctx): WorkerDataStore | undefined {
  return (ctx as Ctx & { env?: WorkerDataStore }).env;
}

function redisUrl(ctx: Ctx): string | undefined {
  const env = (ctx as Ctx & { env?: { REDIS_URL?: unknown } }).env;
  const fromWorker = env?.REDIS_URL;
  if (typeof fromWorker === "string" && fromWorker) return fromWorker;
  return typeof process === "undefined" ? undefined : process.env.REDIS_URL;
}

let redis: Promise<RedisClient> | undefined;
async function nodeRedis(url: string): Promise<RedisClient> {
  if (!redis) {
    redis = (async () => {
      // This is evaluated only on the Node deployment path. Workers use CHAT_DO
      // below and never load the Node-only Redis client.
      const load = new Function("moduleName", "return import(moduleName)") as (
        moduleName: string,
      ) => Promise<{ default?: unknown; Redis?: unknown }>;
      const imported = await load("ioredis");
      const Redis = (imported.default ?? imported.Redis) as new (url: string) => RedisClient;
      return new Redis(url);
    })();
  }
  return redis;
}

async function readValue<T>(ctx: Ctx, key: string): Promise<T | undefined> {
  const doNamespace = workerStore(ctx)?.CHAT_DO;
  if (doNamespace) {
    const response = await doNamespace.get(doNamespace.idFromName("app:real-estate-leads")).fetch(
      `https://do/data?key=${encodeURIComponent(key)}`,
      { method: "GET" },
    );
    if (response.status === 204) return undefined;
    return (await response.json()) as T;
  }
  const url = redisUrl(ctx);
  if (!url) return undefined;
  const value = await (await nodeRedis(url)).get(key);
  return value === null ? undefined : (JSON.parse(value) as T);
}

async function writeValue(ctx: Ctx, key: string, value: unknown): Promise<void> {
  const doNamespace = workerStore(ctx)?.CHAT_DO;
  if (doNamespace) {
    await doNamespace.get(doNamespace.idFromName("app:real-estate-leads")).fetch("https://do/data", {
      method: "PUT",
      body: JSON.stringify({ key, value }),
    });
    return;
  }
  const url = redisUrl(ctx);
  if (!url) throw new Error("persistent storage is unavailable");
  await (await nodeRedis(url)).set(key, JSON.stringify(value));
}

async function removeValue(ctx: Ctx, key: string): Promise<void> {
  const doNamespace = workerStore(ctx)?.CHAT_DO;
  if (doNamespace) {
    await doNamespace.get(doNamespace.idFromName("app:real-estate-leads")).fetch(
      `https://do/data?key=${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );
    return;
  }
  const url = redisUrl(ctx);
  if (!url) throw new Error("persistent storage is unavailable");
  await (await nodeRedis(url)).del(key);
}

export async function saveLead(ctx: Ctx, lead: Lead): Promise<void> {
  const ids = (await readValue<string[]>(ctx, INDEX_KEY)) ?? [];
  await writeValue(ctx, leadKey(lead.id), lead);
  if (!ids.includes(lead.id)) await writeValue(ctx, INDEX_KEY, [lead.id, ...ids]);
}

export async function listLeads(ctx: Ctx): Promise<Lead[]> {
  const ids = (await readValue<string[]>(ctx, INDEX_KEY)) ?? [];
  const leads = await Promise.all(ids.map((id) => readValue<Lead>(ctx, leadKey(id))));
  return leads.filter((lead): lead is Lead => lead !== undefined);
}

export async function getLead(ctx: Ctx, id: string): Promise<Lead | undefined> {
  return readValue<Lead>(ctx, leadKey(id));
}

export async function updateLead(ctx: Ctx, lead: Lead): Promise<void> {
  await writeValue(ctx, leadKey(lead.id), lead);
}

export async function deleteLead(ctx: Ctx, id: string): Promise<void> {
  const ids = (await readValue<string[]>(ctx, INDEX_KEY)) ?? [];
  await removeValue(ctx, leadKey(id));
  await writeValue(ctx, INDEX_KEY, ids.filter((candidate) => candidate !== id));
}
