import { Redis } from "@upstash/redis";

/**
 * Upstash Redis нь REST дээр ажилладаг тул serverless орчинд холболт барих
 * шаардлагагүй.
 *
 * Хувьсагчийн нэр хоёр янз байдаг:
 *   • Upstash консолоос шууд авбал  UPSTASH_REDIS_REST_URL / ..._TOKEN
 *   • Vercel → Storage-оос үүсгэвэл KV_REST_API_URL / KV_REST_API_TOKEN
 * Хоёуланг нь дэмжинэ.
 */
let client = null;

function readConfig() {
  const url = (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    ""
  ).trim();
  const token = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    ""
  ).trim();
  return { url, token };
}

/** Тохиргоо бүрэн эсэх — /api/health эндээс уншина. */
export function redisConfigured() {
  const { url, token } = readConfig();
  return Boolean(url && token && /^https?:\/\//.test(url));
}

export function redis() {
  if (client) return client;

  const { url, token } = readConfig();

  if (!url || !token) {
    throw new Error(
      "Upstash Redis тохируулаагүй байна. Vercel → Settings → Environment " +
        "Variables дотор UPSTASH_REDIS_REST_URL болон UPSTASH_REDIS_REST_TOKEN " +
        "(эсвэл KV_REST_API_URL / KV_REST_API_TOKEN) нэмээд ДАХИН DEPLOY хийнэ үү.",
    );
  }

  if (!/^https?:\/\//.test(url)) {
    throw new Error(
      `Upstash Redis-ийн хаяг буруу байна: "${url}". ` +
        "https:// -ээр эхэлсэн бүтэн хаяг байх ёстой " +
        "(ж: https://xxx-12345.upstash.io).",
    );
  }

  client = new Redis({ url, token });
  return client;
}
