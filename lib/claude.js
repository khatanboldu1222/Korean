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

async function createMessage(params) {
  if (fallbacksSupported) {
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
  effort = "low",
  maxTokens = 8000,
  maxIterations = 6,
}) {
  const msgs = [...messages];
  const texts = [];
  let stopReason = null;

  for (let i = 0; i < maxIterations; i += 1) {
    const response = await createMessage({
      model: env.model,
      max_tokens: maxTokens,
      output_config: { effort },
      system: systemBlocks,
      tools,
      messages: msgs,
    });

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
