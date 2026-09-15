import { redis, redisConfigured } from "../lib/redis.js";

/** Тохиргоо бүрэн эсэхийг шалгах энгийн эндпойнт. Нууц утга харуулахгүй. */
export default async function handler(req, res) {
  const simple = [
    "FB_VERIFY_TOKEN",
    "FB_PAGE_ACCESS_TOKEN",
    "FB_APP_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_ADMIN_CHAT_IDS",
    "TELEGRAM_WEBHOOK_SECRET",
    "ANTHROPIC_API_KEY",
  ];

  const env = Object.fromEntries(
    simple.map((k) => [k, Boolean(process.env[k])]),
  );
  // Upstash-ийн хувьсагч хоёр нэртэй байж болно — аль нэг нь байхад хангалттай.
  env.UPSTASH_REDIS = redisConfigured();

  let kb;
  if (!env.UPSTASH_REDIS) {
    kb = { error: "Upstash Redis тохируулаагүй байна." };
  } else {
    try {
      const stored = await redis().get("kb");
      kb = stored
        ? { seeded: true, version: stored.version, updatedAt: stored.updatedAt }
        : { seeded: false, hint: "npm run seed ажиллуулна уу." };
    } catch (err) {
      kb = { error: err.message };
    }
  }

  const missing = Object.entries(env)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);

  res.status(200).json({
    ready: missing.length === 0 && kb?.seeded === true,
    missing,
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    debugErrors: process.env.DEBUG_ERRORS === "1",
    env,
    kb,
  });
}
