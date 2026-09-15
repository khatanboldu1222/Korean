import { loadKb, saveKb, renderKb, findLevel } from "./kb.js";
import { runAgent } from "./agent-run.js";
import { env, todayInUB } from "./env.js";
import {
  getHistory,
  saveHistory,
  listUnknowns,
  getUnknown,
  resolveUnknown,
  listLeads,
  countLeads,
  getLead,
  upsertLead,
  nextManualLeadId,
} from "./store.js";

const RULES = `Чи бол солонгос хэлний сургалтын төвийн Facebook чатботыг
ард нь удирддаг туслах. Төвийн эзэнтэй Telegram дээр ярина.

═══════════ ХАМГИЙН ЧУХАЛ — ХҮН ШИГ ЯРЬ ═══════════
Эзэнтэй ажлын хамт олон шиг, АЛБАН БУС, чөлөөтэй ярь. Албан бичиг биш,
чат яриа.

- Богино. Ихэнх хариу 1–3 мөр. Урт тайлбар бичихгүй.
- "Таны хүсэлтийг хүлээн авлаа", "Танд туслахдаа баяртай байна",
  "Дараах үйлдлийг гүйцэтгэлээ" гэх мэт албан хэллэг БҮҮ хэрэглэ.
- Гарчиг, тэмдэглэгээ, чимэглэл хэрэггүй. Энгийн ярианы текст.
  Telegram дээр Markdown ажиллахгүй тул одоор (*) хэрэглэхгүй.
- Эзэн "за", "тийм", "ok" гэхэд урт хариу бичихгүй — "За" гээд өнгөр.
- Emoji хааяа нэг ширхэг болно. Заавал биш.
- Эзэн монгол үгийг латинаар бичсэн ч (ж: "ene bolohgui bn") ойлгоод
  монголоор хариул.

ИНГЭЖ ЯРЬ:
  Эзэн: "анхан шатны үнийг 400 мянга болгомоор байна"
  Чи:   "Болсон, 400,000₮ болголоо 👍"

  Эзэн: "ene bolohgui bn"
  Чи:   "Юу болохгүй байна? Бот хариулахгүй байна уу, эсвэл өөр юм уу?"

  Эзэн: "дунд шатны хөтөлбөрийг яаж нэмдэг билээ"
  Чи:   "Надад л бичээд өг. Жишээ нь 'дунд шат: дүрэм, 1500 үг,
         ярианы дадлага' гэвэл би оруулчихна."

  Эзэн: "шинэ сурагч бүртгэлд орлоо, Болд гэдэг, 99112233"
  Чи:   "Бүртгэчихлээ. Ямар түвшин сонирхож байгаа юм бол?"

ИНГЭЖ БҮҮ ЯРЬ:
  "Таны хүсэлтийн дагуу мэдээллийн санд дараах өөрчлөлтийг
   амжилттай оруулсныг мэдэгдэж байна. Хувилбар: 7."

═══════════ ЮУ ХИЙХ ВЭ ═══════════
1. Мэдээллийн санг засварлах, баяжуулах (үнэ, хугацаа, хөтөлбөр, хаяг…).
2. Бот мэдэхгүй байсан асуултуудыг харж, хариуг нь санд оруулж хаах.
3. Хэрэглэгчтэй харилцдаг ботод байнга дагах зааварчилгаа өгөх
   (add_guidance) — эзэн "ботод ингэж хэл" гэвэл үүнийг ашигла.
4. Бүртгүүлсэн хүмүүс, ярианы түүхийг харуулах.
5. Утсаар залгасан, өөрөө ирсэн сурагчийг ГАРААР бүртгэх (add_lead).

═══════════ ЯАЖ АЖИЛЛАХ ВЭ ═══════════
- Эзэн мэдээлэл өгвөл ШУУД хадгал. "Болох уу?" гэж асуухгүй. Хадгалаад
  нэг мөрөөр "болсон" гэж хэл.
- ЗӨВХӨН эдгээрт зөвшөөрөл асуу:
  • Түвшин устгах (remove_level)
  • Байгаа утгыг огт өөр утгаар дарж бичих гэж байгаа бөгөөд эзэн
    хуучин утгыг нь мэдэхгүй байж болзошгүй үед
- Хоёрдмол зүйл бол таамаглахгүй, богинохон асуу. Ялангуяа үнэ, хугацаа
  гэх мэт тоог ХЭЗЭЭ Ч өөрөө зохиохгүй.
- Мэдэхгүй асуултыг хаахдаа хариуг нь ЗӨВ ГАЗАРТ нь хий: түвшний талбар
  бол upsert_level, төвийн мэдээлэл бол update_center, аль нь ч биш
  ерөнхий асуулт бол add_faq. Дараа нь resolve_unknown-оор хаа.
- Хувилбарын дугаар (version) зэрэг дотоод зүйлийг эзэнд хэлэх
  шаардлагагүй — өөрөө асуувал л хэл.
- Санд дутуу (⚠ МЭДЭЭЛЭЛ ОРООГҮЙ) зүйл байвал хааяа санамсаргүй
  сануул. Мессеж бүрт давтахгүй.

═══════════ "ЯАДАГ БИЛЭЭ" ГЭСЭН АСУУЛТАД ═══════════
Эзэн ямар нэг зүйл яаж хийхийг асуувал энгийнээр тайлбарла: ихэнх зүйлийг
надад монголоор бичихэд л болно.
Харин Vercel, Facebook, Telegram-ийн тохиргоо гэх мэт чиний гараас гадуур
зүйлийг БҮҮ зохио. Мэдэхгүй бол "тэрийг би эндээс хийж чадахгүй" гэж
шулуухан хэл.`;

const TOOLS = [
  {
    name: "get_kb",
    description:
      "Одоогийн мэдээллийн санг бүтнээр нь уншина. Ямар нэг зүйл " +
      "өөрчлөхийн өмнө одоогийн утгыг мэдэх хэрэгтэй бол эхлээд дуудна.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_center",
    description:
      "Сургалтын төвийн ерөнхий мэдээллийг шинэчилнэ. Зөвхөн дамжуулсан " +
      "талбарууд өөрчлөгдөнө. Талбарыг хоослох бол хоосон мөр ('') дамжуул.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Сургалтын төвийн нэр" },
        phones: {
          type: "array",
          items: { type: "string" },
          description: "Холбоо барих утасны дугаарууд",
        },
        address: { type: "string", description: "Дэлгэрэнгүй хаяг" },
        mapsUrl: { type: "string", description: "Google Maps линк" },
        workingHours: { type: "string", description: "Ажиллах цаг" },
        facebookPage: { type: "string" },
        notes: {
          type: "array",
          items: { type: "string" },
          description: "Нэмэлт тэмдэглэл (бүтнээр солигдоно)",
        },
      },
    },
  },
  {
    name: "upsert_level",
    description:
      "Сургалтын түвшнийг нэмнэ эсвэл шинэчилнэ. Байгаа түвшнийг id-гаар " +
      "нь олж, зөвхөн дамжуулсан талбарыг нь өөрчилнө.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "Түвшний id (латинаар, ж: zero / beginner / intermediate). " +
            "Шинэ түвшин бол шинэ id зохионо.",
        },
        name: { type: "string", description: "Түвшний нэр монголоор" },
        aliases: {
          type: "array",
          items: { type: "string" },
          description: "Хэрэглэгчийн хэлж болох өөр нэрнүүд",
        },
        forWhom: { type: "string", description: "Хэнд зориулсан бэ" },
        curriculum: { type: "string", description: "Сургалтын хөтөлбөр" },
        outcome: { type: "string", description: "Эзэмших үр дүн" },
        price: {
          type: "string",
          description: "Төлбөр, хэлэх ёстой яг хэлбэрээр (ж: '350,000₮')",
        },
        duration: { type: "string", description: "Үргэлжлэх хугацаа" },
        schedule: { type: "string", description: "Хичээлийн хуваарь" },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },
  {
    name: "remove_level",
    description: "Түвшнийг мэдээллийн сангаас бүрмөсөн устгана.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "set_enrollment_policy",
    description:
      "Хичээл эхлэх огноо / хичээлийн цагийн бодлогыг шинэчилнэ. " +
      "Одоогийн бодлого: бүх түвшинд уян хатан, багштай ярилцаж тохирно.",
    input_schema: {
      type: "object",
      properties: {
        policy: { type: "string", description: "Үндсэн бодлогын тайлбар" },
        notes: {
          type: "array",
          items: { type: "string" },
          description: "Нэмэлт тодруулгууд (бүтнээр солигдоно)",
        },
      },
      required: ["policy"],
    },
  },
  {
    name: "add_faq",
    description:
      "Баталгаажсан асуулт–хариултыг мэдээллийн санд нэмнэ. Хэрэглэгчийн " +
      "бот үүнийг шууд хариулж чадна.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Асуулт" },
        a: { type: "string", description: "Албан ёсны хариулт" },
      },
      required: ["q", "a"],
    },
  },
  {
    name: "remove_faq",
    description: "Асуулт–хариултыг id-гаар нь устгана.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "add_guidance",
    description:
      "Хэрэглэгчтэй харилцаж буй ботод байнга дагах ЗААВАРЧИЛГАА нэмнэ " +
      "(харилцааны хэв маяг, онцлох зүйл, хориглох зүйл). Бот үүнийг " +
      "мессеж бүрдээ уншина.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Зааварчилгааны текст" },
      },
      required: ["text"],
    },
  },
  {
    name: "remove_guidance",
    description: "Зааварчилгааг id-гаар нь устгана.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "list_unknowns",
    description:
      "Бот мэдэхгүй байсан асуултуудыг жагсаана. status: open (хаагдаагүй, " +
      "анхдагч), resolved, эсвэл all.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "resolved", "all"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "resolve_unknown",
    description:
      "Мэдэхгүй асуултыг хаана. Хариуг нь эхлээд мэдээллийн санд " +
      "(upsert_level / update_center / add_faq) оруулсны ДАРАА дуудна.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number" },
        answer: { type: "string", description: "Өгсөн хариулт" },
      },
      required: ["id", "answer"],
    },
  },
  {
    name: "add_lead",
    description:
      "Сурагчийг ГАРААР бүртгэнэ — утсаар залгасан, өөрөө ирсэн, " +
      "танилаараа дамжсан гэх мэт Messenger-ээр ирээгүй хүн. Эзэн " +
      "'шинэ сурагч бүртгэлд орлоо', 'нэг хүн залгасан' гэх мэт зүйл " +
      "хэлвэл үүнийг ашигла.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Сурагчийн нэр" },
        phone: { type: "string", description: "Утасны дугаар" },
        level_id: {
          type: "string",
          description: "Сонирхож буй түвшний id. Мэдэгдэхгүй бол хоосон орхи.",
        },
        preferred_start: { type: "string", description: "Хэзээ эхлэхийг хүсэж буй" },
        preferred_time: { type: "string", description: "Тохиромжтой цаг" },
        note: { type: "string", description: "Нэмэлт тэмдэглэл" },
      },
      required: ["name", "phone"],
    },
  },
  {
    name: "list_leads",
    description: "Хамгийн сүүлд бүртгүүлсэн хүмүүсийг жагсаана.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "get_conversation",
    description:
      "Нэг хэрэглэгчийн Messenger ярианы түүхийг PSID-аар нь харуулна. " +
      "PSID-г бүртгэл болон мэдэгдлээс олно.",
    input_schema: {
      type: "object",
      properties: { psid: { type: "string" } },
      required: ["psid"],
    },
  },
];

/** "" ирвэл null болгоно, undefined ирвэл хуучин утгыг хэвээр үлдээнэ. */
function patch(target, input, keys) {
  for (const key of keys) {
    if (input[key] === undefined) continue;
    target[key] = input[key] === "" ? null : input[key];
  }
}

function blocksToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => {
      if (b.type === "text") return b.text;
      if (b.type === "tool_use") return `[хэрэгсэл: ${b.name}]`;
      if (b.type === "tool_result") return "[хэрэгслийн хариу]";
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

const HANDLERS = {
  async get_kb() {
    const kb = await loadKb();
    return `Хувилбар: ${kb.version}, сүүлд шинэчилсэн: ${kb.updatedAt ?? "хэзээ ч үгүй"}\n\n${renderKb(kb)}`;
  },

  async update_center(input) {
    const kb = await loadKb();
    kb.center ??= {};
    patch(kb.center, input, [
      "name",
      "phones",
      "address",
      "mapsUrl",
      "workingHours",
      "facebookPage",
      "notes",
    ]);
    const saved = await saveKb(kb);
    return `Төвийн мэдээлэл шинэчлэгдлээ (хувилбар ${saved.version}).`;
  },

  async upsert_level(input) {
    const kb = await loadKb();
    kb.levels ??= [];
    let level = kb.levels.find((l) => l.id === input.id);
    let created = false;
    if (!level) {
      level = {
        id: input.id,
        name: input.name ?? input.id,
        aliases: [],
        forWhom: null,
        curriculum: null,
        outcome: null,
        price: null,
        duration: null,
        schedule: null,
        notes: [],
      };
      kb.levels.push(level);
      created = true;
    }
    patch(level, input, [
      "name",
      "aliases",
      "forWhom",
      "curriculum",
      "outcome",
      "price",
      "duration",
      "schedule",
      "notes",
    ]);
    const saved = await saveKb(kb);
    return `"${level.name}" түвшин ${created ? "нэмэгдлээ" : "шинэчлэгдлээ"} (хувилбар ${saved.version}).`;
  },

  async remove_level(input) {
    const kb = await loadKb();
    const before = kb.levels.length;
    kb.levels = kb.levels.filter((l) => l.id !== input.id);
    if (kb.levels.length === before) return `"${input.id}" id-тай түвшин олдсонгүй.`;
    const saved = await saveKb(kb);
    return `"${input.id}" түвшин устлаа (хувилбар ${saved.version}).`;
  },

  async set_enrollment_policy(input) {
    const kb = await loadKb();
    kb.enrollment ??= {};
    kb.enrollment.policy = input.policy;
    if (input.notes !== undefined) kb.enrollment.notes = input.notes;
    const saved = await saveKb(kb);
    return `Элсэлтийн бодлого шинэчлэгдлээ (хувилбар ${saved.version}).`;
  },

  async add_faq(input) {
    const kb = await loadKb();
    kb.faq ??= [];
    const id = (kb.faq.at(-1)?.id ?? 0) + 1;
    kb.faq.push({ id, q: input.q, a: input.a, addedAt: new Date().toISOString() });
    const saved = await saveKb(kb);
    return `Асуулт–хариулт #${id} нэмэгдлээ (хувилбар ${saved.version}).`;
  },

  async remove_faq(input) {
    const kb = await loadKb();
    kb.faq = (kb.faq ?? []).filter((f) => f.id !== input.id);
    const saved = await saveKb(kb);
    return `Асуулт–хариулт #${input.id} устлаа (хувилбар ${saved.version}).`;
  },

  async add_guidance(input) {
    const kb = await loadKb();
    kb.guidance ??= [];
    const id = (kb.guidance.at(-1)?.id ?? 0) + 1;
    kb.guidance.push({
      id,
      text: input.text,
      addedAt: new Date().toISOString(),
    });
    const saved = await saveKb(kb);
    return `Зааварчилгаа #${id} нэмэгдлээ. Бот дараагийн мессежээсээ эхлэн дагана (хувилбар ${saved.version}).`;
  },

  async remove_guidance(input) {
    const kb = await loadKb();
    kb.guidance = (kb.guidance ?? []).filter((g) => g.id !== input.id);
    const saved = await saveKb(kb);
    return `Зааварчилгаа #${input.id} устлаа (хувилбар ${saved.version}).`;
  },

  async list_unknowns(input) {
    const rows = await listUnknowns({
      status: input.status ?? "open",
      limit: input.limit ?? 20,
    });
    if (!rows.length) return "Хаагдаагүй мэдэхгүй асуулт алга байна.";
    return rows
      .map(
        (r) =>
          `#${r.id} [${r.status}] ${r.question}` +
          (r.context ? ` (нөхцөл: ${r.context})` : "") +
          ` — PSID ${r.psid}, ${r.createdAt}`,
      )
      .join("\n");
  },

  async resolve_unknown(input) {
    const existing = await getUnknown(input.id);
    if (!existing) return `#${input.id} дугаартай асуулт олдсонгүй.`;
    await resolveUnknown(input.id, input.answer);
    return `Асуулт #${input.id} хаагдлаа.`;
  },

  async add_lead(input) {
    const kb = await loadKb();
    const level = findLevel(kb, input.level_id);
    const id = await nextManualLeadId();
    const lead = await upsertLead(id, {
      name: input.name,
      phone: input.phone,
      levelId: level?.id ?? input.level_id ?? null,
      levelName: level?.name ?? null,
      preferredStart: input.preferred_start ?? null,
      preferredTime: input.preferred_time ?? null,
      note: input.note ?? null,
      source: "admin", // Messenger-ээр биш, админ гараар оруулсан
    });
    return (
      `${lead.name} (${lead.phone}) бүртгэгдлээ` +
      (lead.levelName ? `, ${lead.levelName}` : "") +
      "."
    );
  },

  async list_leads(input) {
    const [rows, total] = await Promise.all([
      listLeads(input.limit ?? 20),
      countLeads(),
    ]);
    if (!rows.length) return "Одоогоор бүртгүүлсэн хүн алга байна.";
    const lines = rows.map(
      (l) =>
        `${l.name ?? "—"} | ${l.phone ?? "—"} | ${l.levelName ?? l.levelId ?? "—"}` +
        ` | эхлэх: ${l.preferredStart ?? "—"} | цаг: ${l.preferredTime ?? "—"}` +
        ` | ${l.updatedAt} | PSID ${l.psid}`,
    );
    return `Нийт бүртгэл: ${total}\n\n${lines.join("\n")}`;
  },

  async get_conversation(input) {
    const [history, lead] = await Promise.all([
      getHistory(input.psid),
      getLead(input.psid),
    ]);
    if (!history.length) return "Энэ PSID-ээр ярианы түүх олдсонгүй.";
    const head = lead
      ? `Бүртгэл: ${lead.name ?? "—"} / ${lead.phone ?? "—"}\n\n`
      : "";
    const body = history
      .slice(-24)
      .map((m) => `${m.role === "user" ? "Хэрэглэгч" : "Бот"}: ${blocksToText(m.content)}`)
      .filter((line) => line.length > 12)
      .join("\n");
    return head + body;
  },
};

/** Telegram-аас ирсэн админы нэг мессежийг боловсруулна. */
export async function handleAdminMessage({ chatId, text, adminName }) {
  const historyKey = `admin:${chatId}`;
  const [kb, history] = await Promise.all([loadKb(), getHistory(historyKey)]);

  const systemBlocks = [
    { type: "text", text: RULES, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: [
        `Өнөөдрийн огноо: ${todayInUB()} (Улаанбаатарын цагаар).`,
        adminName ? `Чамтай ярьж буй админ: ${adminName}.` : null,
        "",
        "Мэдээллийн сангийн ОДООГИЙН байдал (лавлагаа):",
        renderKb(kb),
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  const messages = [...history, { role: "user", content: text }];

  const result = await runAgent({
    systemBlocks,
    messages,
    tools: TOOLS,
    toolHandlers: HANDLERS,
    model: env.adminModel, // админ AI үргэлж Claude дээр
    effort: "medium",
    maxTokens: 16000,
    maxIterations: 10,
  });

  const reply =
    result.text.trim() ||
    "Уучлаарай, хариу боловсруулж чадсангүй. Дахин оролдоно уу.";

  await saveHistory(historyKey, result.messages);
  return reply;
}

export async function resetAdminConversation(chatId) {
  await saveHistory(`admin:${chatId}`, []);
}
