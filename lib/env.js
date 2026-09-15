/** Орчны хувьсагчийг нэг цэгээс уншиж, дутууг эрт барьж авна. */

function get(name, { required = false, fallback = "" } = {}) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    if (required) {
      throw new Error(
        `Орчны хувьсагч "${name}" тохируулаагүй байна. .env.example-г үзнэ үү.`,
      );
    }
    return fallback;
  }
  return value;
}

export const env = {
  // Facebook
  get fbVerifyToken() {
    return get("FB_VERIFY_TOKEN", { required: true });
  },
  get fbPageToken() {
    return get("FB_PAGE_ACCESS_TOKEN", { required: true });
  },
  get fbAppSecret() {
    return get("FB_APP_SECRET");
  },

  // Telegram
  get tgBotToken() {
    return get("TELEGRAM_BOT_TOKEN", { required: true });
  },
  get tgWebhookSecret() {
    return get("TELEGRAM_WEBHOOK_SECRET");
  },
  get tgAdminChatIds() {
    return get("TELEGRAM_ADMIN_CHAT_IDS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },

  // Claude
  get anthropicKey() {
    return get("ANTHROPIC_API_KEY", { required: true });
  },
  get model() {
    return get("ANTHROPIC_MODEL", { fallback: "claude-opus-5" });
  },
};

/** Улаанбаатарын цагаар өнөөдрийн огноо, "2026-09-15 (Мягмар)" хэлбэрээр. */
export function todayInUB() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    weekday: "long",
  }).format(now);
  return `${date} (${weekday})`;
}
