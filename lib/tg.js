import { env } from "./env.js";

const MAX_TG_CHARS = 3800; // Telegram-ийн хязгаар 4096

function api(method) {
  return `https://api.telegram.org/bot${env.tgBotToken}/${method}`;
}

function chunk(text, limit = MAX_TG_CHARS) {
  const out = [];
  let rest = String(text).trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/** Энгийн текст илгээнэ (parse_mode ашиглахгүй — escape-ийн асуудал гарахгүй). */
export async function tgSend(chatId, text) {
  for (const part of chunk(text)) {
    const res = await fetch(api("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: part,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("[tg] sendMessage алдаа", res.status, await res.text());
    }
  }
}

export async function tgTyping(chatId) {
  await fetch(api("sendChatAction"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}

/** Бүх админ руу мэдэгдэл түлхэнэ. */
export async function notifyAdmins(text) {
  const ids = env.tgAdminChatIds;
  if (!ids.length) {
    console.warn("[tg] TELEGRAM_ADMIN_CHAT_IDS хоосон — мэдэгдэл явсангүй.");
    return;
  }
  await Promise.all(ids.map((id) => tgSend(id, text).catch(() => {})));
}

export function isAdmin(chatId) {
  return env.tgAdminChatIds.includes(String(chatId));
}
