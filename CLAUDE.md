<div dir="rtl" style="text-align: right;">

# مستقبل حالة شحنات بوسطة (`Bosta-Webhook-Status-Receiver`)

![version](https://img.shields.io/badge/version-v1.2.0-blue)

> بيتحمّل أوتوماتيك في كل جلسة Claude — في Claude Code وCowork.

**بتعمل إيه:** بتستقبل أحداث الويبهوك من بوسطة (تغيير حالة شحنة)، تسجّلها خام
في D1، وتكتب آخر حالة في ٤ ميتافيلدات على الأوردر المطابق في شوبيفاي.
**مين بيستخدمها:** فريق العمليات — شاشة مراقبة للأحداث والاستثناءات.
**الإصدار:** Worker `v1.1.0` · الواجهة `v1.2.0`

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

> 🔴 **درس 20/21-09-2026 — كل أحداث اليومين دول ضاعت.** بوسطة كانت بتبعت
> والتحقق كان بيعدّي، بس `db.exec(SCHEMA_SQL)` كان بيفشل لأن الـ SQL كانت
> منسّقة على ٢٦ سطر (عقد `exec` = عبارة واحدة لكل سطر)، والـ Worker كان
> بيرد **200** فبوسطة ما أعادتش. والشاشة كانت بتعرض «مفيش أي حدث اتسجّل من
> بوسطة» لأن `list_events` كان بيبلع `no such table` ويرجّع `[]`.
> الاتنين اتصلحوا في v1.1.0/v1.2.0، والأحداث الضايعة **مش قابلة للاسترجاع**.

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
| `list_events` | `WORKER_SECRET` | للشاشة — فلتر بـ `order` / `tracking` / `dateFrom` / `dateTo` |
| `diag` | `WORKER_SECRET` | آخر حدث امتى · عدد آخر ٢٤ ساعة · `duplicate_skipped`/`match_failed` · وجود الأسرار (`!!` بس) · Shopify OAuth |
| `get_config` | `WORKER_SECRET` | `WORKER_VERSION` + حالة `WRITE_METAFIELDS` |
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
CREATE TABLE IF NOT EXISTS bosta_webhook_events (id INTEGER PRIMARY KEY AUTOINCREMENT, bosta_id TEXT NOT NULL, state INTEGER NOT NULL, bosta_timestamp INTEGER NOT NULL, tracking_number TEXT NOT NULL, business_reference TEXT NOT NULL, order_number TEXT, bosta_type TEXT, description TEXT, event_type TEXT, delivery_promise_date TEXT, number_of_attempts INTEGER, cod REAL, is_confirmed_delivery INTEGER, exception_reason TEXT, exception_code TEXT, matched_slot TEXT, match_method TEXT, write_status TEXT NOT NULL DEFAULT 'processing', metafields_written INTEGER NOT NULL DEFAULT 0, raw_payload TEXT NOT NULL, received_at TEXT NOT NULL, UNIQUE(bosta_id, state, bosta_timestamp)); CREATE INDEX IF NOT EXISTS idx_bwe_order ON bosta_webhook_events(order_number); CREATE INDEX IF NOT EXISTS idx_bwe_tracking ON bosta_webhook_events(tracking_number); CREATE INDEX IF NOT EXISTS idx_bwe_received_at ON bosta_webhook_events(received_at);
```

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
           WRITE_METAFIELDS="true" · SILENCE_THRESHOLD_HOURS="3"      ← من [vars] في wrangler.toml
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
- 🔴 **`WRITE_METAFIELDS = "true"` من 21-09-2026 (قرار أحمد)** — الأداة
  بتكتب على شوبيفاي فعليًا من أول حدث جاي.
  ⚠️ **مرحلة `dry_run_matched` اتخطّت ومحصلتش أصلًا:** ولا حدث اتخزّن قبل
  21-09-2026 بسبب عطل `SCHEMA_SQL`، فالمطابقة **ما اتراجعتش على أحداث
  حقيقية ولا مرة**. أول أسبوع لازم يتراقب من الشاشة (عمودي «الجنب» و«طريقة
  المطابقة») وبانر فشل المطابقة.
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
- **رقم التتبع أولًا، بعدين `type` كـ fallback** (§4.1 في البريف الأصلي) —
  فشل الاتنين = `match_failed` + صفر كتابة، مش تخمين.
- **قيم `type` في payload الويبهوك شكل تالت** (`SEND`/`EXCHANGE`/...) مختلف
  تمامًا عن `type.code` في `/deliveries/*` — الجدولين منفصلين
  (`TYPE_TO_SLOT_FALLBACK` في الكود).

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
v1.1.0 (واجهة) · Worker v1.0.0 — commit 57012a7 (20-09-2026)
🔴 النسخة دي فيها عطل SCHEMA_SQL — أي رجوع ليها بيوقف تخزين الأحداث تاني.
```

## بصمة المهارات

| المهارة | الإصدار وقت آخر تعديل |
|---|---|
| ecommoda-worker-builder | v3.4.0 |
| bosta-api-helper | v6.0.0 |
| ecommoda-constants | v2.7.0 |
| ecommoda-tool-migration-playbook | (بلا رقم إصدار ظاهر وقت القراءة) |

آخر مطابقة: 21-09-2026 · `index.js` v1.1.0 · `index.html` v1.2.0
🔴 معلّقة: تسجيل `ecommoda-constants` §7 (tool/type) — **بقى متأخّرًا، الأداة بتكتب فعليًا** — وتسجيل عضوية `delivery_cod_ops` في `secret-groups.md`.

آخر تحديث: 21-09-2026

</div>
