/**
 * Мэдээллийн сангийн үрийг Redis рүү хийнэ.
 *   node --env-file=.env scripts/seed.js
 *   node --env-file=.env scripts/seed.js --force   (байгаа сангийн ДЭЭГҮҮР бичнэ)
 */
import { redis } from "../lib/redis.js";
import { SEED_KB } from "../data/seed-kb.js";
import { renderKb } from "../lib/kb.js";

const force = process.argv.includes("--force");

const existing = await redis().get("kb");
if (existing && !force) {
  console.log(
    `Мэдээллийн сан аль хэдийн байна (хувилбар ${existing.version}). ` +
      "Дарж бичих бол --force нэмнэ үү.",
  );
  process.exit(0);
}

const kb = {
  ...structuredClone(SEED_KB),
  updatedAt: new Date().toISOString(),
};
await redis().set("kb", kb);

console.log("Мэдээллийн сан бэлэн боллоо.\n");
console.log(renderKb(kb));
console.log(
  "\n⚠ гэсэн мөр бүрийг Telegram дээрх админ ботоор бөглөнө үү.",
);
