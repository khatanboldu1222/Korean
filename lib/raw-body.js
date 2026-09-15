/**
 * Facebook-ийн гарын үсэг шалгахад биеийн ЯГ ТЭР БАЙТ хэрэгтэй.
 *
 * Vercel зарим тохиолдолд биеийг өөрөө задалж req.body болгочихдог. Тэр үед
 * түүхий байтыг сэргээх боломжгүй тул JSON болгож буцаан бичнэ — гэхдээ энэ
 * нь яг ижил байт болно гэсэн баталгаагүй (ялангуяа кирилл, эможи зэрэг
 * ASCII бус тэмдэгт дээр). Тиймээс `exact` тугаар үүнийг мэдэгдэнэ.
 *
 * @returns {{ raw: string, exact: boolean }}
 */
export async function readRawBody(req) {
  // 1) Хамгийн зөв зам — stream-ээс шууд унших.
  if (req.readable !== false && typeof req[Symbol.asyncIterator] === "function") {
    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      if (chunks.length) {
        return { raw: Buffer.concat(chunks).toString("utf8"), exact: true };
      }
    } catch {
      // Аль хэдийн уншигдсан байна — доорх нөөц замаар үргэлжилнэ.
    }
  }

  // 2) Задлаагүй хэвээр өгсөн бол мөн адил зөв.
  if (typeof req.body === "string") return { raw: req.body, exact: true };
  if (Buffer.isBuffer(req.body)) {
    return { raw: req.body.toString("utf8"), exact: true };
  }

  // 3) Задлагдсан — сэргээж бичнэ, гэхдээ яг таарна гэсэн баталгаагүй.
  if (req.body && typeof req.body === "object") {
    return { raw: JSON.stringify(req.body), exact: false };
  }

  return { raw: "", exact: true };
}
