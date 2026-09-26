<div dir="rtl" style="text-align: right;">

# مستقبل حالة شحنات بوسطة (`Bosta-Webhook-Status-Receiver`)

![version](https://img.shields.io/badge/version-v1.5.0-blue)

> بيتحمّل أوتوماتيك في كل جلسة Claude — في Claude Code وCowork.

**بتعمل إيه:** بتستقبل أحداث الويبهوك من بوسطة (تغيير حالة شحنة)، تسجّلها خام
في D1، وتكتب آخر حالة في ٤ ميتافيلدات على الأوردر المطابق في شوبيفاي.
**مين بيستخدمها:** فريق العمليات — شاشة مراقبة للأحداث والاستثناءات.
**الإصدار:** Worker `v1.5.0` · الواجهة `v1.5.0`

---

## 🟢 الأداة شغّالة على الإنتاج — من 21-09-2026

الأداة بتستقبل أحداث بوسطة فعليًا وبتخزّنها. اللي اتقفل:

| البند | الحالة |
|---|---|
| الـ Worker مربوط بالريبو + Build watch paths | ✅ 20-09-2026 |
| GitHub Pages | ✅ 20-09-2026 |
| الأسرار على Cloudflare | ✅ 20-09-2026 — كلها خضرا في `diag` |
| تسجيل رابط الويبهوك في داشبورد بوسطة | ✅ 20-09-2026 (`x-bosta-webhook-key`) |
| جدول `bosta_webhook_events` في D1 | ✅ 21-09-2026 — **يدويًا من D1 Console** |
| الكتابة الفعلية على شوبيفاي | ✅ 22-09-2026 — أول كتابة ناجحة، بعد إصلاح `findOrder` |

> 🔴 **درس 20/21-09-2026 — كل أحداث اليومين دول ضاعت.** بوسطة كانت بتبعت
> والتحقق كان بيعدّي، بس `db.exec(SCHEMA_SQL)` كان بيفشل لأن الـ SQL كانت
> منسّقة على ٢٦ سطر (عقد `exec` = عبارة واحدة لكل سطر)، والـ Worker كان
> بيرد **200** فبوسطة ما أعادتش. والشاشة كانت بتعرض «مفيش أي حدث اتسجّل من
> بوسطة» لأن `list_events` كان بيبلع `no such table` ويرجّع `[]`.
> الاتنين اتصلحوا في v1.1.0/v1.2.0، والأحداث الضايعة **مش قابلة للاسترجاع**.

> 🔴 **درس 21→22-09-2026 — 100% من أحداث الكتابة فشلت من أول يوم، وده كان
> مختفي ورا رسالة عامة.** من أول ما جدول `bosta_webhook_events` اشتغل
> (21-09) لحد إصلاح 22-09، **الـ 448 حدث كلهم بلا استثناء** اتسجّلوا
> `write_status = 'shopify_write_failed'` — صفر `written`، صفر
> `match_failed`، صفر `dry_run_matched` (اتأكد بـ
> `SELECT write_status, COUNT(*) FROM bosta_webhook_events GROUP BY
> write_status` من D1 المباشر). السبب: `FIND_ORDER_QUERY` كان بيطلب
> `metafields(identifiers: [...]) { key value }` على `Order` — الحقل ده
> نوعه `MetafieldConnection` في شوبيفاي، مش بيقبل `identifiers` ومش بيرجّع
> `{ key value }` مباشرة. شوبيفاي كانت بترفض الاستعلام بخطأ GraphQL
> (`argumentNotAccepted` + `undefinedField` × 2) على **كل** حدث، قبل حتى ما
> يوصل لمرحلة تحديد S1/S2 — ولذلك عمودي «الجنب» و«طريقة المطابقة» في
> الشاشة كانوا فاضيين على كل صف، مش بس على بعضهم. الاختبار عن طريق `diag`
> (`Shopify OAuth: نجح`) **ماكانش كافي** لأنه بيستخدم استعلام مختلف تمامًا
> (`currentAppInstallation`) مش بيلمس `Order.metafields` خالص — الدرس:
> `diag` بيثبت إن التوكن شغّال، مش إن كل استعلام في الكود صحيح.
> بقى الاستعلام بيستخدم `metafield(namespace, key)` المفرد بـ alias لكل
> حقل (نفس نمط `shopify-graphql-helper` §3.3) بدل الصيغة الجماعية.
> **البانر الأحمر بتاع «فشل تخزين في D1» اللي فاضل شغّال دلوقتي مش مشكلة
> جديدة** — هو ذيل حادثة `SCHEMA_SQL` القديمة (آخر فشل تخزين مسجَّل
> 21-09-2026 08:49) لسه جوه نافذة الـ٢٤ ساعة المتحركة في `diag`، وهيوصل
> صفر لوحده من غير أي تدخّل.

### لسه مطلوب (مش بيمنع التشغيل):

1. **تسجيل `ecommoda-constants` §7 — قبل أول `writeLog` حقيقي.**
   القيم دي **مأخوذة حرفيًا من تكليف البناء (brief v1.0.0, 19-09-2026,
   Ahmed)** ولسه مش موجودة في نسخة `ecommoda-constants` المتاحة لهذه الجلسة
   (آخر تحديث فيها 13-09-2026 — قبل تاريخ البريف):
   ```
   tool : bosta_webhook_status
   type : status_event · duplicate_skipped · match_failed ·
          shopify_write_failed · unauthorized · login · logout
   ```
   هذه الجلسة **مالهاش وصول** لتعديل ملف `ecommoda-constants` نفسه (مش ريبو
   Git متاح في نطاق هذه الجلسة). 🔴 **الفلاج `WRITE_METAFIELDS="true"` اتعمله
   push بالفعل (21-09-2026) والأداة بتكتب على شوبيفاي — فالتسجيل ده بقى
   **متأخّر**، لازم يتعمل في أقرب فرصة.**
2. **الأداة تنضم لمجموعة سر `delivery_cod_ops` من أول يوم (قرار أحمد
   19-09-2026)** — هذا القرار **جديد ومش مسجّل بعد** في
   `ecommoda-constants` → `references/secret-groups.md` (المجموعة المسجّلة
   حاليًا هناك `warehouse_ops` بس).
   ✅ **مؤكَّد من أحمد 20-09-2026: `delivery_cod_ops` مجموعة جديدة كليًا —
   مفيش أي أداة تانية محتاجة تنضم لها دلوقتي.** يعني التسجيل في
   `secret-groups.md` بسيط: قسم مجموعة جديد بعضو واحد بس
   (`Bosta-Webhook-Status-Receiver`)، بمفتاح مشترك اسمه
   `delivery_cod_ops_worker_secret` — مفيش حاجة تتراجع مع أداة تانية. لسه
   لازم يتسجّل قبل ما القيمة الفعلية على Cloudflare تتحول من سر فريد
   (الوضع الحالي) لقيمة المجموعة + `LS_SECRET` في `index.html` يتحدّث لنفس
   الاسم (Standards Changelog #39 في `ecommoda-html-builder`).

---

## الروابط

```
الواجهة    : https://ecommoda-dev.github.io/Bosta-Webhook-Status-Receiver/
الـ Worker : https://bosta-webhook-status-receiver-worker.ecommoda-dev.workers.dev
اسم الـ Worker في الداشبورد: bosta-webhook-status-receiver-worker   ← لازم يطابق name في wrangler.toml حرف بحرف
```

## الـ Endpoints

| المسار / `?action=` | البوابة | بيعمل إيه |
|---|---|---|
| `POST /webhook` | هيدر مخصص (اسمه = `BOSTA_WEBHOOK_HEADER_NAME`) | استقبال حدث بوسطة — **قبل** بوابة `WORKER_SECRET` في ترتيب الـ handlers |
| `check_employee` · `register_pin` · `verify_employee` · `log_logout` · `get_employees` | `WORKER_SECRET` | Universal D1 Auth القياسي |
| `list_events` | `WORKER_SECRET` | للشاشة — فلتر بـ `order` / `tracking` / `dateFrom` / `dateTo`، بيرجّع `shopify_order_id` (من v1.2.0) لهايبرلينك رقم الأوردر |
| `diag` | `WORKER_SECRET` | آخر حدث امتى · عدد آخر ٢٤ ساعة · `duplicate_skipped`/`match_failed` · وجود الأسرار (`!!` بس) · Shopify OAuth |
| `get_config` | `WORKER_SECRET` | `WORKER_VERSION` (الكتابة على شوبيفاي دائمة، مفيش فلاج يتفحص) |
| `get_logs` / `get_logs_count` / `get_logs_export` | `WORKER_SECRET` | سجل `logs` المشترك (تلقائي من §SHARED) |

## D1

```
tool  : bosta_webhook_status
type  : status_event · duplicate_skipped · match_failed · shopify_write_failed · unauthorized · login · logout
```

> 🔴 القيم دي **لسه مش مسجّلة** في `ecommoda-constants` §7 — راجع قسم STOP فوق.

**جدول إضافي غير `logs`/`employees` المشتركين:** `bosta_webhook_events` —
الحدث الخام كامل (idempotency claim على `UNIQUE(bosta_id, state,
bosta_timestamp)` + نتيجة المطابقة/الكتابة لكل حدث). الـ Worker بينشئه
تلقائيًا أول مرة (`CREATE TABLE IF NOT EXISTS`)، أو شغّل السطر ده يدويًا في
D1 Console الأول (سطر واحد، بدون تعليقات — قاعدة `ecommoda-constants` §8):

```sql
CREATE TABLE IF NOT EXISTS bosta_webhook_events (id INTEGER PRIMARY KEY AUTOINCREMENT, bosta_id TEXT NOT NULL, state INTEGER NOT NULL, bosta_timestamp INTEGER NOT NULL, tracking_number TEXT NOT NULL, business_reference TEXT NOT NULL, order_number TEXT, bosta_type TEXT, description TEXT, event_type TEXT, delivery_promise_date TEXT, number_of_attempts INTEGER, cod REAL, is_confirmed_delivery INTEGER, exception_reason TEXT, exception_code TEXT, matched_slot TEXT, match_method TEXT, write_status TEXT NOT NULL DEFAULT 'processing', metafields_written INTEGER NOT NULL DEFAULT 0, shopify_order_id TEXT, raw_payload TEXT NOT NULL, received_at TEXT NOT NULL, UNIQUE(bosta_id, state, bosta_timestamp)); CREATE INDEX IF NOT EXISTS idx_bwe_order ON bosta_webhook_events(order_number); CREATE INDEX IF NOT EXISTS idx_bwe_tracking ON bosta_webhook_events(tracking_number); CREATE INDEX IF NOT EXISTS idx_bwe_received_at ON bosta_webhook_events(received_at);
```

> 🔴 **`shopify_order_id` (v1.2.0)** — عمود جديد على جدول موجود بالفعل في
> الإنتاج. الـ `CREATE TABLE IF NOT EXISTS` فوق بيغطي التركيب من الصفر بس؛
> على القاعدة الحالية العمود بيتضاف **ذاتيًا** أول مرة `updateEventRow`
> تواجه `no such column` (نفس نمط self-healing بتاع `SCHEMA_SQL`) —
> **مفيش خطوة يدوية مطلوبة في D1 Console**. القيمة هي `legacyResourceId`
> بتاع الأوردر على شوبيفاي، بتتسجّل في أي حدث اتلاقاله أوردر (حتى لو فشلت
> بعد كده مطابقة S1/S2 أو الكتابة) — الأحداث اللي `الأوردر مش موجود على
> شوبيفاي` (`match_failed` من غير `orderNode`) بتفضل من غير قيمة، ورقم
> الأوردر في الشاشة بيبقى نص عادي بلا هايبرلينك ليها.

> 🔴 **`write_status = 'delivered_duplicate_skipped'` (v1.5.0)** — قيمة جديدة
> على عمود موجود بالفعل، مفيش تعديل schema. بتتكتب لما حدث Delivered (كود 45)
> يوصل لأوردر/slot اتسجّل عليه Delivered بنجاح فعليًا (`write_status='written'`)
> قبل كده — الحدث بيتسجّل في `bosta_webhook_events` عادي (وفي `logs` بنوع
> `status_event`) لكن **من غير أي نداء `metafieldsSet` تاني**. راجع "فخاخ الأداة
> دي" تحت لتفاصيل القرار.

## الأسرار — لسه محتاجة تتسجّل على Cloudflare (Dashboard → Settings → Variables → Secret)

| السر | القيمة |
|---|---|
| `WORKER_SECRET` | ✅ متسجّل حاليًا (20-09-2026) كقيمة فريدة لهذه الأداة. 🔴 لسه محتاج يتحوّل لقيمة مجموعة `delivery_cod_ops` المشتركة بعد ما تتسجّل في `secret-groups.md` (بند ٤ في STOP فوق) — مجموعة جديدة بعضو واحد، مفيش أداة تانية تتأثر |
| `BOSTA_WEBHOOK_HEADER_NAME` | اسم الهيدر **بالظبط** زي ما هو مسجّل في داشبورد بوسطة (Authorization key name) — **مش** `Authorization` |
| `BOSTA_WEBHOOK_HEADER_VALUE` | قيمة نفس المفتاح (Authorization Key) |
| `CLIENT_ID` / `CLIENT_SECRET` | نفس الـ Custom App المشترك في الستاك (`ecommoda-constants` §1) |

⚠️ اكتب أسماء الـ Variables **يدويًا بالكيبورد** — اللصق بيسيب مسافة مخفية
تخلي القيمة `undefined` بصمت. وبعد أي سر جديد → **Promote**.

⚠️ **لا يوجد أي هيدر `Authorization` في طلب بوسطة نفسه.** اسم الهيدر هو اسم
المفتاح المسجّل في داشبورد بوسطة حرفيًا (مثال حي من البريف:
`test-456: TEST-123`، مش `Authorization: TEST-123`).

## المضبوط فعليًا في الداشبورد

> اللي **متظبط بالفعل** — مش اللي المفروض يكون. محدَّث من `diag` و
> لقطات الداشبورد 21-09-2026.

```
Bindings : DB → ecommoda-dev-logs                                   ✅
Secrets  : WORKER_SECRET · BOSTA_WEBHOOK_HEADER_NAME (19 حرف) ·     ✅
           BOSTA_WEBHOOK_HEADER_VALUE · BOSTA_API_KEY ·
           CLIENT_ID · CLIENT_SECRET
Vars     : SHOP_DOMAIN=6c7e1a-53.myshopify.com ·                    ✅
           SILENCE_THRESHOLD_HOURS="3"                                ← من [vars] في wrangler.toml
           (WRITE_METAFIELDS اتشال نهائيًا من [vars] في 25-09-2026 — الكتابة بقت سلوك دائم بلا فلاج)
Cron     : */30 * * * * (مراقبة السكوت — §7.1)                       ✅
Build watch paths : index.js + wrangler.toml                         ✅
Production branch : main · Builds for non-production branches: ON
```

> ⚠️ **الداشبورد مش مصدر حقيقة للـ Vars.** أي تعديل من الداشبورد بيتمسح عند
> أول build من git. `WRITE_METAFIELDS` اتغيّرت من الداشبورد لـ `true` في
> 20-09-2026 وكانت هتترجّع `false` عند أول ميرج — اتثبتت في `wrangler.toml`
> في 21-09-2026 (`ecommoda-constants` §6).

## CORS

`ALLOWED_ORIGINS` صارمة (`https://ecommoda-dev.github.io`) — لأن الأداة بتكتب
ميتافيلدات على أوردرات حقيقية في شوبيفاي. مسار `/webhook` نفسه غير محكوم
بـ CORS (نداء سيرفر-لسيرفر من بوسطة، مفيش Origin متصفح).

## فخاخ الأداة دي

- 🔴 **`db.exec()` في D1 = عبارة واحدة لكل سطر.** بيقسّم النص عند كل `\n`
  ويعتبر كل سطر عبارة كاملة. SQL منسّق على أكتر من سطر بيرجّع
  `incomplete input: SQLITE_ERROR` — **والجدول ما بيتعملش**. ده كلّفنا كل
  أحداث 20/21-09-2026. `SCHEMA_SQL` في `index.js` دلوقتي مصفوفة
  `.join('\n')` — عبارة لكل عنصر. **ممنوع إعادة تنسيقها على أسطر.**
  (نفس قاعدة `ecommoda-constants` §8 اللي على أوامر الـ Console.)
- 🔴 **`200` على فشل التخزين = ضياع نهائي.** `/webhook` بيرد 200 على أي فشل
  بعد التحقق (عشان بوسطة ماتحذفش الاشتراك) — يعني بوسطة **مش هتعيد** الحدث.
  أي فشل في الكتابة لازم يبان في `diag` فورًا، مش في السجل بس.
- 🔴 **صفر صفوف مش دليل** (`ecommoda-constants` §7.0). `list_events` كان
  بيبلع `no such table` ويرجّع `[]`، فالشاشة عرضت «مفيش أحداث» بدل «D1
  مكسورة». دلوقتي بيرجّع **503** برسالة صريحة، وفيه بانر صحة منفصل.
- **مفيش هيدر `Authorization` في `/webhook`** — التحقق بهيدر اسمه ديناميكي من
  `env.BOSTA_WEBHOOK_HEADER_NAME`. أي كود بيدوّر على `Authorization` هيرفض
  ١٠٠٪ من الأحداث بصمت.
- **بوسطة بتكرر نفس الحدث** حتى بعد رد 200 — الادّعاء الذرّي على
  `UNIQUE(bosta_id, state, bosta_timestamp)` هو الحارس الوحيد.
- **الشحنات الأقدم من تسجيل رابط الويبهوك عمرها ما هتبعت حاجة** — مقصود
  ومقبول (قرار أحمد)، **ممنوع بناء أي backfill من `/deliveries/search`**.
- 🔴 **الفلاج `WRITE_METAFIELDS` اتشال نهائيًا من الكود في 25-09-2026** — كان
  `"true"` من 21-09-2026 (قرار أحمد) وماكانش فيه نية رجوع لـ`false` أصلًا،
  فاتحوّلت الكتابة لسلوك دائم بلا شرط: الأداة بتكتب على شوبيفاي فعليًا من
  أول حدث جاي **دايمًا** — مفيش `env.WRITE_METAFIELDS` في `index.js` تاني،
  ومفيش `[vars] WRITE_METAFIELDS` في `wrangler.toml`، ومسار `dry_run_matched`
  بقى كود ميت (الليبل لسه في `index.html` بس لعرض أي صف قديم لو موجود).
  ⚠️ **مرحلة `dry_run_matched` اتخطّت ومحصلتش أصلًا، وبعدها المطابقة فشلت
  100% لحد 22-09-2026** بسبب باغ `FIND_ORDER_QUERY` (راجع درس 21→22-09-2026
  فوق) — يعني المطابقة **لسه ما اتراجعتش على أحداث حقيقية ناجحة ولا مرة**.
  أول أسبوع من الكتابة الفعلية (من 22-09-2026) لازم يتراقب من الشاشة (عمودي
  «الجنب» و«طريقة المطابقة») وبانر فشل المطابقة.
- 🔴 **`Order.metafields` في GraphQL نوعها `MetafieldConnection` — مش بتقبل
  `identifiers` ومش بترجّع `{ key value }` مباشرة.** ده اللي خلّى كل حدث
  يفشل بـ `shopify_write_failed` من 21 لـ22-09-2026 (448/448). الصيغة الصح
  للحقول المسمّاة المتعددة: `metafield(namespace, key)` المفرد + alias لكل
  حقل — مش `metafields(identifiers: [...])` كأنها على `Query` الجذر
  (`shopify-graphql-helper` §3.3). و**`diag` بيثبت إن التوكن شغّال بس مش
  إن كل استعلام في الكود صحيح** — استعلامه (`currentAppInstallation`) مختلف
  تمامًا عن `FIND_ORDER_QUERY`.
  🔴 **والكتابة **مش** على الأربعة ميتافيلدات مع بعض —
  حدث واحد بيكتب **حقلين بس**، حسب الجنب اللي اتحدد له (S1 أو S2):
  ```
  حدث اتحدد له S1 → custom.bosta_webhook_status_update_s1 + custom.bosta_webhook_last_update_s1
  حدث اتحدد له S2 → custom.bosta_webhook_status_update_s2 + custom.bosta_webhook_last_update_s2
  ```
  الأربعة الميتافيلدات (`_s1`/`_s2` × status/last_update) موجودين بالفعل على
  الأوردر من أدوات تانية — الأداة دي **مش** بتنشئهم، بتكتب فيهم بس. الحقلين
  التانيين (بتوع الجنب اللي ما اتحددش) بيفضلوا زي ما هما — مفيش أي أوردر
  بيتكتب عليه S1 وS2 مع بعض من نفس الحدث.
- **ممنوع كتابة `custom.status_1`/`custom.status_2`** — دول بيشغّلوا إجراءات
  مخزون في أداة تانية (`Order-Status-Updater`)، وكتابة أوتوماتيك هنا = مخزون
  ما رجعش.
  🔴 **استثناء واعٍ ومحدود (قرار أحمد 22-09-2026):** لما `type=SEND` +
  `matched_slot=S1` + `state=45` + `description="Delivered"` حرفيًا (مش
  `"45 · Delivered"`) بيتكتب كمان على `custom.manual_status` (قيمة `Delivered`
  فقط) و`custom.package_whereabouts_s1` (قيمة `Client`) — إضافة على الحقلين
  المعتاديين، مش بدل منهم. القيمة `Client` **مش** من enum
  `ecommoda-order-lifecycle` (`Warehouse`/`Office`/`Courier`) وقناة بوسطة
  (`Other_Regions`) خارج نطاق `package_whereabouts` أصلًا حسب Rule 17 من نفس
  المهارة — الاتنين استثناء مقصود بطلب أحمد، مش سهو. الكود في
  `matchAndWriteMetafields` (`§4.3`) — نفس شرط `WRITE_METAFIELDS`/الترتيب
  الزمني اللي بيحكم باقي الحقول، مفيش مسار كتابة منفصل.
- **رقم التتبع أولًا، بعدين `type` كـ fallback** (§4.1 في البريف الأصلي) —
  فشل الاتنين = `match_failed` + صفر كتابة، مش تخمين.
- **قيم `type` في payload الويبهوك شكل تالت** (`SEND`/`EXCHANGE`/...) مختلف
  تمامًا عن `type.code` في `/deliveries/*` — الجدولين منفصلين
  (`TYPE_TO_SLOT_FALLBACK` في الكود).
- ⚠️ **تسمية أعمدة الشاشة اتغيّرت في v1.3.0 — الإشارات التاريخية فوق (درس
  21→22-09-2026، جدول استرجاع النسخ) بتستخدم الاسم القديم لأنها بتوصف وقت
  حصولها.** الاسم الحالي: عمود `matched_slot` (S1/S2) بقى معنون **"الحالة"**
  (كان "الجنب")، وعمود كود بوسطة الرقمي الخام (`state`) بقى معنون **"كود
  الحالة"** (كان "الحالة") — عشان الاسمين ما يتلخبطوش مع بعض. البيانات في D1
  ما اتغيّرتش، التسمية في الواجهة بس.
- 🔴 **أي حقل تاريخ راجع من بوسطة (`delivery_promise_date` تحديدًا) مش
  مضمون يكون بصيغة `Date` قادر يفهمها.** `new Date(v)` على قيمة غير مفهومة
  بترجّع Invalid Date بصمت، لكن `Intl.DateTimeFormat.formatToParts()` عليها
  **بترمي** `RangeError: Invalid time value` — وحدث واحد بس بتاريخ غريب
  وسط 200 كان كافي يوقف رسم الجدول كله (v1.3.0 → اتصلح v1.3.1، راجع
  changelog تحت). `toValidDate()` في §CONFIG هي الحارس — أي كود جديد بيعرض
  أو بيرتّب على حقل تاريخ **مش من `received_at`** (اللي الـ Worker نفسه
  بيكتبه بـ `.toISOString()` فمضمون) لازم يعدّي عليها الأول، مش يستخدم
  `new Date(v)` مباشرة.
- 🔴 **حدث Delivered تاني على نفس الأوردر/الـ slot مايكتبش على شوبيفاي تاني
  (قرار أحمد 26-09-2026).** بوسطة بتبعت أكتر من حدث بنفس الحالة أحيانًا
  (تأكيد/إعادة إرسال)، وإعادة نفس الكتابة على `bosta_webhook_status_update_s1`/
  `_s2` وتاريخ التحديث كل مرة مالهاش داعي. الحارس في `matchAndWriteMetafields`
  (قبل §4.2) بيدوّر على صف تاني بنفس `business_reference`+`matched_slot`+
  `state=45`+`write_status='written'` قبل ما يكمل — لو لقى، الحدث الجديد
  بيتسجّل بـ `write_status='delivered_duplicate_skipped'` من غير أي نداء
  `metafieldsSet`. **الحارس مبني على `matched_slot` مش على `state` بس** — لو
  الأوردر اتسجّل Delivered على S1 وبعدين جالك حدث Delivered تاني على S2 (نادر
  لكن ممكن نظريًا)، الحدث ده هيتكتب عادي لأنه slot مختلف.

## مسائل مفتوحة (§2.4 من التكليف الأصلي — تتقفل بالتشغيل)

- سلوك بوسطة لما نرد 500 (إعادة المحاولة وعددها) — غير معروف.
- المهلة المسموحة للرد — غير معروفة؛ الكود بيرد فورًا ويأجّل الكتابة على
  شوبيفاي لـ `ctx.waitUntil` احتياطًا.
- هل `type` بقيم تانية (غير الستة المعروفة) بتتبعت؟ كل الأحداث الملتقَطة لحد
  الآن `SEND` بس.
- هل الشحنات المعمولة يدويًا من داشبورد بوسطة بتبعت ويبهوك؟ — غير مقاس.
- قيم `eventType` غير `STATUS_UPDATE` — الكود بيسجّلها كـ `status_event` عادي
  من غير معالجة خاصة (مفيش فرع مختلف).
- **رقم `SILENCE_THRESHOLD_HOURS` (٣ ساعات) تخمين مبدئي** — مفيش قيمة رسمية
  من أحمد لحد الآن لـ"فترة سكوت غير مقبولة وقت الشغل".
- **مراقبة السكوت (§7.1) بتكتب سطر تحذير في D1 وتلوّن بانر في الشاشة فقط** —
  **مفيش قناة تنبيه فعلية (Slack/Email/Push)** لأن الستاك مالوش تكامل تنبيهات
  مسجّل. لو حد مايفتحش الشاشة، التنبيه مش هيوصله. هذا قيد معروف، مش سهو.

## استرجاع النسخ القديمة

```
v1.2.0 (واجهة) · Worker v1.1.1 — commit b83e534 (22-09-2026)
🔴 النسخة دي فيها باغ FIND_ORDER_QUERY — أي رجوع ليها بيرجّع الكتابة على
شوبيفاي لفشل 100% تاني (metafields(identifiers) مرفوضة من شوبيفاي).

v1.1.0 (واجهة) · Worker v1.0.0 — commit 57012a7 (20-09-2026)
🔴 النسخة دي فيها عطل SCHEMA_SQL — أي رجوع ليها بيوقف تخزين الأحداث تاني.
```

## بصمة المهارات

| المهارة | الإصدار وقت آخر تعديل |
|---|---|
| ecommoda-worker-builder | v3.7.1 |
| bosta-api-helper | v6.0.0 |
| ecommoda-constants | v3.1.0 |
| ecommoda-html-builder | v8.0.1 |
| ecommoda-tool-migration-playbook | (بلا رقم إصدار ظاهر وقت القراءة) |

آخر مطابقة: 26-09-2026 · `index.js` v1.5.0 · `index.html` v1.5.0
🔴 معلّقة: تسجيل `ecommoda-constants` §7 (tool/type) — **بقى متأخّرًا، الأداة بتكتب فعليًا وناجحة دلوقتي** — وتسجيل عضوية `delivery_cod_ops` في `secret-groups.md`.

### 26-09-2026 — 4 تابات مستقلة تمامًا + منع إعادة الكتابة على Delivered تاني (`index.js` v1.5.0 · `index.html` v1.5.0)

- **بطلب أحمد** — 5 تغييرات مع بعض في تسليم واحد:
  1. **التابات بقت مستقلة تمامًا** — قبل كده تاب "✅ Delivered" كان بيقرا نفس
     `rawEvents` اللي التاب الأول محمّلها وبيتأثر بفلتر الأوردر/التتبع/التاريخ
     بتاعه (server-side وقتها). دلوقتي كل تاب معاه نسخته الخاصة من الفلاتر
     (اختيار متعدد + بحث + فترة + ترتيب) — `tabState[tabKey]` منفصل بالكامل،
     ومفيش أي state متشارك. التحميل من `list_events` بقى نداء واحد بلا فلاتر
     (كل الفلترة بقت client-side)، فمفيش تكلفة نداءات إضافية رغم استقلال
     التابات.
  2. **تاب "📋 كل الأحداث" اتسمّى "🚚 الأوردرات تحت التوصيل"** وبقى بيستبعد
     أحداث الحالات 45 (Delivered) و46 (Returned to business) و47 (Exception) —
     دول بقى ليهم تابات مستقلة (بند 3-5).
  3. **تاب "✅ Delivered" القديم بقى "🗄 الأرشيف"** (آخر تاب في الترتيب،
     `state === 45`) — نفس منطق العرض القديم (كل `write_status`، مش
     `written` بس)، الاسم والمكان بس اتغيّروا.
  4. **تاب جديد "⚠️ Exception"** (`state === 47`).
  5. **تاب جديد "↩️ Returned to business"** (`state === 46`).
  - `TOOL_VERSION` اتصعّد لـ `1.5.0`، و`MIN_WORKER_VERSION` كمان لـ `1.5.0`
    (البند التالي).
- **منع إعادة الكتابة على شوبيفاي لحدث Delivered تاني على نفس الأوردر/الـ
  slot** — `matchAndWriteMetafields` (index.js) بقى بيدوّر على صف سابق ناجح
  (`write_status='written'`, `state=45`, نفس `business_reference`+
  `matched_slot`) قبل ما يكمل لـ §4.2. لو لقى، بيسجّل الحدث الجديد
  بـ `write_status='delivered_duplicate_skipped'` (قيمة جديدة على عمود موجود،
  مفيش schema change) **من غير أي نداء `metafieldsSet`** — الحدث بيبان في
  السجل والشاشة بس. `RESULT_LABELS`/`resultBadge` في `index.html` اتحدّثوا
  بالقيمة الجديدة (بادج محايد `badge-neutral`). `WORKER_VERSION` اتصعّد لـ
  `1.5.0`.
- **مفيش تغيير SQL/Schema** — القيمة الجديدة كتابة عادية في عمود
  `write_status` النصي الموجود بالفعل.

### 25-09-2026 — إلغاء فلاج `WRITE_METAFIELDS`: الكتابة على شوبيفاي بقت سلوك دائم (`index.js` v1.4.0)

- **بطلب أحمد** — الفلاج `WRITE_METAFIELDS` نفسه اتشال من الكود، مش بس
  اتسيب على `"true"`. مفيش خيار إيقاف كتابة تاني، ومفيش شرط بيتفحص وقت
  التشغيل.
- `matchAndWriteMetafields` (§4.3) — الفرع اللي كان بيتحقق من
  `String(env.WRITE_METAFIELDS).toLowerCase() !== 'true'` ويكتب
  `write_status = 'dry_run_matched'` اتشال بالكامل. أي حدث اتحدد له S1/S2
  دلوقتي بيعدّي على طول لمحاولة الكتابة الفعلية (`metafieldsSet`) — مفيش
  مسار تاني.
- `[vars] WRITE_METAFIELDS = "true"` اتشال من `wrangler.toml`.
- `diag` مابقاش بيعرض بند `WRITE_METAFIELDS` في الفحوصات (مكانش بيفحص حاجة
  فعليًا غير قيمة نصية).
- `get_config` مابقاش بيرجّع `writeMetafields` — الواجهة أصلًا ماكانتش
  بتستخدم الحقل ده (كانت بس بتقرا `version` لمقارنة `MIN_WORKER_VERSION`)،
  فمفيش تغيير مطلوب في `index.html` غير تحديث سطرين توثيق في تاب "عن
  الأداة" (نص القديم كان بيقول "لو WRITE_METAFIELDS=true...").
- 🔴 **قيمة `dry_run_matched` في `write_status` بقت كود ميت** — مش هتتكتب
  تاني من أي حدث جديد (ولا اتكتبت أصلًا على أي حدث حقيقي من قبل، راجع درس
  21→22-09-2026 فوق). الليبل والبادج بتوعها اتسابوا في `index.html`
  (`RESULT_LABELS`/`resultBadge`) للتوافق مع أي صف قديم لو ظهر، من غير أي
  داعي لحذفهم.
- **مفيش تغيير على منطق المطابقة (S1/S2) ولا على الحقلين الإضافيين
  (`manual_status`/`package_whereabouts_s1`) ولا على SQL/Schema** — التعديل
  محصور في شيل شرط الفلاج نفسه + شيل الـ var من `wrangler.toml` + تنضيف
  الوثائق المرتبطة بيه.

### 25-09-2026 — إصلاح: تاب "كل الأحداث" كان بيقص على آخر 200 حدث + تاب "Delivered" كان بيستبعد write_status غير written

- 🔴 **`list_events` كان بيحدد `limit` بحد أقصى 200 دايمًا** (`Math.min(limitRaw, 200)`
  في `index.js`)، والواجهة كانت بتنادي بـ `limit: 200` ثابتة من غير `offset`
  ولا أي pagination — يعني تاب "كل الأحداث" كان بيعرض **آخر 200 حدث بس**
  (أو آخر 200 مطابقين لفلاتر أوردر/تتبع/تاريخ لو مستخدمة)، وأي حدث أقدم
  كان بيختفي من الشاشة بالكامل من غير أي إشارة أو تحذير. فلاتر النوع/الحالة/
  النتيجة/الوصف/كود الحالة/عدد المحاولات (client-side) كانت شغّالة على نفس
  الـ 200 صف دول بس، فمكنش بيوسّع النطاق.
- **الإصلاح:** الحد الأقصى (200) اتشال بالكامل من `list_events` في
  `index.js` (الـ `limit` بقى بلا سقف علوي، الحماية الوحيدة الآن حد أدنى
  1). `loadEvents()` في `index.html` بقت بتسحب كل الصفحات المطابقة على
  batches من `LOAD_PAGE_SIZE = 500` عبر `offset` لحد ما ترجع صفحة أقل من
  500 — يعني كل الأحداث المطابقة لفلاتر السيرفر (أوردر/تتبع/تاريخ) بتتحمّل
  فعليًا، مش أول/آخر batch بس.
- **`MIN_WORKER_VERSION` اتحدّث لـ `1.3.1`** — نسخة Worker أقدم لسه بترجّع
  200 صف كحد أقصى لكل صفحة، فـ `loadEvents()` هتوقف السحب بعد أول صفحة
  (`page.length < LOAD_PAGE_SIZE`) وتقصّ برضه، فأي جهاز بواجهة v1.4.1
  و Worker أقدم من 1.3.1 هيدّي تحذير "نسخة قديمة" بدل ما يقص بصمت.
- **تاب `✅ Delivered` كان بيشترط `write_status === 'written'`** فوق
  `state === 45` — يعني أي حدث Delivered فشلت كتابته فعليًا على شوبيفاي
  (`shopify_write_failed`) أو لسه `processing` كان بيختفي من التاب تمامًا،
  بدل ما يبان كمشكلة محتاجة متابعة. الشرط اتشال، والتاب دلوقتي بيعرض كل
  حدث `state === 45` بغض النظر عن `write_status` — عمود "النتيجة" في كل
  صف بيوضح نجاح الكتابة الفعلي.
- **مفيش تغيير على SQL/Schema ولا على منطق المطابقة/الكتابة في Worker** —
  التعديل الوحيد في `index.js` هو شيل سقف الـ `limit` في `list_events`.

### 22-09-2026 — إضافة: 3 فلاتر جديدة + تاب "Delivered" (واجهة فقط، `index.html` v1.4.0)

- **فلاتر جديدة على الجدول الرئيسي (كلهم checkbox dropdown، زي باقي فلاتر
  الأداة):** الوصف (`description`)، كود الحالة (`state`)، عدد المحاولات
  (`number_of_attempts`) — الأخيرين بتبويبين متبادلين (قائمة قيم / نطاق
  من-إلى) زي فلاتر الأرقام القياسية في `data-table-standard.md` §4. كلهم
  client-side على الـ `rawEvents` المحمّلة فعليًا — **مفيش تعديل Worker
  ولا endpoint جديد**.
- **تاب رئيسي جديد `✅ Delivered`** — شريط `.main-tabs-bar` جديد فوق الجدول
  (تابين: "📋 كل الأحداث" و"✅ Delivered"). التاب الجديد بيعرض بس الأحداث
  اللي `state === 45 && write_status === 'written'` — يعني الأوردرات اللي
  فعليًا اتكتبت عليها حالة Delivered بنجاح على شوبيفاي. بيقرا نفس
  `rawEvents` بتاعة التاب الأول (نفس نداء `list_events`) بدون نداء Worker
  إضافي، فبيتأثر بفلاتر الأوردر/التتبع/التاريخ (server-side) لكن **مش**
  بفلاتر النوع/الحالة/النتيجة/الوصف (دول client-side على التاب الأول بس).
- `TOOL_VERSION` اتصعّد لـ `1.4.0`. **مفيش تغيير Worker في التسليم ده** —
  الميزتين اتبنوا بالكامل على البيانات اللي `list_events` بترجّعها أصلًا.

### 22-09-2026 — إضافة: كتابة `manual_status`/`package_whereabouts_s1` عند Delivered (SEND+S1+45)

- **ميزة جديدة، مش إصلاح** — بطلب أحمد. لما حدث ويبهوك يطابق الأربعة شروط مع
  بعض (`type=SEND`، `matched_slot=S1`، `state=45`، `description="Delivered"`
  حرفيًا) بيتكتب كمان — **إضافة** على `bosta_webhook_status_update_s1`/
  `bosta_webhook_last_update_s1` المعتاديين، مش بدل منهم —:
  ```
  custom.manual_status          ← "Delivered"   (كلمة واحدة فقط، مش "45 · Delivered")
  custom.package_whereabouts_s1 ← "Client"
  ```
- الحقلين دول بينضافوا لنفس `metafieldsSet` call الموجود، فبيورثوا نفس بوابات
  `WRITE_METAFIELDS`/حارس الترتيب الزمني (§4.2) اللي بيحكموا باقي الحقول —
  مفيش مسار كتابة أو استعلام إضافي.
- 🔴 **استثناء واعٍ من قاعدتين موجودتين، اتأكدوا من أحمد صراحة قبل الكتابة:**
  (١) `custom.manual_status` هو حقل S1 اللي قاعدة "ممنوع كتابة
  status_1/status_2" في هذا الملف بتحذّر منه (بيشغّل إجراءات مخزون في
  `Order-Status-Updater`)؛ (٢) `custom.package_whereabouts_s1` خارج نطاقه
  الرسمي حسب Rule 17 من `ecommoda-order-lifecycle` (بوسطة/`Other_Regions`
  مستثناة من الحقل ده أصلًا، والقيمة `Client` مش من الـ enum الرسمي
  `Warehouse`/`Office`/`Courier`). القرارين موثّقين في "فخاخ الأداة دي" فوق.
- `WORKER_VERSION` اتصعّد لـ `1.3.0`. مفيش تغيير في `index.html` (الميزة كلها
  Worker-side، الشاشة بتعرض نفس الأعمدة زي ما هي).

### 22-09-2026 — إصلاح: عمود "موعد التسليم المتوقع" كان بيوقّع الجدول كله (`Invalid time value`)

- 🔴 **v1.3.0 (نفس تسليم إضافة الأعمدة الجديدة) كان بيعرض الشاشة كلها بسطر
  خطأ واحد `Invalid time value` بدل الجدول** — شوهد فعليًا على الإنتاج
  فورًا بعد الدمج: "النتائج: 200" ظاهرة (يعني `list_events` رجّعت البيانات
  صح)، بس `tbody` فاضي إلا من رسالة الخطأ.
- السبب: عمود `delivery_promise_date` (`deliveryPromiseDate` من بوسطة) مش
  مضمون يكون بصيغة ISO نضيفة. `new Date(v)` على قيمة زي `"25-09-2026"`
  بترجّع Invalid Date، و`Intl.DateTimeFormat.formatToParts()` عليها **بترمي**
  `RangeError: Invalid time value` — وده كان بيوقف `.map()` على الـ 200 صف
  كلهم، فالـ `catch` في `loadEvents()` كان بيلقط الاستثناء ويطبع رسالته
  مكان الجدول كله (مش صف واحد بس).
- الإصلاح: `toValidDate()` جديدة في §CONFIG بترجع `null` لأي قيمة `new
  Date()` مايقدرش يفهمها، وبتتستخدم في `formatDateTime`/`formatDateOnly`
  ومفاتيح الترتيب (`_sort_promise`/`_sort_time`) بدل `new Date(...)`
  المباشرة. النتيجة: حدث واحد بتاريخ غريب بيعرض `—` في عموده بس، وباقي
  الـ 200 صف يفضلوا يتعرضوا عادي.
- **الدرس:** أي حقل تاريخ **راجع من مصدر خارجي** (مش من الـ Worker نفسه
  زي `received_at`) لازم يعدّي على تحقق صلاحية قبل `Intl.DateTimeFormat`،
  مش بس قبل العرض — استثناء واحد وسط `.map()` على batch كامل بيوقف الـ
  batch كله، مش الصف المسبب بس.
- الواجهة اتصعّدت لـ `v1.3.1` — مفيش تغيير Worker في الإصلاح ده.

### 22-09-2026 — تحويل الشاشة لمعيار `data-table-standard.md` + هايبرلينكات + أعمدة جديدة

- **الجدول والفلاتر** اتحوّلوا بالكامل من كارتين منفصلين (فلاتر + جدول) لكارت
  واحد موحّد (`.unified-section`) بمعيار `ecommoda-html-builder`
  `data-table-standard.md`: هيدر فلاتر قابل للطي، فلاتر اختيار متعدد
  (checkbox dropdown) على النوع/الحالة(الجنب)/النتيجة، فترة سريعة **بدون
  افتراضي** + "✕ مسح الاختيار"، Chips سطر منفصل لكل فلتر، وترتيب 3 حالات
  على كل عمود (تصاعدي/تنازلي/بلا) مستقل عن الفلاتر. فلاتر النوع/الحالة/
  النتيجة **client-side** على الـ batch المحمّل من `list_events` (مفيش
  Worker endpoint جديد لها) — فلاتر الأوردر/التتبع/التاريخ لسه server-side
  زي ما كانت.
- **رقم الأوردر بقى هايبرلينك لشوبيفاي** (`orderLink()`، design-system.md)
  — محتاج `shopify_order_id` رقمي راجع من الـ Worker. العمود ده **جديد على
  `bosta_webhook_events`** (كان بيتحسب بس وقت المطابقة ويتبعت لجدول `logs`
  المشترك، مش بيتخزّن على الحدث نفسه) — بقى يتخزّن على الصف نفسه في أي
  مسار بعد ما `findOrder` يلاقي الأوردر (حتى لو المطابقة/الكتابة فشلت بعد
  كده)، وبيترقّى ذاتيًا (`ALTER TABLE ... ADD COLUMN`) أول `no such column`.
  `MIN_WORKER_VERSION` في الواجهة اتحدّث لـ `1.2.0` عشان كده — Worker أقدم
  هيدّي تحذير "نسخة قديمة" بدل ما يعرض رقم أوردر بلا لينك بصمت.
- **رقم التتبع بقى هايبرلينك لداشبورد بوسطة**
  (`https://business.bosta.co/orders/<رقم التتبع>`) — مباشرة من العمود
  الموجود أصلاً، مفيش تغيير Worker.
- **تسمية عمودين اتغيّرت** (راجع "فخاخ الأداة دي" فوق) لحل تعارض الاسم —
  البيانات نفسها ما اتلمستش.
- بادج النتيجة `written` بقى نصه **"تم التسجيل"** بدل "اتكتب".
- **3 أعمدة جديدة** من حقول كانت موجودة في `bosta_webhook_events` بالفعل
  ومفيش أي تعديل Worker محتاج لها: النوع (`bosta_type`)، موعد التسليم
  المتوقع (`delivery_promise_date`)، عدد المحاولات (`number_of_attempts`).
- `--container-max` اتحدّث من Tier M (`1200px`) لـ Tier L (`1400px`) — 11
  عمود دلوقتي بدل 8 (`design-system.md` § Container Width Tiers).

### 22-09-2026 — إصلاح `FIND_ORDER_QUERY`: 100% من الكتابات كانت بتفشل من أول يوم

- التشخيص بدأ من شاشة `list_events`: كل صف (200 نتيجة معروضة، وبفحص D1
  المباشر 448/448 حدث) عليه `write_status = shopify_write_failed` وعمودي
  «الجنب»/«طريقة المطابقة» فاضيين على كل صف بلا استثناء — علامة إن الفشل
  قبل مرحلة تحديد S1/S2 مش فيها.
- `diag` كان بيقول `Shopify OAuth: نجح` — استبعد التوكن والأسرار (اتأكدوا
  كمان إنهم copy/paste من نفس مصدر باقي الستاك). الاستعلام الفعلي في
  `notes` (اتقرا مباشرة من D1 عبر MCP) كشف السبب الحقيقي: `findOrder: Field
  'metafields' doesn't accept argument 'identifiers' | Field 'key' doesn't
  exist on type 'MetafieldConnection' | ...`.
- السبب: `Order.metafields` في GraphQL Admin API نوعها `MetafieldConnection`
  (بتحتاج `edges { node { ... } }` + `first`)، مش حقل بيقبل `identifiers`
  ويرجّع `{ key value }` مباشرة — الصيغة دي بس صحيحة على `metafieldsSet`/
  `metafieldsDelete` (مش على قراءة نستد جوه أوردر). الإصلاح: `metafield(namespace,
  key)` المفرد بـ alias لكل حقل من الأربعة (`shopify-graphql-helper` §3.3).
- **الدرس الأهم:** فحص `diag` لـ Shopify OAuth بيستخدم استعلام مختلف
  (`currentAppInstallation`) — نجاحه بيثبت التوكن شغّال، **مش** إن كل
  استعلام تاني في الكود سليم سكيماتيًا. لازم اختبار حي لكل استعلام جديد،
  مش الاعتماد على فحص عام واحد.

### 22-09-2026 — `check-log-values.mjs` مصلَّح + الطبقة ٥ (Step 7-ج)

- `check-log-values.mjs` استُبدل بالنسخة المصلَّحة (بتمسك `{ tool, type }`
  shorthand). التشغيل بعد الاستبدال: **٧ قيمة مسجّلة · ٧ مستخدمة · exit 0**
  — مفيش قيم مش مسجّلة ولا ديناميكية ولا نداءات كتابة عمياء في هذا الريبو.
- الحارس الديناميكي (`LOG_REGISTRY` + `noteUnregisteredLogValues`) اتحط في
  `writeLog` (الأنكور الوحيد المستخدم هنا — مفيش `writeLogsBatch` ولا أي
  أنكور تاني في الملف). مفيش رفض كتابة أبدًا — قيمة غير مسجّلة بتتكتب عادي
  + `extra._unregistered = true` + UPSERT في `log_value_alerts` (الجدول
  المشترك، **مش** اتعمل هنا).

آخر تحديث: 26-09-2026

</div>
