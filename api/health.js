import { redis, redisConfigured } from "../lib/redis.js";
import { providerOf } from "../lib/env.js";

/** Тохиргоо бүрэн эсэхийг шалгах энгийн эндпойнт. Нууц утга харуулахгүй. */
export default async function handler(req, res) {
  const adminModel = process.env.ANTHROPIC_MODEL || "claude-opus-5";
  const customerModel = process.env.CUSTOMER_MODEL || adminModel;
  const customerProvider = providerOf(customerModel);

  const required = [
    "FB_VERIFY_TOKEN",
    "FB_PAGE_ACCESS_TOKEN",
    "FB_APP_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_ADMIN_CHAT_IDS",
    "TELEGRAM_WEBHOOK_SECRET",
    "ANTHROPIC_API_KEY", // админ AI үргэлж Claude дээр
  ];
  // OpenAI түлхүүр зөвхөн хэрэглэгчийн бот OpenAI дээр байхад л хэрэгтэй.
  if (customerProvider === "openai") required.push("OPENAI_API_KEY");

  const checks = Object.fromEntries(
    required.map((k) => [k, Boolean(process.env[k])]),
  );
  // Upstash-ийн хувьсагч хоёр нэртэй байж болно — аль нэг нь байхад хангалттай.
  checks.UPSTASH_REDIS = redisConfigured();

  let kb;
  if (!checks.UPSTASH_REDIS) {
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

  const missing = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);

  res.status(200).json({
    ready: missing.length === 0 && kb?.seeded === true,
    missing,
    models: {
      admin: adminModel,
      customer: customerModel,
      customerProvider,
    },
    debugErrors: process.env.DEBUG_ERRORS === "1",
    env: checks,
    kb,
  });
}
