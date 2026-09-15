import crypto from "node:crypto";
import { env } from "./env.js";

const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const MAX_MESSAGE_CHARS = 1900; // Messenger-ийн хязгаар 2000

function hmac(secret, body) {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function sameHex(a, b) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** ASCII бус тэмдэгтийг JSON-ийн \uXXXX хэлбэрт шилжүүлнэ. */
function escapeNonAscii(text) {
  return text.replace(
    /[^\x00-\x7F]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

/**
 * X-Hub-Signature-256 толгойг шалгана. Ингэснээр webhook рүү Facebook-оос
 * бусад хэн ч хүсэлт явуулж чадахгүй.
 *
 * Биеийг түүхийгээр нь авч чадаагүй (exact = false) үед Facebook ASCII бус
 * тэмдэгтийг \uXXXX болгож илгээсэн байж болох тул хоёр хувилбарыг хоёуланг
 * нь тулгана. Кирилл үсэгтэй мессеж энд л унадаг.
 */
export function verifySignature(rawBody, header, { exact = true } = {}) {
  const secret = env.fbAppSecret;
  if (!secret) return { ok: true, skipped: true }; // App Secret тавиагүй үед алгасна
  if (!header?.startsWith("sha256=")) {
    return { ok: false, reason: "толгой байхгүй" };
  }

  const got = header.slice("sha256=".length);

  if (sameHex(hmac(secret, rawBody), got)) return { ok: true, variant: "raw" };

  if (!exact) {
    const escaped = escapeNonAscii(rawBody);
    if (escaped !== rawBody && sameHex(hmac(secret, escaped), got)) {
      return { ok: true, variant: "escaped" };
    }
  }

  return {
    ok: false,
    reason: exact
      ? "FB_APP_SECRET буруу байх магадлалтай"
      : "биеийг түүхийгээр нь авч чадсангүй, эсвэл FB_APP_SECRET буруу",
    exact,
  };
}

async function callSendApi(payload) {
  const res = await fetch(`${GRAPH}/me/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.fbPageToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[fb] Send API алдаа", res.status, body);
  }
  return res.ok;
}

/** Урт текстийг 1900 тэмдэгтээр, догол мөр/өгүүлбэрийн зааглалаар хуваана. */
export function splitMessage(text, limit = MAX_MESSAGE_CHARS) {
  const out = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n\n", limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export async function sendText(psid, text) {
  for (const chunk of splitMessage(text)) {
    await callSendApi({
      recipient: { id: psid },
      messaging_type: "RESPONSE",
      message: { text: chunk },
    });
  }
}

/** action: "mark_seen" | "typing_on" | "typing_off" */
export async function sendAction(psid, action) {
  await callSendApi({ recipient: { id: psid }, sender_action: action });
}

/** Хэрэглэгчийн нэрийг авна. Эрх хүрэхгүй бол чимээгүй null буцаана. */
export async function getProfile(psid) {
  try {
    const res = await fetch(
      `${GRAPH}/${psid}?fields=first_name,last_name&access_token=${encodeURIComponent(env.fbPageToken)}`,
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
