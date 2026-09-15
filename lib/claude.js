import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

let client = null;
function anthropic() {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicKey, maxRetries: 2 });
  }
  return client;
}

// Claude аюулгүй байдлын шалтгаанаар хүсэлтээс татгалзвал сервер талаас өөр
// загвараар дахин оролдоно. Хэрэв энэ beta идэвхгүй бол нэг л удаа унтраана.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
let fallbacksSupported = true;

/** Энэ тохиргоог зөвхөн Opus/Fable гэр бүл дэмждэг. */
function supportsFallbacks(model) {
  return model.startsWith("claude-opus-") || model.startsWith("claude-fable-");
}

/**
 * Загвар бүр өөр параметр авдаг:
 *   • Opus 5 / Sonnet 5 — adaptive thinking асаалттай, output_config.effort авна
 *   • Haiku 4.5 — effort-ыг ОГТ дэмжихгүй (400 буцаана), бодох горимгүй
 * Ингэснээр ANTHROPIC_MODEL_CUSTOMER-ийг ямар ч загвар руу сольж болно.
 */
function tuningFor(model, effort) {
  if (model.startsWith("claude-haiku-")) return {};
  return { output_config: { effort } };
}

// Ярианы түүх нийтлэг хэлбэрээр Redis-д хэвтдэг бөгөөд өөр нийлүүлэгч
// дээр үүссэн байж болно. Anthropic танихгүй талбар байвал татгалздаг тул
// блок бүрээс зөвшөөрөгдсөн талбаруудыг л үлдээнэ.
const ALLOWED_BLOCK_KEYS = {
  text: ["type", "text", "cache_control", "citations"],
  tool_use: ["type", "id", "name", "input"],
  tool_result: ["type", "tool_use_id", "content", "is_error"],
  thinking: ["type", "thinking", "signature"],
  redacted_thinking: ["type", "data"],
};

function sanitize(messages) {
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    return {
      role: m.role,
      content: m.content.map((block) => {
        const allowed = ALLOWED_BLOCK_KEYS[block.type];
        if (!allowed) return block;
        return Object.fromEntries(
          Object.entries(block).filter(([k]) => allowed.includes(k)),
        );
      }),
    };
  });
}

async function createMessage(params, model) {
  if (fallbacksSupported && supportsFallbacks(model)) {
    try {
      return await anthropic().beta.messages.create({
        ...params,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      });
    } catch (err) {
      // 400/403/404 = энэ beta аккаунтад нээгдээгүй. Бусад алдаа (429, 5xx)
      // бол жинхэнэ асуудал тул дамжуулна.
      const structural =
        err instanceof Anthropic.APIError &&
        [400, 403, 404].includes(err.status);
      if (!structural) throw err;

      console.warn(
        `[claude] server-side fallback боломжгүй (${err.status}), ` +
          `энгийн горимд шилжив: ${err.message}`,
      );
      fallbacksSupported = false;
    }
  }
  return await anthropic().messages.create(params);
}

/**
 * Хэрэгсэл ашигладаг агентын гогцоо.
 *
 * Claude хэрэгсэл дуудвал бид гүйцэтгээд үр дүнг буцаана, дуусах хүртэл
 * давтана. Бодох (thinking) горимыг ХААХГҮЙ — хаавал Claude заримдаа
 * хэрэгслийн дуудлагаа энгийн текст болгон бичдэг бөгөөд дуудлага
 * ажиллахгүй өнгөрдөг.
 *
 * @returns {{ text: string, messages: Array, stopReason: string|null }}
 */
export async function runAgent({
  systemBlocks,
  messages,
  tools,
  toolHandlers,
  model = env.adminModel,
  effort = "low",
  maxTokens = 8000,
  maxIterations = 6,
}) {
  const msgs = [...messages];
  const texts = [];
  let stopReason = null;

  for (let i = 0; i < maxIterations; i += 1) {
    const response = await createMessage(
      {
        model,
        max_tokens: maxTokens,
        ...tuningFor(model, effort),
        system: systemBlocks,
        tools,
        messages: sanitize(msgs),
      },
      model,
    );

    stopReason = response.stop_reason;

    if (stopReason === "refusal") {
      console.warn("[claude] refusal:", response.stop_details);
      return { text: "", messages: msgs, stopReason };
    }

    msgs.push({ role: "assistant", content: response.content });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        texts.push(block.text.trim());
      }
    }

    if (stopReason === "pause_turn") continue;

    const toolUses = response.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) break;

    const results = [];
    for (const call of toolUses) {
      const handler = toolHandlers[call.name];
      if (!handler) {
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Тодорхойгүй хэрэгсэл: ${call.name}`,
          is_error: true,
        });
        continue;
      }
      try {
        const output = await handler(call.input ?? {});
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content:
            typeof output === "string" ? output : JSON.stringify(output),
        });
      } catch (err) {
        console.error(`[claude] "${call.name}" хэрэгсэл унав:`, err);
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Алдаа гарлаа: ${err.message}`,
          is_error: true,
        });
      }
    }

    msgs.push({ role: "user", content: results });
  }

  return { text: texts.join("\n\n"), messages: msgs, stopReason };
}
