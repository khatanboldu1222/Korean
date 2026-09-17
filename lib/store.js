import { redis } from "./redis.js";

const CONV_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 хоног
const MAX_HISTORY_MESSAGES = 30;

/* ───────────────────────── Ярианы түүх ───────────────────────── */

/**
 * Түүхийг тайрна. tool_use / tool_result хосыг салгаж болохгүй тул
 * заавал "жирийн user мессеж" дээрээс эхлүүлнэ.
 */
function trimHistory(messages) {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  let start = messages.length - MAX_HISTORY_MESSAGES;
  while (start < messages.length) {
    const m = messages[start];
    const isToolResult =
      Array.isArray(m.content) &&
      m.content.some((b) => b?.type === "tool_result");
    if (m.role === "user" && !isToolResult) break;
    start += 1;
  }
  return start >= messages.length ? [] : messages.slice(start);
}

export async function getHistory(psid) {
  return (await redis().get(`conv:${psid}`)) ?? [];
}

export async function saveHistory(psid, messages) {
  await redis().set(`conv:${psid}`, trimHistory(messages), {
    ex: CONV_TTL_SECONDS,
  });
}

export async function clearHistory(psid) {
  await redis().del(`conv:${psid}`);
}

/* ───────────────────────── Давхардлаас хамгаалах ───────────────────────── */

/**
 * Facebook хариу удаашрахад ижил мессежийг дахин илгээдэг. Нэг mid-г
 * нэг л удаа боловсруулна. true = шинэ мессеж.
 */
export async function claimMessage(mid) {
  if (!mid) return true;
  const ok = await redis().set(`seen:${mid}`, 1, { nx: true, ex: 600 });
  return ok === "OK";
}

/* ──────────────── Хэрэглэгч хамгийн сүүлд бичсэн хугацаа ──────────────── */

/**
 * Facebook рүү дараа нь буцаж бичихэд 24 цагийн цонх дууссан эсэхийг
 * мэдэх хэрэгтэй тул хэрэглэгч бичих бүрд тэмдэглэнэ.
 */
export async function touchLastSeen(psid) {
  await redis().set(`lastseen:${psid}`, Date.now(), {
    ex: 60 * 60 * 24 * 60, // 60 хоног
  });
}

export async function getLastSeen(psid) {
  const value = await redis().get(`lastseen:${psid}`);
  return value ? Number(value) : null;
}

/* ───────────────────────── Бүртгэл (lead) ───────────────────────── */

export async function upsertLead(psid, patch) {
  const key = `lead:${psid}`;
  const existing = (await redis().get(key)) ?? {
    psid,
    createdAt: new Date().toISOString(),
  };
  const lead = {
    ...existing,
    ...patch,
    psid,
    updatedAt: new Date().toISOString(),
  };
  await redis().set(key, lead);
  await redis().zadd("leads", { score: Date.now(), member: psid });
  return lead;
}

/**
 * Messenger-ээр ирээгүй (утсаар залгасан, өөрөө ирсэн) хүнийг бүртгэхэд
 * PSID байхгүй тул дотоод дугаар үүсгэнэ.
 */
export async function nextManualLeadId() {
  const n = await redis().incr("lead:manual:seq");
  return `manual:${n}`;
}

export async function getLead(psid) {
  return (await redis().get(`lead:${psid}`)) ?? null;
}

export async function listLeads(limit = 20) {
  const ids = await redis().zrange("leads", 0, limit - 1, { rev: true });
  if (!ids.length) return [];
  const leads = await Promise.all(ids.map((id) => redis().get(`lead:${id}`)));
  return leads.filter(Boolean);
}

export async function countLeads() {
  return (await redis().zcard("leads")) ?? 0;
}

/* ───────────────────────── Мэдэхгүй асуултууд ───────────────────────── */

export async function addUnknown({ psid, question, context }) {
  const id = await redis().incr("unknown:seq");
  const record = {
    id,
    psid,
    question,
    context: context ?? null,
    status: "open",
    answer: null,
    createdAt: new Date().toISOString(),
  };
  await redis().set(`unknown:${id}`, record);
  await redis().zadd("unknowns", { score: Date.now(), member: id });
  return record;
}

export async function listUnknowns({ status = "open", limit = 20 } = {}) {
  const ids = await redis().zrange("unknowns", 0, 199, { rev: true });
  if (!ids.length) return [];
  const rows = await Promise.all(
    ids.map((id) => redis().get(`unknown:${id}`)),
  );
  return rows
    .filter(Boolean)
    .filter((r) => status === "all" || r.status === status)
    .slice(0, limit);
}

export async function getUnknown(id) {
  return (await redis().get(`unknown:${id}`)) ?? null;
}

export async function resolveUnknown(id, answer) {
  const record = await getUnknown(id);
  if (!record) return null;
  const next = {
    ...record,
    status: "resolved",
    answer,
    resolvedAt: new Date().toISOString(),
  };
  await redis().set(`unknown:${id}`, next);
  return next;
}

/** Хариуг нь асуусан хүн рүү илгээсэн эсэхийг тэмдэглэнэ. */
export async function markUnknownDelivered(id, ok) {
  const record = await getUnknown(id);
  if (!record) return null;
  const next = {
    ...record,
    deliveredAt: ok ? new Date().toISOString() : null,
    deliveryFailed: !ok,
  };
  await redis().set(`unknown:${id}`, next);
  return next;
}
