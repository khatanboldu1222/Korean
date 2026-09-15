# Солонгос хэлний сургалтын чатбот

Facebook Messenger дээр ажиллах сургалтын туслах бот + Telegram дээрх админ AI.
Node.js, Vercel дээр байршина.

## Бүтэц

```
                    Facebook Messenger
                            │
                 POST /api/messenger
                            │
                ┌───────────▼────────────┐
                │  ХЭРЭГЛЭГЧИЙН AI       │  Claude
                │  (agent-customer.js)   │
                │  • 5 алхамт урсгал     │
                │  • save_lead           │
                │  • report_unknown ─────┼──┐
                └───────────┬────────────┘  │
                            │               │  мэдэхгүй асуулт
                   ┌────────▼────────┐      │  + шинэ бүртгэл
                   │  Upstash Redis  │      │
                   │  • мэдээллийн   │      │
                   │    сан (kb)     │      │
                   │  • ярианы төлөв │      │
                   │  • бүртгэлүүд   │      │
                   │  • мэдэхгүй ??? │      │
                   └────────▲────────┘      │
                            │               │
                ┌───────────┴────────────┐  │
                │  АДМИН AI              │◄─┘
                │  (agent-admin.js)      │
                │  • мэдээллийн сан засах│
                │  • мэдэхгүй ??? хаах   │
                │  • ботод зөвлөгөө өгөх │
                └───────────▲────────────┘
                            │
                 POST /api/telegram
                            │
                       Telegram
```

**Гол санаа:** мэдээллийн сан кодод биш, **Redis дотор** амьдардаг. Тиймээс
хуудасны эзэн Telegram дээр энгийн монгол өгүүлбэрээр бичихэд л бот шинэ
мэдээлэлтэй болно — дахин deploy хийх шаардлагагүй.

**Хоёр дахь гол санаа:** хэрэглэгчийн бот **мэдэхгүй зүйлээ хэлэхийг
хориглосон**. Мэдээллийн санд байхгүй асуулт ирвэл `report_unknown` дуудаж
Telegram руу мэдэгдэнэ, хэрэглэгчид "лавлаад эргэж хариулъя" гэж үнэнээр
хэлнэ. Ингэснээр мэдээллийн сан аажимдаа өөрөө баяжина.

---

## Суулгах заавар

### 0. Юу бэлэн байх ёстой вэ

| Зүйл | Хаанаас | Төлбөр |
|---|---|---|
| Facebook Page + App | developers.facebook.com | Үнэгүй |
| Vercel эрх | vercel.com | Үнэгүй багц болно |
| Upstash Redis | console.upstash.com | Үнэгүй багц болно |
| Anthropic API түлхүүр | console.anthropic.com | Хэрэглээгээр |
| Telegram бот | @BotFather | Үнэгүй |

---

### 1. Upstash Redis

Хамгийн хялбар нь Vercel дотроос: **Vercel → таны төсөл → Storage →
Create Database → Upstash Redis**. Ингэвэл `UPSTASH_REDIS_REST_URL` болон
`UPSTASH_REDIS_REST_TOKEN` автоматаар төсөлд нэмэгдэнэ.

Эсвэл console.upstash.com дээр database үүсгээд **REST API** хэсгээс
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`-ийг хуулна.

### 2. Anthropic API түлхүүр

console.anthropic.com → **API Keys** → Create Key. `ANTHROPIC_API_KEY` болно.

### 3. Telegram бот үүсгэх

1. Telegram дээр **@BotFather** рүү `/newbot` бичээд нэр өгнө.
2. Өгсөн токеныг `TELEGRAM_BOT_TOKEN` болгож хадгална.
3. `TELEGRAM_WEBHOOK_SECRET` — өөрөө санамсаргүй нууц үг зохионо
   (ж: `openssl rand -hex 16` эсвэл гараараа 30 тэмдэгт).
4. `TELEGRAM_ADMIN_CHAT_IDS` — одоохондоо **хоосон орхино**. 6-р алхамд
   бөглөнө.

### 4. Vercel рүү байршуулах

```bash
npm i -g vercel
vercel link
vercel --prod
```

Дараа нь **Vercel → Settings → Environment Variables** хэсэгт `.env.example`
доторх бүх хувьсагчийг нэмнэ. (`FB_PAGE_ACCESS_TOKEN`-ийг 5-р алхамд авна,
түр хоосон орхиж болно.)

Гарсан хаягийг тэмдэглэ, ж: `https://korean-chatbot.vercel.app`

Шалгах: `https://<таны-хаяг>/api/health` руу орвол ямар хувьсагч дутуу
байгааг харуулна.

### 5. Facebook App → Messenger webhook

developers.facebook.com дээр өөрийн App руу орж:

1. **Add Product → Messenger → Set up**
2. **Access Tokens** хэсэгт **Add or Remove Pages** дарж Page-ээ холбоно.
3. Page-ийнхээ хажуугаас **Generate token** дарж гарсан токеныг
   `FB_PAGE_ACCESS_TOKEN` болгож Vercel-д нэмнэ.
4. **App Settings → Basic → App Secret → Show** — үүнийг `FB_APP_SECRET`
   болгож нэмнэ.
5. **Messenger → Webhooks → Add Callback URL**:
   - Callback URL: `https://<таны-хаяг>/api/messenger`
   - Verify Token: `FB_VERIFY_TOKEN`-д бичсэн яг тэр утга
   - **Verify and Save** дарна.
6. **Add Subscriptions** дарж дараах талбарыг сонгоно:
   `messages`, `messaging_postbacks`
7. Page-ээ **Subscribe** хийхээ бүү мартаарай.

> ⚠ Vercel дээр орчны хувьсагч нэмсний **дараа заавал дахин deploy хийнэ**
> (`vercel --prod`), эс бөгөөс хуучин утга ажиллана.

### 6. Telegram webhook + админ эрх

```bash
node --env-file=.env scripts/set-telegram-webhook.js https://<таны-хаяг>
```

Дараа нь Telegram дээр ботруугаа ямар нэг юм бичнэ. Бот танд
**"Таны chat id: 123456789"** гэж хариулна.

Тэр дугаарыг Vercel дээрх `TELEGRAM_ADMIN_CHAT_IDS`-д нэмээд дахин deploy
хийнэ. Хэд хэдэн админ бол таслалаар: `123456789,987654321`

### 7. Мэдээллийн санг эхлүүлж, бөглөх

```bash
npm run seed
```

Дараа нь Telegram дээрх ботдоо `/start` бичээд, мэдээллээ **энгийн монгол
өгүүлбэрээр** өгнө:

```
Төвийн нэр Ханбогд Солонгос хэлний төв. Утас 9911-2233.
Хаяг: СБД 1-р хороо, Их сургуулийн гудамж 12, 305 тоот.

Анхан шатны төлбөр 350,000₮, 2 сар үргэлжилнэ, 7 хоногт 3 удаа 2 цаг.
Хөтөлбөр нь: суурь дүрэм, 800 орчим үг, өдөр тутмын харилцаа.

Мэдээллийн санг харуул
```

`/kb` бичвэл одоогийн бүх мэдээлэл, `⚠ МЭДЭЭЛЭЛ ОРООГҮЙ` гэсэн дутуу
талбар бүрийн хамт харагдана.

---

## Facebook App Review (амьдаар ажиллуулахын өмнө)

App нь **Development** горимд байхад бот зөвхөн App-ийн
админ / developer / tester хүмүүстэй харилцана. Энгийн хэрэглэгчидтэй
харилцахын тулд:

1. **App Review → Permissions and Features → `pages_messaging`** → Request
2. Business Verification давах
3. Ботын ажиллагааг дэлгэцийн бичлэгээр харуулсан тайлбар оруулах

Шалгалт ихэвчлэн хэдэн өдрөөс 2 долоо хоног үргэлжилдэг. Тиймээс
тестийг App Review-ээс өмнө өөрийн болон хамт олныхоо (tester болгож
нэмсэн) аккаунтаар хийгээрэй.

> **24 цагийн дүрэм:** Facebook-ийн бодлогоор хэрэглэгч бичсэнээс хойш
> 24 цагийн дотор л чөлөөтэй хариулж болно. Энэ бот зөвхөн хариу бичдэг
> тул асуудал үүсэхгүй.

---

## Загвар ба зардал

Хоёр AI нь **тус тусдаа загвартай**:

| | Хувьсагч | Анхдагч | Нийлүүлэгч |
|---|---|---|---|
| Админ AI (Telegram) | `ANTHROPIC_MODEL` | `claude-opus-5` | Зөвхөн Anthropic |
| Хэрэглэгчийн бот (Messenger) | `CUSTOMER_MODEL` | админтай ижил | Anthropic **эсвэл** OpenAI |

`CUSTOMER_MODEL`-ийг загварын нэрээр нь таньж зөв нийлүүлэгч рүү
чиглүүлнэ — `claude-` гэж эхэлбэл Anthropic, бусад бүхэн OpenAI:

```
CUSTOMER_MODEL=claude-sonnet-5     # Anthropic
CUSTOMER_MODEL=gpt-5               # OpenAI (OPENAI_API_KEY хэрэгтэй)
```

Ярианы түүхийг **нэг нийтлэг хэлбэрээр** Redis-д хадгалдаг тул загвараа
солиход хэрэглэгчдийн хуучин яриа эвдрэхгүй.

Claude талын бүдүүвч өртөг (15 мессежийн яриа, prompt caching идэвхтэй):

| Загвар | Оролт / Гаралт (1сая токен) | Нэг яриа |
|---|---|---|
| `claude-opus-5` | $5 / $25 | ~$0.15 |
| `claude-sonnet-5` | $2 / $10 | ~$0.06 |
| `claude-haiku-4-5` | $1 / $5 | ~$0.03 |

Загвар солих бүрд **заавал турших ёстой хоёр зүйл** бий, учир нь энэ
ботын бүхий л зохиомж эдгээр дээр тогтдог:

1. **Мэдэхгүй зүйлээ хэлэхгүй байх** — мэдээллийн санд байхгүй зүйл
   асуугаад (ж: "багш нь солонгос хүн үү?") бот зохиож хариулж байна уу,
   эсвэл үнэнээр "мэдэхгүй" гээд `report_unknown` дуудаж байна уу.
2. **Хэрэгсэл дуудах** — нэр, утсаа өгөхөд `save_lead` үнэхээр
   ажиллаж, Telegram руу мэдэгдэл ирж байна уу.

Сул загвар эхний цэг дээр илүү амархан гулсдаг.

Prompt caching: Claude талд мэдээллийн сан + дүрмийг кэшлэдэг тул
дараагийн мессеж бүрт тэр хэсэг ~10 дахин хямд болно. OpenAI талд
кэшлэлт автоматаар хийгддэг.

---

## Файлын бүтэц

```
api/
  messenger.js   Facebook webhook (GET баталгаажуулалт + POST мессеж)
  telegram.js    Telegram админ ботын webhook
  health.js      Тохиргоо бүрэн эсэхийг шалгах
lib/
  agent-customer.js  Хэрэглэгчийн AI: дүрэм, 5 алхам, хэрэгслүүд
  agent-admin.js     Админ AI: мэдээллийн сан засварлах 13 хэрэгсэл
  claude.js          Claude-ийн агентын гогцоо (хэрэгсэл дуудах давталт)
  kb.js              Мэдээллийн сан унших / бичих / текст болгох
  store.js           Ярианы түүх, бүртгэл, мэдэхгүй асуулт, давхардал
  fb.js              Facebook Send API + гарын үсэг шалгах
  tg.js              Telegram илгээх + админд мэдэгдэх
  redis.js, env.js, raw-body.js
data/
  seed-kb.js     Мэдээллийн сангийн эхний загвар (зөвхөн үр)
scripts/
  seed.js                 Үрийг Redis рүү хийх
  show-kb.js              Одоогийн сангийн агуулгыг хэвлэх
  set-telegram-webhook.js Telegram webhook тохируулах
```

---

## Асуудал шийдэх

**Facebook "Verify and Save" алдаа өгч байна**
`FB_VERIFY_TOKEN` нь Vercel дээр яг тэр утгаараа тавигдсан эсэх, орчны
хувьсагч нэмсний дараа redeploy хийсэн эсэхээ шалга.

**Бот хариулахгүй байна**
`/api/health` руу орж `ready: true` эсэхийг хар. Дараа нь
**Vercel → Deployments → Functions → Logs** хэсгээс алдааг хар.

**Telegram бот дуугүй байна**
`node --env-file=.env scripts/set-telegram-webhook.js https://<хаяг>` дахин
ажиллуул. Гаралт дахь `getWebhookInfo` хэсэгт `last_error_message` байвал
тэр нь шалтгаан.

**Бот мэдэхгүй зүйл ярьж байна**
`/kb` бичээд тухайн мэдээлэл санд байгаа эсэхийг шалга. Байхгүй мөртлөө
ярьж байвал Telegram-аар `Ботод хэл: ...` гэж зааварчилгаа нэм.

**Функц 10 секундэд тасарч байна (Hobby багц)**
Төслийн үндэст `vercel.json` үүсгээд:
```json
{ "functions": { "api/*.js": { "maxDuration": 60 } } }
```
