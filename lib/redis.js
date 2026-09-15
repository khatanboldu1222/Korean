import { Redis } from "@upstash/redis";

/**
 * Upstash Redis нь REST дээр ажилладаг тул serverless орчинд холболт барих
 * шаардлагагүй. UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN-оос уншина.
 */
let client = null;

export function redis() {
  if (!client) client = Redis.fromEnv();
  return client;
}
