import { env } from "../lib/env.js";
import { readRawBody } from "../lib/raw-body.js";
import { tgSend, tgTyping, isAdmin } from "../lib/tg.js";
import { claimMessage } from "../lib/store.js";
import { handleAdminMessage, resetAdminConversation } from "../lib/agent-admin.js";

export const config = { api: { bodyParser: false } };

const WELCOME = `Сайн уу! Би Facebook дээрх ботыг ард нь удирдана.

Надад энгийнээр бичээд өгөөрэй, жишээ нь:

"анхан шатны үнэ 350 мянга, 2 сар"
"утас 9911-2233 болгоод өг"
"хаяг нь СБД 1-р хороо, ... "
"мэдэхгүй асуултууд юу байна"
"сүүлийн бүртгэлүүдийг харуулаач"
"шинэ сурагч орлоо, Болд, 99112233"
"ботод хэл: үнэ хэлэхдээ хөнгөлөлтөө заавал дурд"

Товчлол: /kb  /unknowns  /leads  /reset`;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // Telegram-д өгсөн нууц үгээр хандалтыг шалгана.
  const secret = env.tgWebhookSecret;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    console.warn("[telegram] Нууц үг таарсангүй.");
    return res.status(403).send("Forbidden");
  }

  let update;
  try {
    update = JSON.parse((await readRawBody(req)).raw);
  } catch (err) {
    console.error("[telegram] Биеийг уншиж чадсангүй:", err);
    return res.status(400).send("Bad Request");
  }

  try {
    await handleUpdate(update);
  } catch (err) {
    console.error("[telegram] Боловсруулахад алдаа:", err);
    const chatId = update?.message?.chat?.id;
    if (chatId) {
      await tgSend(chatId, `Алдаа гарлаа: ${err.message}`).catch(() => {});
    }
  }

  return res.status(200).send("OK");
}

async function handleUpdate(update) {
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!chatId || !text) return;

  if (!(await claimMessage(`tg:${update.update_id}`))) return;

  if (!isAdmin(chatId)) {
    await tgSend(
      chatId,
      "Танд энэ ботыг ашиглах эрх алга байна.\n\n" +
        `Таны chat id: ${chatId}\n` +
        "Эрх авах бол энэ дугаарыг хуудасны эзэнд өгч, TELEGRAM_ADMIN_CHAT_IDS " +
        "хувьсагчид нэмүүлнэ үү.",
    );
    return;
  }

  const adminName = [message.from?.first_name, message.from?.last_name]
    .filter(Boolean)
    .join(" ");

  if (text === "/start" || text === "/help") {
    await tgSend(chatId, WELCOME);
    return;
  }

  if (text === "/reset") {
    await resetAdminConversation(chatId);
    await tgSend(chatId, "Ярианы түүх цэвэрлэгдлээ. Шинээр эхэлье.");
    return;
  }

  if (text === "/id") {
    await tgSend(chatId, `Таны chat id: ${chatId}`);
    return;
  }

  // Товчлол тушаалуудыг AI-д ойлгомжтой өгүүлбэр болгож дамжуулна.
  const shortcuts = {
    "/kb": "Мэдээллийн санг бүтнээр нь харуул.",
    "/unknowns": "Хаагдаагүй мэдэхгүй асуултуудыг жагсаа.",
    "/leads": "Сүүлийн 20 бүртгэлийг харуул.",
  };
  const prompt = shortcuts[text] ?? text;

  await tgTyping(chatId);
  const reply = await handleAdminMessage({ chatId, text: prompt, adminName });
  await tgSend(chatId, reply);
}
