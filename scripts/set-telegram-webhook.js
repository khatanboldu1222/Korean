/**
 * Telegram ботын webhook-ийг тохируулна.
 *   node --env-file=.env scripts/set-telegram-webhook.js https://<таны-төсөл>.vercel.app
 *
 * Тохиргоог арилгах бол: ... scripts/set-telegram-webhook.js --delete
 */
import { env } from "../lib/env.js";

const api = (method) =>
  `https://api.telegram.org/bot${env.tgBotToken}/${method}`;

if (process.argv.includes("--delete")) {
  const res = await fetch(api("deleteWebhook"), { method: "POST" });
  console.log(await res.json());
  process.exit(0);
}

const base = process.argv[2] || process.env.PUBLIC_BASE_URL;
if (!base) {
  console.error(
    "Хаягаа өгнө үү. Жишээ:\n" +
      "  node --env-file=.env scripts/set-telegram-webhook.js https://korean-chatbot.vercel.app",
  );
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/telegram`;
const res = await fetch(api("setWebhook"), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url,
    secret_token: env.tgWebhookSecret || undefined,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: true,
  }),
});

const result = await res.json();
console.log(result);

if (result.ok) {
  console.log(`\n✅ Webhook тохирлоо: ${url}`);
  if (!env.tgWebhookSecret) {
    console.warn(
      "⚠ TELEGRAM_WEBHOOK_SECRET хоосон байна — хамгаалалт сул. Санамсаргүй " +
        "нууц үг үүсгээд Vercel болон .env хоёуланд нэмээрэй.",
    );
  }
  const info = await (await fetch(api("getWebhookInfo"))).json();
  console.log("\ngetWebhookInfo:", JSON.stringify(info.result, null, 2));
}
