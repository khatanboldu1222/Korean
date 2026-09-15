/** Одоогийн мэдээллийн санг хэвлэнэ: node --env-file=.env scripts/show-kb.js */
import { loadKb, renderKb } from "../lib/kb.js";

const kb = await loadKb();
console.log(`Хувилбар: ${kb.version} | Шинэчилсэн: ${kb.updatedAt ?? "—"}\n`);
console.log(renderKb(kb));
