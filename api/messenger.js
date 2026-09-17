import { env } from "../lib/env.js";
import { readRawBody } from "../lib/raw-body.js";
import { verifySignature, sendText, sendAction, getProfile } from "../lib/fb.js";
import { claimMessage, touchLastSeen } from "../lib/store.js";
import { handleCustomerMessage } from "../lib/agent-customer.js";

// Гарын үсэг шалгахын тулд түүхий бие хэрэгтэй.
export const config = { api: { bodyParser: false } };

const ERROR_REPLY =
  "Уучлаарай, түр зуурын алдаа гарлаа. Хэсэг хүлээгээд дахин бичнэ үү 🙏";

export default async function handler(req, res) {
  // ── Facebook-ийн webhook баталгаажуулалт ──
  if (req.method === "GET") {
    // req.query байхгүй орчинд URL-ээс шууд уншина.
    const query =
      req.query ??
      Object.fromEntries(
        new URL(req.url, "http://localhost").searchParams.entries(),
      );
    if (
      query["hub.mode"] === "subscribe" &&
      query["hub.verify_token"] === env.fbVerifyToken
    ) {
      return res.status(200).send(query["hub.challenge"]);
    }
    console.warn("[messenger] Баталгаажуулалт амжилтгүй:", query["hub.mode"]);
    return res.status(403).send("Forbidden");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // ── Мессеж хүлээн авах ──
  let body;
  try {
    const { raw, exact } = await readRawBody(req);
    const check = verifySignature(raw, req.headers["x-hub-signature-256"], {
      exact,
    });
    if (!check.ok) {
      console.warn(
        `[messenger] Гарын үсэг таарсангүй — ${check.reason}. ` +
          `(түүхий=${exact}, урт=${raw.length})`,
      );
      return res.status(403).send("Invalid signature");
    }
    if (check.skipped) {
      console.warn("[messenger] FB_APP_SECRET тавиагүй — гарын үсэг шалгасангүй.");
    } else if (check.variant === "escaped") {
      console.log("[messenger] Гарын үсэг \\uXXXX хувилбараар таарлаа.");
    }
    body = JSON.parse(raw);
  } catch (err) {
    console.error("[messenger] Биеийг уншиж чадсангүй:", err);
    return res.status(400).send("Bad Request");
  }

  if (body.object !== "page") return res.status(404).send("Not a page event");

  // Facebook 20 секундын дотор 200 хүлээдэг. Vercel дээр хариу буцаасны дараа
  // функц царцдаг тул эхлээд боловсруулж, дараа нь 200 буцаана.
  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      try {
        await handleEvent(event);
      } catch (err) {
        console.error("[messenger] Үйл явдал боловсруулахад алдаа:", err);
        if (event.sender?.id) {
          // DEBUG_ERRORS=1 үед жинхэнэ алдааг Messenger дээр шууд харуулна.
          // Тохиргоо дуусмагц энэ хувьсагчийг УСТГААРАЙ.
          const reply =
            process.env.DEBUG_ERRORS === "1"
              ? `${ERROR_REPLY}\n\n[debug] ${err.name}: ${err.message}`
              : ERROR_REPLY;
          await sendText(event.sender.id, reply).catch(() => {});
        }
      }
    }
  }

  return res.status(200).send("EVENT_RECEIVED");
}

async function handleEvent(event) {
  const psid = event.sender?.id;
  if (!psid) return;

  // Хуудсаас илгээсэн мессежийн цуурай — үл тоомсорло.
  if (event.message?.is_echo) return;

  let text = null;
  if (event.message?.text) {
    text = event.message.text.trim();
  } else if (event.postback) {
    text = (event.postback.payload || event.postback.title || "").trim();
  }

  // Зураг / дуу хоолой / файл — одоогоор текст л боловсруулна.
  if (!text) {
    if (event.message?.attachments?.length) {
      await sendText(
        psid,
        "Уучлаарай, би одоогоор зөвхөн бичсэн мессежийг уншиж чадна. " +
          "Асуухыг хүссэн зүйлээ бичээд илгээнэ үү 🙂",
      );
    }
    return;
  }

  // Facebook удаашрахад ижил мессежийг давхар илгээдэг.
  const fresh = await claimMessage(event.message?.mid ?? `${psid}:${event.timestamp}`);
  if (!fresh) return;

  // 24 цагийн цонхыг тооцоолохын тулд хамгийн сүүлд бичсэн хугацааг хадгална.
  await touchLastSeen(psid);

  await sendAction(psid, "mark_seen");
  await sendAction(psid, "typing_on");

  const profile = await getProfile(psid);
  const profileName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ")
    : null;

  const { reply } = await handleCustomerMessage({ psid, text, profileName });
  await sendText(psid, reply);
}
