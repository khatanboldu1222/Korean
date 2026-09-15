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
  // OpenAI (хэрэглэгчийн ботыг OpenAI загвар дээр ажиллуулах үед)
  get openaiKey() {
    return get("OPENAI_API_KEY", { required: true });
  },

  /** Админ AI-ийн загвар. Үргэлж Claude. */
  get adminModel() {
    return get("ANTHROPIC_MODEL", { fallback: "claude-opus-5" });
  },
  /**
   * Хэрэглэгчтэй харилцах ботын загвар. Claude эсвэл OpenAI-ийнх байж
   * болно — нэрээр нь таньж зөв нийлүүлэгч рүү чиглүүлнэ.
   * Тавиагүй бол админтай ижил загвар ажиллана.
   *   ж: claude-sonnet-5 | claude-haiku-4-5 | gpt-5 | gpt-4.1-mini
   */
  get customerModel() {
    return get("CUSTOMER_MODEL", { fallback: this.adminModel });
  },
};

/** Загварын нэрээр нийлүүлэгчийг тодорхойлно. */
export function providerOf(model) {
  return model.startsWith("claude-") ? "anthropic" : "openai";
}

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
