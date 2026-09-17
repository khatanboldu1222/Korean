import OpenAI from "openai";
import { env } from "./env.js";

let client = null;
function openai() {
  if (!client) client = new OpenAI({ apiKey: env.openaiKey, maxRetries: 2 });
  return client;
}

/*
 * OpenAI-ийн /v1/responses API-г ашиглана.
 *
 * Яагаад Chat Completions биш гэвэл: reasoning загварууд (gpt-5.x) дээр
 * функц хэрэгслийг Chat Completions дэмждэггүй —
 *   "Function tools with reasoning_effort are not supported ... in
 *    /v1/chat/completions. To use function tools, use /v1/responses"
 * Энэ ботын үндэс нь хэрэгсэл дуудах (save_lead, report_unknown) тул
 * Responses API нь цорын ганц зөв зам.
 *
 * Ярианы түүхийг бид НЭГ нийтлэг хэлбэрээр (Anthropic-ийн блок хэлбэр)
 * Redis-д хадгалдаг. Энэ файл түүнийг хөрвүүлж, хариуг нь буцаагаад
 * нийтлэг хэлбэрт оруулна — ингэснээр CUSTOMER_MODEL-ийг Claude ↔ OpenAI
 * хооронд сольсон ч хэрэглэгчийн хуучин яриа эвдрэхгүй.
 */

/** Нийтлэг хэлбэр → Responses API-ийн input жагсаалт. */
function toResponsesInput(messages) {
  const input = [];

  for (const m of messages) {
    if (typeof m.content === "string") {
      input.push({ role: m.role, content: m.content });
      continue;
    }

    if (m.role === "user") {
      for (const block of m.content) {
        if (block.type === "tool_result") {
          input.push({
            type: "function_call_output",
            call_id: block.tool_use_id,
            output:
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content),
          });
        } else if (block.type === "text") {
          input.push({ role: "user", content: block.text });
        }
      }
      continue;
    }

    // assistant — эхлээд текст, дараа нь хэрэгслийн дуудлагууд
    const text = m.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (text) input.push({ role: "assistant", content: text });

    for (const b of m.content) {
      if (b.type !== "tool_use") continue;
      input.push({
        type: "function_call",
        call_id: b.id,
        name: b.name,
        arguments: JSON.stringify(b.input ?? {}),
      });
    }
  }

  return input;
}

/** Нийтлэг хэлбэрийн хэрэгсэл → Responses API-ийн function tool. */
function toResponsesTools(tools) {
  return tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));
}

/**
 * Responses API-ийн хариу → нийтлэг хэлбэрийн блокууд.
 * Аргумент задлахад алдаа гарвал блок дотор биш, ТУСДАА буцаана —
 * нийтлэг түүхэнд нийлүүлэгчийн онцлог талбар үлдээж болохгүй
 * (дараа нь Claude руу буцаж сольход татгалзана).
 */
function toCommonBlocks(response) {
  const blocks = [];
  const parseErrors = new Map();
  let refusal = null;

  for (const item of response.output ?? []) {
    if (item.type === "message") {
      for (const c of item.content ?? []) {
        if (c.type === "output_text" && c.text) {
          blocks.push({ type: "text", text: c.text });
        } else if (c.type === "refusal") {
          refusal = c.refusal;
        }
      }
    } else if (item.type === "function_call") {
      let input = {};
      try {
        input = JSON.parse(item.arguments || "{}");
      } catch (err) {
        parseErrors.set(item.call_id, err.message);
      }
      blocks.push({
        type: "tool_use",
        id: item.call_id,
        name: item.name,
        input,
      });
    }
    // reasoning блокуудыг алгасна — нийтлэг түүхэнд хадгалахгүй
  }

  return { blocks, parseErrors, refusal };
}

/** Зөвхөн туршилтад — хөрвүүлэгчдийг шалгах зорилготой. */
export const _internals = {
  toResponsesInput,
  toResponsesTools,
  toCommonBlocks,
};

/**
 * OpenAI загвар дээрх агентын гогцоо. lib/claude.js доторх runAgent-тай
 * ЯГ ИЖИЛ орц/гарцтай тул дуудаж буй тал ялгааг мэдэхгүй.
 */
export async function runAgentOpenAI({
  systemBlocks,
  messages,
  tools,
  toolHandlers,
  model,
  maxTokens = 8000,
  maxIterations = 6,
}) {
  const msgs = [...messages];
  const texts = [];
  let stopReason = null;

  // Reasoning загварын бодох гүнийг OPENAI_REASONING_EFFORT-оор тааруулна
  // (minimal | low | medium | high). Тавиагүй бол загварын анхдагчаар.
  // Messenger удаан хүлээхийг тэвчихгүй тул удаашралтай бол "low" болго.
  const effort = process.env.OPENAI_REASONING_EFFORT;
  const reasoning = effort ? { reasoning: { effort } } : {};

  for (let i = 0; i < maxIterations; i += 1) {
    const response = await openai().responses.create({
      model,
      instructions: systemBlocks.map((b) => b.text).join("\n\n"),
      input: toResponsesInput(msgs),
      ...(tools?.length ? { tools: toResponsesTools(tools) } : {}),
      max_output_tokens: maxTokens,
      store: false,
      ...reasoning,
    });

    const { blocks, parseErrors, refusal } = toCommonBlocks(response);
    stopReason = response.status;

    if (refusal) {
      console.warn("[openai] refusal:", refusal);
      return { text: "", messages: msgs, stopReason: "refusal" };
    }

    msgs.push({ role: "assistant", content: blocks });

    for (const b of blocks) {
      if (b.type === "text" && b.text.trim()) texts.push(b.text.trim());
    }

    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) break;

    const results = [];
    for (const call of toolUses) {
      const parseError = parseErrors.get(call.id);
      if (parseError) {
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Аргументыг уншиж чадсангүй: ${parseError}`,
          is_error: true,
        });
        continue;
      }
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
          content: typeof output === "string" ? output : JSON.stringify(output),
        });
      } catch (err) {
        console.error(`[openai] "${call.name}" хэрэгсэл унав:`, err);
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
