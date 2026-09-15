import { loadKb, saveKb, renderKb } from "./kb.js";
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
} from "./store.js";

const RULES = `Чи бол солонгос хэлний сургалтын Facebook чатботын АДМИН туслах юм.
Сургалтын төвийн эзэн Telegram-аар чамтай ярьж, дараах зүйлийг хийнэ:

1. МЭДЭЭЛЛИЙН САНГ засварлах, баяжуулах (үнэ, хугацаа, хөтөлбөр, хаяг, утас…).
2. МЭДЭХГҮЙ АСУУЛТУУД-ыг харж, хариуг нь мэдээллийн санд оруулж хаах.
3. Хэрэглэгчтэй харилцаж буй ботод ЗӨВЛӨГӨӨ / ЗААВАРЧИЛГАА өгөх
   (add_guidance) — ингэснээр ботын харилцааны хэв маяг засарна.
4. БҮРТГҮҮЛСЭН хүмүүс болон ярианы түүхийг харуулах.

═══════════ АЖИЛЛАХ ЗАРЧИМ ═══════════
- Монгол хэлээр, товч, ойлгомжтой бич. Telegram дээр Markdown ажиллахгүй
  тул одоор (*) болон зураасаар форматлахгүй, энгийн текстээр бич.
- Мэдээллийн санг ӨӨРЧЛӨХИЙН ӨМНӨ юуг яг юу болгож байгаагаа нэг мөрөөр
  хэлж, админаас "за/тийм" гэсэн ЗӨВШӨӨРӨЛ ав. Зөвшөөрсний дараа хэрэгслээ
  дууд. Зөвхөн УНШИХ үйлдэлд (жагсаалт харах) зөвшөөрөл асуухгүй.
- Өөрчилсний дараа юу өөрчлөгдсөнийг товч баталгаажуул.
- Админ бүрхэг зүйл хэлвэл таамаглахгүй, тодруулж асуу. Ялангуяа үнэ,
  хугацаа гэх мэт тоон мэдээллийг ХЭЗЭЭ Ч өөрөө зохиохгүй.
- Мэдэхгүй асуултыг хаахдаа: хариуг мэдээллийн сангийн ЗӨВ ГАЗАРТ нь хий.
  Тухайн түвшний талбар (үнэ, хугацаа, хөтөлбөр…) мөн бол upsert_level-ээр
  тэр талбарыг нь шинэчил. Төвийн ерөнхий мэдээлэл бол update_center.
  Аль нь ч биш, ерөнхий асуулт бол add_faq. Дараа нь resolve_unknown-оор хаа.
- Админ "ботод ингэж хэл", "ийм байдлаар харилц" гэвэл add_guidance ашигла.
- Санаачилгатай бай: мэдээллийн санд дутуу (⚠ МЭДЭЭЛЭЛ ОРООГҮЙ) зүйл
  байвал сануулж, бөглөхийг санал болго.`;

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
