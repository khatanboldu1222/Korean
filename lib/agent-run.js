import { providerOf } from "./env.js";
import { runAgent as runAgentClaude } from "./claude.js";
import { runAgentOpenAI } from "./provider-openai.js";

/**
 * Загварын нэрээр нь зөв нийлүүлэгч рүү чиглүүлнэ.
 *
 *   claude-*  → Anthropic (lib/claude.js)
 *   бусад     → OpenAI    (lib/provider-openai.js)
 *
 * Хоёр гогцоо ижил орц/гарцтай тул агентууд ялгааг мэдэх шаардлагагүй.
 * `effort` нь зөвхөн Claude дээр хүчинтэй — OpenAI талд үл хэрэгснэ.
 */
export async function runAgent(options) {
  if (!options.model) {
    throw new Error("runAgent: model заавал шаардлагатай.");
  }
  return providerOf(options.model) === "openai"
    ? runAgentOpenAI(options)
    : runAgentClaude(options);
}
