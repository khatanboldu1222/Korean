import { redis } from "./redis.js";
import { SEED_KB } from "../data/seed-kb.js";

const KB_KEY = "kb";

/** Мэдээллийн санг Redis-ээс уншина. Байхгүй бол үрийг буцаана. */
export async function loadKb() {
  const stored = await redis().get(KB_KEY);
  return stored ?? structuredClone(SEED_KB);
}

/** Мэдээллийн санг бичиж, хувилбарыг ахиулна. */
export async function saveKb(kb) {
  const next = {
    ...kb,
    version: (kb.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  await redis().set(KB_KEY, next);
  return next;
}

/** Түвшнийг id, нэр, эсвэл өөр нэрээр нь олно. */
export function findLevel(kb, needle) {
  if (!needle) return null;
  const q = String(needle).trim().toLowerCase();
  return (
    kb.levels.find((l) => l.id.toLowerCase() === q) ??
    kb.levels.find((l) => l.name.toLowerCase() === q) ??
    kb.levels.find((l) => (l.aliases ?? []).some((a) => a.toLowerCase() === q)) ??
    kb.levels.find((l) => l.name.toLowerCase().includes(q)) ??
    null
  );
}

const MISSING = "⚠ МЭДЭЭЛЭЛ ОРООГҮЙ";

function field(value) {
  if (value === null || value === undefined || value === "") return MISSING;
  if (Array.isArray(value)) return value.length ? value.join("; ") : MISSING;
  return String(value);
}

/**
 * Мэдээллийн санг AI-д өгөх текст болгоно.
 * ⚠ тэмдэгтэй мөрийг бот хэрэглэгчид хэлэхийг хориглосон — оронд нь
 * report_unknown дуудна.
 */
export function renderKb(kb) {
  const c = kb.center ?? {};
  const lines = [];

  lines.push("### СУРГАЛТЫН ТӨВ");
  lines.push(`- Нэр: ${field(c.name)}`);
  lines.push(`- Утас: ${field(c.phones)}`);
  lines.push(`- Хаяг: ${field(c.address)}`);
  lines.push(`- Байршлын линк: ${field(c.mapsUrl)}`);
  lines.push(`- Ажиллах цаг: ${field(c.workingHours)}`);
  if (c.facebookPage) lines.push(`- Facebook: ${c.facebookPage}`);
  for (const n of c.notes ?? []) lines.push(`- Нэмэлт: ${n}`);

  lines.push("");
  lines.push("### ЭЛСЭЛТ, ЭХЛЭХ ОГНОО, ХИЧЭЭЛИЙН ЦАГИЙН БОДЛОГО");
  lines.push(field(kb.enrollment?.policy));
  for (const n of kb.enrollment?.notes ?? []) lines.push(`- ${n}`);

  lines.push("");
  lines.push("### ТҮВШНҮҮД");
  for (const l of kb.levels ?? []) {
    lines.push("");
    lines.push(`#### ${l.name}  (id: ${l.id})`);
    lines.push(`- Хэнд зориулсан: ${field(l.forWhom)}`);
    lines.push(`- Сургалтын хөтөлбөр: ${field(l.curriculum)}`);
    lines.push(`- Эзэмших үр дүн: ${field(l.outcome)}`);
    lines.push(`- Төлбөр: ${field(l.price)}`);
    lines.push(`- Үргэлжлэх хугацаа: ${field(l.duration)}`);
    lines.push(`- Хичээлийн хуваарь: ${field(l.schedule)}`);
    for (const n of l.notes ?? []) lines.push(`- Нэмэлт: ${n}`);
  }

  if (kb.faq?.length) {
    lines.push("");
    lines.push("### БАТАЛГААЖСАН АСУУЛТ – ХАРИУЛТ");
    for (const f of kb.faq) {
      lines.push(`- А: ${f.q}`);
      lines.push(`  Х: ${f.a}`);
    }
  }

  if (kb.guidance?.length) {
    lines.push("");
    lines.push("### АДМИНААС ЧАМД ӨГСӨН ЗӨВЛӨГӨӨ (заавал дагана)");
    for (const g of kb.guidance) lines.push(`- ${g.text}`);
  }

  return lines.join("\n");
}
