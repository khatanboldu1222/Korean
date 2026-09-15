import OpenAI from "openai";
import { env } from "./env.js";

let client = null;
function openai() {
  if (!client) client = new OpenAI({ apiKey: env.openaiKey, maxRetries: 2 });
  return client;
}

/*
 * Ярианы түүхийг бид НЭГ нийтлэг хэлбэрээр (Anthropic-ийн блок хэлбэр)
 * Redis-д хадгалдаг. Энэ файл түүнийг OpenAI-ийн хэлбэр рүү хөрвүүлж,
 * хариуг нь буцаагаад нийтлэг хэлбэрт оруулна.
 *
 * Ингэснээр CUSTOMER_MODEL-ийг Claude ↔ OpenAI хооронд сольсон ч
 * хэрэглэгчийн хуучин яриа эвдрэхгүй.
 */

/** Нийтлэг хэлбэр → OpenAI-ийн мессежүүд. */
function toOpenAiMessages(systemBlocks, messages) {
  const out = [
    {
      role: "system",
      content: systemBlocks.map((b) => b.text).join("\n\n"),
    },
  ];

  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }

    if (m.role === "user") {
      // Хэрэгслийн үр дүн бүр OpenAI дээр ТУСДАА мессеж болно.
      for (const block of m.content) {
        if (block.type === "tool_result") {
          out.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content:
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content),
          });
        } else if (block.type === "text") {
          out.push({ role: "user", content: block.text });
        }
      }
      continue;
    }

    // assistant
    const text = m.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const toolCalls = m.content
      .filter((b) => b.type === "tool_use")
      .map((b) => ({
        id: b.id,
        type: "function",
        function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      }));

    const msg = { role: "assistant", content: text || null };
    if (toolCalls.length) msg.tool_calls = toolCalls;
    out.push(msg);
  }

  return out;
}

/** Нийтлэг хэлбэрийн хэрэгсэл → OpenAI-ийн function tool. */
function toOpenAiTools(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

/** OpenAI-ийн хариу → нийтлэг хэлбэрийн assistant блокууд. */
function toCommonBlocks(message) {
  const blocks = [];
  if (message.content) blocks.push({ type: "text", text: message.content });

  for (const call of message.tool_calls ?? []) {
    let input = {};
    let parseError = null;
    try {
      input = JSON.parse(call.function.arguments || "{}");
    } catch (err) {
      parseError = err.message;
    }
    blocks.push({
      type: "tool_use",
      id: call.id,
      name: call.function.name,
      input,
      ...(parseError ? { _parseError: parseError } : {}),
    });
  }

  return blocks;
}

/** Зөвхөн туршилтад — хөрвүүлэгчдийг шалгах зорилготой. */
export const _internals = { toOpenAiMessages, toOpenAiTools, toCommonBlocks };

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

  for (let i = 0; i < maxIterations; i += 1) {
    const completion = await openai().chat.completions.create({
      model,
      messages: toOpenAiMessages(systemBlocks, msgs),
      tools: toOpenAiTools(tools),
      max_completion_tokens: maxTokens,
    });

    const choice = completion.choices[0];
    const message = choice.message;
    stopReason = choice.finish_reason;

    if (message.refusal) {
      console.warn("[openai] refusal:", message.refusal);
      return { text: "", messages: msgs, stopReason: "refusal" };
    }

    const blocks = toCommonBlocks(message);
    msgs.push({ role: "assistant", content: blocks });

    for (const b of blocks) {
      if (b.type === "text" && b.text.trim()) texts.push(b.text.trim());
    }

    const toolUses = blocks.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) break;

    const results = [];
    for (const call of toolUses) {
      if (call._parseError) {
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Аргументыг уншиж чадсангүй: ${call._parseError}`,
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
