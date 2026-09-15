import { redis } from "../lib/redis.js";

/** Тохиргоо бүрэн эсэхийг шалгах энгийн эндпойнт. Нууц утга харуулахгүй. */
export default async function handler(req, res) {
  const required = [
    "FB_VERIFY_TOKEN",
    "FB_PAGE_ACCESS_TOKEN",
    "FB_APP_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_ADMIN_CHAT_IDS",
    "TELEGRAM_WEBHOOK_SECRET",
    "ANTHROPIC_API_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];

  const env = Object.fromEntries(
    required.map((k) => [k, Boolean(process.env[k])]),
  );

  let kb = null;
  try {
    const stored = await redis().get("kb");
    kb = stored
      ? { seeded: true, version: stored.version, updatedAt: stored.updatedAt }
      : { seeded: false };
  } catch (err) {
    kb = { error: err.message };
  }

  const ready = required.every((k) => env[k]) && kb?.seeded === true;

  res.status(200).json({
    ready,
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    env,
    kb,
  });
}
