/**
 * Гарын үсэг шалгахын тулд биеийг ТҮҮХИЙ байдлаар нь унших хэрэгтэй.
 * Vercel дээр bodyParser-ыг унтраасан үед req нь энгийн stream байна;
 * бусад орчинд аль хэдийн задлагдсан байж болох тул бүх тохиолдлыг барина.
 */
export async function readRawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
