// ══════════════════════════════════════════════════════════════
// §CONSTANTS
// Worker: bosta-webhook-status-receiver-worker — EcomModa
// skills: ecommoda-worker-builder v3.7.1 · bosta-api-helper v6.0.0 ·
//         ecommoda-constants v3.1.0 · ecommoda-tool-migration-playbook
//
// 🔴 STOP — قبل أول push للإنتاج: 'bosta_webhook_status' وقيم type
//    السبعة تحت لازم تتسجّل في ecommoda-constants §7 (Rule 7). راجع
//    CLAUDE.md → "🔴 معلّقة" لتفاصيل الحالة الحالية.
// ══════════════════════════════════════════════════════════════
const TOOL_NAME     = 'bosta_webhook_status';
const WORKER_VERSION = '1.2.0';

// STATE_MAP — نفس أكواد bosta-api-helper Step 3، بيتستخدم fallback بس لو
// description غايب من payload الويبهوك (الحالة الطبيعية إنه موجود دايمًا).
const STATE_MAP = {
  10: 'Pickup requested', 11: 'Waiting for route', 20: 'Route Assigned',
  21: 'Picked up from business', 22: 'Picking up from consignee',
  23: 'Picked up from consignee', 24: 'Received at warehouse', 25: 'Fulfilled',
  30: 'In transit between Hubs', 40: 'Picking up', 41: 'Picked up',
  45: 'Delivered', 46: 'Returned to business', 47: 'Exception', 48: 'Terminated',
  49: 'Canceled', 60: 'Returned to stock', 100: 'Lost', 101: 'Damaged',
  102: 'Investigation', 103: 'Awaiting your action', 104: 'Archived', 105: 'On hold',
};

// قيم type في payload الويبهوك — شكل تالت مختلف عن /deliveries/* (bosta-api-helper
// Step 8a). Fallback لتحديد S1/S2 لما رقم التتبع مش متسجّل على الأوردر بعد (§4.1).
const TYPE_TO_SLOT_FALLBACK = {
  SEND: 's1', FXF_SEND: 's1', RTO: 's1',
  CUSTOMER_RETURN_PICKUP: 's2', EXCHANGE: 's2', SIGN_AND_RETURN: 's2',
};

// نافذة مراقبة السكوت (§7.1) — قابلة للتعديل من [vars] من غير كود جديد.
const DEFAULT_SILENCE_THRESHOLD_HOURS = 3;

// ════════════════════════════════════════════════════════════
// §LOG-REG — الحارس الديناميكي لقيم اللوج (الطبقة ٥)
// ════════════════════════════════════════════════════════════
// قطعة الأداة دي بس من log-values.json اللي جنبها — بتتحدّث معاه في
// نفس الـ commit. ممنوع شحن السجل الكامل بتاع كل الأدوات هنا (Step 7-ب
// عن ليه: قيمة مزروعة في ٣٢ ملف = نفس مشكلة السكيل القديمة).
const LOG_REGISTRY = {
  bosta_webhook_status: new Set([
    'login', 'logout', 'duplicate_skipped', 'match_failed',
    'shopify_write_failed', 'status_event', 'unauthorized',
  ]),
};

const isRegisteredLogValue = (tool, type) => !!LOG_REGISTRY[tool]?.has(type);

// UPSERT على (source_tool, tool, type) — صف واحد لكل قيمة، hits بيعدّ.
// الحدث الكامل مش بيضيع: الصف الأصلي موجود في logs وعليه _unregistered،
// والجدول ده فهرس مش سجل تاني — عشان كده dedupe مش صف لكل حدث.
const LOG_ALERT_SQL = `
  INSERT INTO log_value_alerts
    (source_tool, tool, type, first_seen, last_seen, hits,
     worker_version, sample_order_name, sample_employee, sample_notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source_tool, tool, type) DO UPDATE SET
    last_seen         = excluded.last_seen,
    hits              = log_value_alerts.hits + excluded.hits,
    worker_version    = excluded.worker_version,
    sample_order_name = excluded.sample_order_name,
    sample_employee   = excluded.sample_employee,
    sample_notes      = excluded.sample_notes,
    status            = CASE WHEN log_value_alerts.status = 'ignored'
                             THEN 'ignored' ELSE 'open' END
`;

// فشل التنبيه ممنوع يأثر على أي حاجة — try/catch صامت. بتجمّع التكرار
// جوّه نفس الدفعة في صف واحد (hits) قبل ما تكتب.
async function noteUnregisteredLogValues(db, entries) {
  const byPair = new Map();
  for (const e of entries) {
    const key = `${e.tool}\u0000${e.type}`;
    const acc = byPair.get(key);
    if (acc) { acc.hits++; continue; }
    byPair.set(key, { entry: e, hits: 1 });
  }
  const now = new Date().toISOString();
  for (const { entry, hits } of byPair.values()) {
    try {
      await db.prepare(LOG_ALERT_SQL).bind(
        TOOL_NAME, entry.tool ?? '(بدون tool)', entry.type ?? '(بدون type)',
        now, now, hits, WORKER_VERSION ?? null,
        entry.orderName ?? null, entry.employee ?? null,
        entry.notes ? String(entry.notes).slice(0, 200) : null,
      ).run();
    } catch (e) { /* متعمّد: التنبيه فهرس، وفشله أهون من تعطيل الأداة */ }
  }
}

// ══════════════════════════════════════════════════════════════
// §CORS — Option B (الأداة بتكتب على أوردرات حقيقية في شوبيفاي)
// ══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://ecommoda-dev.github.io',
];
function getCORS(request) {
  const origin  = (request && request.headers.get('Origin')) || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// ══════════════════════════════════════════════════════════════
// §HELPERS
// ══════════════════════════════════════════════════════════════
function json(data, status = 200, request = null) {
  const headers = { 'Content-Type': 'application/json' };
  Object.assign(headers, request ? getCORS(request) : { 'Access-Control-Allow-Origin': '*' });
  return new Response(JSON.stringify(data), { status, headers });
}

// ─── §HELPERS::safeEqual — timing-safe, من webhook-receivers.md ───
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── §HELPERS::assertEnv ───
const ENV_REQUIRED = {
  shopify: ['SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET'],
};
function assertEnv(env, ...groups) {
  const missing = [];
  for (const g of groups) {
    for (const key of (ENV_REQUIRED[g] || [])) {
      if (env[key] === undefined || env[key] === null || String(env[key]).trim() === '') missing.push(key);
    }
  }
  if (!env.DB) missing.push('DB (D1 binding)');
  if (missing.length) {
    throw new Error(`متغيرات ناقصة في الـ Worker: ${missing.join('، ')} — ضِفها ثم Promote (?action=diag)`);
  }
}

// ══════════════════════════════════════════════════════════════
// §SHARED — copy verbatim from ecommoda-worker-builder/references/shared-functions.md — never modify
// ══════════════════════════════════════════════════════════════

async function verifyEmployee(db, username, pin) {
  const row = await db.prepare(
    'SELECT display_name, is_active FROM employees WHERE username = ? AND pin = ?'
  ).bind(username, pin).first();

  if (!row) return null;

  if (!row.is_active) {
    throw new Error('الحساب موقوف — تواصل مع المسؤول');
  }

  db.prepare('UPDATE employees SET last_login = ? WHERE username = ?')
    .bind(new Date().toISOString(), username)
    .run()
    .catch(() => {});

  return row.display_name;
}

async function checkEmployee(db, username) {
  const row = await db.prepare(
    'SELECT is_active, pin FROM employees WHERE username = ?'
  ).bind(username).first();

  if (!row) return { exists: false, hasPin: false, isActive: false };
  return {
    exists:   true,
    hasPin:   !!row.pin,
    isActive: !!row.is_active,
  };
}

async function registerPin(db, username, pin) {
  const row = await db.prepare(
    'SELECT pin, is_active FROM employees WHERE username = ?'
  ).bind(username).first();

  if (!row)           throw new Error('اسم المستخدم غير موجود');
  if (!row.is_active) throw new Error('الحساب موقوف — تواصل مع المسؤول');
  if (row.pin)        throw new Error('هذا المستخدم مسجّل بالفعل — تواصل مع المسؤول لإعادة الضبط');

  await db.prepare('UPDATE employees SET pin = ? WHERE username = ?')
    .bind(pin, username)
    .run();

  return true;
}

async function writeLog(db, entry) {
  // §LOG-REG — الحارس الديناميكي (الطبقة ٥): مفيش رفض كتابة أبدًا. قيمة
  // (tool, type) مش مسجّلة بتتكتب عادي + extra._unregistered = true.
  const unregistered = !isRegisteredLogValue(entry.tool, entry.type);
  const extra = unregistered
    ? { ...(entry.extra || {}), _unregistered: true }
    : entry.extra;

  await db.prepare(`
    INSERT INTO logs
      (timestamp, tool, type, employee, order_id, order_name,
       sku, product_title, delta, value_before, value_after, notes, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.timestamp    ?? new Date().toISOString(),
    entry.tool,
    entry.type,
    entry.employee     ?? null,
    entry.orderId      ?? null,
    entry.orderName    ?? null,
    entry.sku          ?? null,
    entry.productTitle ?? null,
    entry.delta        ?? null,
    entry.valueBefore  ?? null,
    entry.valueAfter   ?? null,
    entry.notes        ?? null,
    extra ? JSON.stringify(extra) : null
  ).run();

  if (unregistered) await noteUnregisteredLogValues(db, [entry]);  // بعد الكتابة، مش قبلها
}

const LOG_EXPORT_MAX = 2000;

function buildLogFilterSQL(select, {
  tool      = null,
  employee  = null, employees = null,
  type      = null, types     = null,
  search    = null,
  dateFrom  = null, dateTo    = null,
} = {}) {
  let sql = `${select} FROM logs WHERE type NOT IN ('login','logout')`;
  const b = [];

  const emps = Array.isArray(employees) && employees.length ? employees : (employee ? [employee] : []);
  const typs = Array.isArray(types)     && types.length     ? types     : (type     ? [type]     : []);

  if (tool) { sql += ' AND tool = ?'; b.push(tool); }
  if (emps.length) {
    sql += ` AND employee IN (${emps.map(() => '?').join(',')})`; b.push(...emps);
  }
  if (typs.length) {
    sql += ` AND type IN (${typs.map(() => '?').join(',')})`; b.push(...typs);
  }
  if (search) {
    sql += ' AND (order_name LIKE ? OR notes LIKE ?)';
    b.push(`%${search}%`, `%${search}%`);
  }
  if (dateFrom) { sql += ' AND substr(timestamp, 1, 10) >= ?'; b.push(dateFrom); }
  if (dateTo)   { sql += ' AND substr(timestamp, 1, 10) <= ?'; b.push(dateTo); }

  return { sql, b };
}

async function getLogs(db, { limit = 100, offset = 0, sortBy, sortDir, ...filters } = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT *', filters);
  const q = sql + orderByClause(sortBy, sortDir) + ' LIMIT ? OFFSET ?';
  return (await db.prepare(q)
    .bind(...b, Math.min(limit, 100), Math.max(offset, 0)).all()).results;
}

const LOG_SORT_COLUMNS = {
  date: 'timestamp', time: 'timestamp', employee: 'employee', orderName: 'order_name',
  machine: `json_extract(extra, '$.machine')`, result: `json_extract(extra, '$.result')`,
};

function orderByClause(sortBy, sortDir) {
  const col = LOG_SORT_COLUMNS[String(sortBy || '')] || 'timestamp';
  const dir = String(sortDir || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return col === 'timestamp' ? ` ORDER BY timestamp ${dir}`
                             : ` ORDER BY ${col} ${dir}, timestamp DESC`;
}

async function getLogsCount(db, filters = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT COUNT(*) as total', filters);
  const row = await db.prepare(sql).bind(...b).first();
  return row?.total ?? 0;
}

async function getLogsExport(db, filters = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT *', filters);
  const q = sql + ' ORDER BY timestamp DESC LIMIT ?';
  return (await db.prepare(q).bind(...b, LOG_EXPORT_MAX).all()).results;
}

function logParamsFrom(url, tool) {
  const csv = (k) => (url.searchParams.get(k) || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const employees = csv('employees'), types = csv('types');
  return {
    tool,
    employees: employees.length ? employees : null,
    employee:  url.searchParams.get('employee') || null,
    types:     types.length ? types : null,
    type:      url.searchParams.get('type')     || null,
    search:    url.searchParams.get('search')   || null,
    dateFrom:  url.searchParams.get('dateFrom') || null,
    dateTo:    url.searchParams.get('dateTo')   || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// END SHARED BLOCK
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// §SHOPIFY
// ══════════════════════════════════════════════════════════════
const OAUTH_MAX_ATTEMPTS = 3;

async function getAccessToken(env) {
  let lastErr = null;
  for (let attempt = 1; attempt <= OAUTH_MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(`https://${env.SHOP_DOMAIN}/admin/oauth/access_token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET,
                               grant_type: 'client_credentials' }),
      });
      if (!resp.ok) {
        const retriable = resp.status === 429 || resp.status >= 500;
        lastErr = new Error(`OAuth failed: ${resp.status}`);
        if (retriable && attempt < OAUTH_MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 700 * attempt)); continue; }
        throw lastErr;
      }
      const data = await resp.json();
      if (!data.access_token) throw new Error('OAuth: No access_token in response');
      return data.access_token;
    } catch (e) {
      lastErr = e;
      if (attempt < OAUTH_MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
      throw lastErr;
    }
  }
  throw lastErr || new Error('OAuth: unknown failure');
}

let _lastThrottle = null, _lastQueryCost = null;

async function shopifyGQL(env, token, query, variables = {}, opName = 'shopify', costLog = null) {
  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp, text;
    try {
      resp = await fetch(`https://${env.SHOP_DOMAIN}/admin/api/2026-01/graphql.json`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body:    JSON.stringify({ query, variables }),
      });
      text = await resp.text();
    } catch (e) {
      lastErr = new Error(`${opName}: فشل الاتصال بشوبيفاي — ${e.message}`);
      if (attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
      throw lastErr;
    }

    if (!resp.ok) {
      const retriable = resp.status === 429 || resp.status >= 500;
      lastErr = new Error(`${opName}: شوبيفاي ردّت HTTP ${resp.status} — ${text.slice(0, 180)}`);
      if (retriable && attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 700 * attempt)); continue; }
      throw lastErr;
    }

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`${opName}: رد شوبيفاي مش JSON صالح — ${text.slice(0, 180)}`); }

    if (Array.isArray(data.errors) && data.errors.length) {
      const codes = data.errors.map(e => e?.extensions?.code).filter(Boolean);
      lastErr = new Error(
        `${opName}: ${data.errors.map(e => e.message).join(' | ')}` +
        (codes.length ? ` [${codes.join(',')}]` : '')
      );
      if (codes.includes('THROTTLED') && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1200 * attempt)); continue;
      }
      throw lastErr;
    }

    if (!data.data) throw new Error(`${opName}: رد شوبيفاي بدون data — ${text.slice(0, 180)}`);

    if (data.extensions?.cost) {
      const c = data.extensions.cost;
      if (c.throttleStatus) _lastThrottle = c.throttleStatus;
      _lastQueryCost = { op: opName, requested: c.requestedQueryCost ?? null, actual: c.actualQueryCost ?? null };
      if (costLog) costLog.push({ op: opName, requested: c.requestedQueryCost ?? null, actual: c.actualQueryCost ?? null });
    }
    return data;
  }
  throw lastErr || new Error(`${opName}: فشل غير معروف`);
}

// 🔴 metafields على Order نوعها MetafieldConnection — مش بتقبل identifiers
//    ومش بترجع { key value } مباشرة (ده اللي كان بيفشّل كل حدث من غير استثناء
//    من أول يوم: findOrder: Field 'metafields' doesn't accept argument
//    'identifiers'). الصيغة الصح: metafield(namespace, key) المفرد + alias
//    لكل حقل (نفس نمط shopify-graphql-helper §Step 3.3).
const FIND_ORDER_QUERY = `
  query FindOrderForBostaWebhook($q: String!) {
    orders(first: 1, query: $q) {
      edges {
        node {
          id
          legacyResourceId
          name
          bosta_tracking_number_s1: metafield(namespace: "custom", key: "bosta_tracking_number_s1") { value }
          bosta_tracking_number_s2: metafield(namespace: "custom", key: "bosta_tracking_number_s2") { value }
          bosta_webhook_last_update_s1: metafield(namespace: "custom", key: "bosta_webhook_last_update_s1") { value }
          bosta_webhook_last_update_s2: metafield(namespace: "custom", key: "bosta_webhook_last_update_s2") { value }
        }
      }
    }
  }`;

const SET_METAFIELDS_MUTATION = `
  mutation SetBostaWebhookMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key }
      userErrors { field message }
    }
  }`;

// ══════════════════════════════════════════════════════════════
// §D1-SCHEMA — جدول إضافي غير logs/employees المشتركين، موثّق في CLAUDE.md
// ══════════════════════════════════════════════════════════════
// 🔴 عقد db.exec() في D1: بيقسّم النص عند كل سطر جديد ويعتبر كل سطر عبارة
//    كاملة. يعني كل CREATE لازم يبقى **سطر واحد**، والعبارات تتفصل بـ \n بس.
//    SQL منسّق على أكتر من سطر بيرجّع "incomplete input" والجدول ما بيتعملش —
//    وده اللي خلّى كل أحداث 20/21-09-2026 تضيع (نفس قاعدة ecommoda-constants §8).
const SCHEMA_SQL = [
  "CREATE TABLE IF NOT EXISTS bosta_webhook_events (id INTEGER PRIMARY KEY AUTOINCREMENT, bosta_id TEXT NOT NULL, state INTEGER NOT NULL, bosta_timestamp INTEGER NOT NULL, tracking_number TEXT NOT NULL, business_reference TEXT NOT NULL, order_number TEXT, bosta_type TEXT, description TEXT, event_type TEXT, delivery_promise_date TEXT, number_of_attempts INTEGER, cod REAL, is_confirmed_delivery INTEGER, exception_reason TEXT, exception_code TEXT, matched_slot TEXT, match_method TEXT, write_status TEXT NOT NULL DEFAULT 'processing', metafields_written INTEGER NOT NULL DEFAULT 0, shopify_order_id TEXT, raw_payload TEXT NOT NULL, received_at TEXT NOT NULL, UNIQUE(bosta_id, state, bosta_timestamp))",
  "CREATE INDEX IF NOT EXISTS idx_bwe_order ON bosta_webhook_events(order_number)",
  "CREATE INDEX IF NOT EXISTS idx_bwe_tracking ON bosta_webhook_events(tracking_number)",
  "CREATE INDEX IF NOT EXISTS idx_bwe_received_at ON bosta_webhook_events(received_at)",
].join('\n');

// 🔴 v1.2.0 — عمود جديد على جدول موجود بالفعل في الإنتاج. SCHEMA_SQL فوق
//    بيغطي التركيب من الصفر بس (CREATE TABLE IF NOT EXISTS ما بيلمسش جدول
//    موجود). الترقية الفعلية هنا: updateEventRow بيمسك "no such column"
//    ويضيفه مرة واحدة ذاتيًا — بدون أي خطوة يدوية في D1 Console.
const ADD_SHOPIFY_ORDER_ID_SQL = "ALTER TABLE bosta_webhook_events ADD COLUMN shopify_order_id TEXT";

// نص ثابت لملاحظة فشل تخزين الحدث — diag بيعدّ بيه (§5)، فممنوع يتغيّر في مكان واحد بس.
const STORE_FAIL_NOTE = 'فشل تسجيل الحدث الخام في D1';

// ─── §WEBHOOK::claimBostaEvent — الادّعاء الذرّي على التكرار (idempotency) ───
// UNIQUE(bosta_id, state, bosta_timestamp) هو الحارس — بوسطة بتبعت نفس الحدث
// أكتر من مرة حتى مع رد 200 (bosta-api-helper Step 8a، مقيس 19-09-2026).
async function claimBostaEvent(db, fields) {
  const sql = `INSERT OR IGNORE INTO bosta_webhook_events
      (bosta_id, state, bosta_timestamp, tracking_number, business_reference, order_number,
       bosta_type, description, event_type, delivery_promise_date, number_of_attempts,
       cod, is_confirmed_delivery, exception_reason, exception_code,
       matched_slot, match_method, write_status, metafields_written, raw_payload, received_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const bind = [
    fields.bostaId, fields.state, fields.bostaTimestamp, fields.trackingNumber,
    fields.businessReference, fields.orderNumber, fields.bostaType, fields.description,
    fields.eventType, fields.deliveryPromiseDate, fields.numberOfAttempts,
    fields.cod, fields.isConfirmedDelivery, fields.exceptionReason, fields.exceptionCode,
    null, null, 'processing', 0, fields.rawPayload, fields.receivedAt,
  ];
  try {
    return await db.prepare(sql).bind(...bind).run();
  } catch (e) {
    if (!/no such table/i.test(e.message)) throw e;
    await db.exec(SCHEMA_SQL);
    return await db.prepare(sql).bind(...bind).run();
  }
}

async function updateEventRow(db, rowId, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const bind = [...keys.map(k => fields[k]), rowId];
  try {
    await db.prepare(`UPDATE bosta_webhook_events SET ${sets} WHERE id = ?`).bind(...bind).run();
  } catch (e) {
    if (!/no such column/i.test(e.message)) throw e;
    await db.exec(ADD_SHOPIFY_ORDER_ID_SQL);
    await db.prepare(`UPDATE bosta_webhook_events SET ${sets} WHERE id = ?`).bind(...bind).run();
  }
}

// ─── §WEBHOOK::matchAndWriteMetafields — تحديد S1/S2 + الكتابة (ctx.waitUntil) ───
async function matchAndWriteMetafields(env, rowId, n) {
  let token;
  try {
    assertEnv(env, 'shopify');
    token = await getAccessToken(env);
  } catch (e) {
    await updateEventRow(env.DB, rowId, { write_status: 'shopify_write_failed' });
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: 'shopify_write_failed', orderName: n.businessReference,
      notes: `فشل الحصول على توكن شوبيفاي: ${e.message}`,
      extra: { result: 'error', bostaId: n.bostaId },
    }).catch(() => {});
    return;
  }

  let orderNode;
  try {
    const data = await shopifyGQL(env, token, FIND_ORDER_QUERY, { q: `name:${n.businessReference}` }, 'findOrder');
    orderNode = data.data?.orders?.edges?.[0]?.node ?? null;
  } catch (e) {
    await updateEventRow(env.DB, rowId, { write_status: 'shopify_write_failed' });
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: 'shopify_write_failed', orderName: n.businessReference,
      notes: `فشل البحث عن الأوردر: ${e.message}`,
      extra: { result: 'error', bostaId: n.bostaId },
    }).catch(() => {});
    return;
  }

  if (!orderNode) {
    await updateEventRow(env.DB, rowId, { write_status: 'match_failed' });
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: 'match_failed', orderName: n.businessReference,
      notes: 'الأوردر مش موجود على شوبيفاي',
      extra: { result: 'rejected', bostaId: n.bostaId, trackingNumber: n.trackingNumber },
    }).catch(() => {});
    return;
  }

  const mfMap = {
    bosta_tracking_number_s1: orderNode.bosta_tracking_number_s1?.value ?? null,
    bosta_tracking_number_s2: orderNode.bosta_tracking_number_s2?.value ?? null,
    bosta_webhook_last_update_s1: orderNode.bosta_webhook_last_update_s1?.value ?? null,
    bosta_webhook_last_update_s2: orderNode.bosta_webhook_last_update_s2?.value ?? null,
  };

  // §4.1 — رقم التتبع أولًا (طبّع الاتنين — bosta_tracking_number_s1/_s2 نوعها
  // number_integer عند بعض الأدوات)، وبعدين type كـ fallback.
  const s1Tracking = mfMap['bosta_tracking_number_s1'] != null ? String(mfMap['bosta_tracking_number_s1']).trim() : null;
  const s2Tracking = mfMap['bosta_tracking_number_s2'] != null ? String(mfMap['bosta_tracking_number_s2']).trim() : null;
  const cleanTracking = String(n.trackingNumber || '').trim();

  let slot = null, matchMethod = null;
  if (cleanTracking && s1Tracking && cleanTracking === s1Tracking) { slot = 's1'; matchMethod = 'tracking_number'; }
  else if (cleanTracking && s2Tracking && cleanTracking === s2Tracking) { slot = 's2'; matchMethod = 'tracking_number'; }
  else {
    const fallback = TYPE_TO_SLOT_FALLBACK[n.bostaType];
    if (fallback) { slot = fallback; matchMethod = 'type_fallback'; }
  }

  if (!slot) {
    await updateEventRow(env.DB, rowId, { write_status: 'match_failed', shopify_order_id: orderNode.legacyResourceId });
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: 'match_failed',
      orderId: orderNode.legacyResourceId, orderName: n.businessReference,
      notes: `مش عارفين S1 ولا S2 — trackingNumber:${cleanTracking || '—'} type:${n.bostaType || '—'}`,
      extra: { result: 'rejected', bostaId: n.bostaId },
    }).catch(() => {});
    return;
  }

  // §4.2 — حارس الترتيب: الأحداث بتوصل بترتيب مقلوب أحيانًا.
  const lastUpdateIso = mfMap[`bosta_webhook_last_update_${slot}`] || null;
  const newIso = new Date(n.bostaTimestamp).toISOString();
  if (lastUpdateIso) {
    const lastMs = Date.parse(lastUpdateIso);
    if (Number.isFinite(lastMs) && lastMs > n.bostaTimestamp) {
      await updateEventRow(env.DB, rowId, { matched_slot: slot, match_method: matchMethod, write_status: 'stale_skipped', shopify_order_id: orderNode.legacyResourceId });
      await writeLog(env.DB, {
        tool: TOOL_NAME, type: 'status_event',
        orderId: orderNode.legacyResourceId, orderName: n.businessReference,
        notes: `حدث أقدم من آخر تحديث مكتوب على ${slot} — اتسجّل من غير كتابة`,
        extra: { result: 'rejected', writeStatus: 'stale_skipped', slot, bostaId: n.bostaId },
      }).catch(() => {});
      return;
    }
  }

  const statusValue = `${n.state} · ${n.description || STATE_MAP[n.state] || 'Unknown'}`;

  // §9 خطوة 3 — الكتابة الفعلية خلف فلاج، يبدأ false.
  if (String(env.WRITE_METAFIELDS).toLowerCase() !== 'true') {
    await updateEventRow(env.DB, rowId, { matched_slot: slot, match_method: matchMethod, write_status: 'dry_run_matched', shopify_order_id: orderNode.legacyResourceId });
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: 'status_event',
      orderId: orderNode.legacyResourceId, orderName: n.businessReference,
      notes: `WRITE_METAFIELDS=false — تم التطابق (${slot}) من غير كتابة فعلية: ${statusValue}`,
      extra: { result: 'success', slot, matchMethod, dryRun: true, bostaId: n.bostaId },
    }).catch(() => {});
    return;
  }

  const metafieldsInput = [
    { ownerId: orderNode.id, namespace: 'custom', key: `bosta_webhook_status_update_${slot}`, type: 'single_line_text_field', value: statusValue },
    { ownerId: orderNode.id, namespace: 'custom', key: `bosta_webhook_last_update_${slot}`,   type: 'date_time',              value: newIso },
  ];

  try {
    const data   = await shopifyGQL(env, token, SET_METAFIELDS_MUTATION, { metafields: metafieldsInput }, 'metafieldsSet');
    const result = data.data?.metafieldsSet;
    const errs   = result?.userErrors || [];
    if (errs.length) throw new Error('metafieldsSet: ' + errs.map(e => e.message).join(' | '));
    if (!result?.metafields || result.metafields.length < 2) throw new Error('metafieldsSet: شوبيفاي ما أكدتش كتابة الحقلين');
  } catch (e) {
    await updateEventRow(env.DB, rowId, { matched_slot: slot, match_method: matchMethod, write_status: 'shopify_write_failed', shopify_order_id: orderNode.legacyResourceId });
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: 'shopify_write_failed',
      orderId: orderNode.legacyResourceId, orderName: n.businessReference,
      notes: e.message,
      extra: { result: 'error', slot, bostaId: n.bostaId },
    }).catch(() => {});
    return;
  }

  await updateEventRow(env.DB, rowId, { matched_slot: slot, match_method: matchMethod, write_status: 'written', metafields_written: 1, shopify_order_id: orderNode.legacyResourceId });
  await writeLog(env.DB, {
    tool: TOOL_NAME, type: 'status_event',
    orderId: orderNode.legacyResourceId, orderName: n.businessReference,
    notes: `${slot.toUpperCase()} ← ${statusValue}`,
    extra: { result: 'success', slot, matchMethod, bostaId: n.bostaId, trackingNumber: cleanTracking },
  }).catch(() => {});
}

// ─── §WEBHOOK::handleWebhook ───
// Bosta بتبعت الهيدر باسم مخصص (اسم المفتاح نفسه في داشبورد بوسطة) —
// مفيش هيدر Authorization خالص (bosta-api-helper Step 8a). ممنوع الرد 500 على
// أي حاجة اتعالجت وفشلت — 401 للتحقق بس، وأي حاجة تانية 200 + سجل D1
// (webhook-receivers.md §4)، وإلا بوسطة ممكن تحذف الاشتراك بعد فشل متكرر.
async function handleWebhook(request, env, ctx) {
  const headerName  = env.BOSTA_WEBHOOK_HEADER_NAME;
  const headerValue = env.BOSTA_WEBHOOK_HEADER_VALUE;
  const sentValue   = headerName ? request.headers.get(headerName) : null;

  if (!headerName || !headerValue || !safeEqual(sentValue || '', headerValue)) {
    ctx.waitUntil(writeLog(env.DB, {
      tool: TOOL_NAME, type: 'unauthorized',
      notes: (!headerName || !headerValue)
        ? 'BOSTA_WEBHOOK_HEADER_NAME/VALUE غير مضبوطة على الـ Worker'
        : 'هيدر التحقق غير موجود أو غير مطابق',
      extra: { result: 'rejected', headerPresent: !!sentValue, envKeys: Object.keys(env) },
    }).catch(() => {}));
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const rawBody = await request.text();
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: 'status_event',
      notes: 'payload غير صالح JSON',
      extra: { result: 'rejected', bodyBytes: rawBody.length },
    }).catch(() => {});
    return json({ ok: true }, 200);
  }

  // 🔴 String(...) دايمًا على trackingNumber — ممكن يوصل number أو string.
  const bostaId           = String(payload._id ?? '').trim();
  const state              = Number(payload.state);
  const bostaTimestamp     = Number(payload.timeStamp);
  const trackingNumber     = String(payload.trackingNumber ?? '').trim();
  const businessReference  = String(payload.businessReference ?? '').trim();
  const orderNumber        = businessReference.replace(/^#/, '').trim();

  if (!bostaId || !Number.isFinite(state) || !Number.isFinite(bostaTimestamp) || !businessReference) {
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: 'status_event',
      notes: 'payload ناقص حقول أساسية (_id/state/timeStamp/businessReference)',
      extra: { result: 'rejected', payload },
    }).catch(() => {});
    return json({ ok: true }, 200);
  }

  const normalized = {
    bostaId, state, bostaTimestamp, trackingNumber, businessReference, orderNumber,
    bostaType:             payload.type ?? null,
    description:           payload.description ?? null,
    eventType:              payload.eventType ?? null,
    deliveryPromiseDate:   payload.deliveryPromiseDate ?? null,
    numberOfAttempts:       payload.numberOfAttempts ?? null,
    cod:                    payload.cod ?? null,
    isConfirmedDelivery:    payload.isConfirmedDelivery === undefined ? null : (payload.isConfirmedDelivery ? 1 : 0),
    exceptionReason:        payload.exceptionReason ?? null,
    exceptionCode:          payload.exceptionCode != null ? String(payload.exceptionCode) : null,
    rawPayload:             rawBody,
    receivedAt:             new Date().toISOString(),
  };

  // 🔴 الادّعاء الذرّي (claim) بيحصل هنا — قبل أي رد — عشان أي فشل بعد كده
  // (كتابة شوبيفاي) يفضل مرئي في D1 (§6 من البريف).
  let claim;
  try {
    claim = await claimBostaEvent(env.DB, normalized);
  } catch (e) {
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: 'status_event',
      notes: `${STORE_FAIL_NOTE}: ${e.message}`,
      extra: { result: 'error', bostaId },
    }).catch(() => {});
    return json({ ok: true }, 200);
  }

  if ((claim.meta?.changes ?? 0) === 0) {
    await writeLog(env.DB, {
      tool: TOOL_NAME, type: 'duplicate_skipped', orderName: businessReference,
      notes: `حدث مكرر — ${bostaId}:${state}:${bostaTimestamp}`,
      extra: { result: 'already', bostaId, state, bostaTimestamp },
    }).catch(() => {});
    return json({ ok: true, duplicate: true }, 200);
  }

  const rowId = claim.meta.last_row_id;
  ctx.waitUntil(matchAndWriteMetafields(env, rowId, normalized).catch(e =>
    writeLog(env.DB, {
      tool: TOOL_NAME, type: 'shopify_write_failed', orderName: businessReference,
      notes: `خطأ غير متوقّع أثناء المعالجة: ${e.message}`,
      extra: { result: 'error', bostaId },
    }).catch(() => {})
  ));

  return json({ ok: true, accepted: true }, 200);
}

// ══════════════════════════════════════════════════════════════
// §MONITOR — مراقبة السكوت (§7.1) — Cron
// ══════════════════════════════════════════════════════════════
async function checkSilence(env) {
  const thresholdHours = Number(env.SILENCE_THRESHOLD_HOURS) || DEFAULT_SILENCE_THRESHOLD_HOURS;
  try {
    const last = await env.DB.prepare(
      'SELECT received_at FROM bosta_webhook_events ORDER BY received_at DESC LIMIT 1'
    ).first();
    if (!last) return; // مفيش أحداث خالص لسه — طبيعي وقت أول تشغيل
    const gapHours = (Date.now() - Date.parse(last.received_at)) / 3600000;
    if (gapHours >= thresholdHours) {
      await writeLog(env.DB, {
        tool: TOOL_NAME, type: 'status_event',
        notes: `🔴 مفيش حدث ويبهوك من بوسطة منذ ${gapHours.toFixed(1)} ساعة (الحد ${thresholdHours} ساعة)`,
        extra: { result: 'warning', silence: true, gapHours, lastEventAt: last.received_at },
      }).catch(() => {});
    }
  } catch (e) {
    // الجدول ممكن يكون لسه ما اتعملش (أول تشغيل قبل أول حدث) — تجاهل
  }
}

// ══════════════════════════════════════════════════════════════
// §HANDLER
// ══════════════════════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    // 1. OPTIONS preflight — ALWAYS first
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: getCORS(request) });

    const url = new URL(request.url);

    // 2. WEBHOOK branch — BEFORE the WORKER_SECRET gate (webhook-receivers.md §2).
    //    🔴 لو اتعكس الترتيب، كل حدث هيترفض 401 والمشكلة هتبان كأن بوسطة
    //    مش بتبعت (§6 من البريف).
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env, ctx);
    }

    // 3. WORKER_SECRET gate — كل حاجة تانية (الشاشة + endpoints التشغيل)
    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`)
      return json({ ok: false, error: 'Unauthorized' }, 401, request);

    const action = url.searchParams.get('action') || '';

    try {

      // ─── §AUTH — من ecommoda-worker-builder/references/auth-endpoints.md ──
      const AUTH_APPS = new Set([TOOL_NAME]);
      function resolveAuthTool(appId) { return AUTH_APPS.has(appId) ? appId : TOOL_NAME; }

      if (action === 'check_employee') {
        const username = url.searchParams.get('username');
        if (!username) return json({ ok: false, error: 'username مطلوب' }, 400, request);
        const result = await checkEmployee(env.DB, username);
        return json({ ok: true, ...result }, 200, request);
      }

      if (action === 'register_pin') {
        if (request.method !== 'POST') return json({ error: 'POST required' }, 405, request);
        const { username, pin } = await request.json().catch(() => ({}));
        if (!username || !pin) return json({ ok: false, error: 'username و pin مطلوبان' }, 400, request);
        await registerPin(env.DB, username, pin);
        return json({ ok: true }, 200, request);
      }

      if (action === 'verify_employee') {
        if (request.method !== 'POST') return json({ error: 'POST required' }, 405, request);
        const { username, pin, appId } = await request.json().catch(() => ({}));
        if (!username || !pin) return json({ ok: false, error: 'username و pin مطلوبان' }, 400, request);

        const displayName = await verifyEmployee(env.DB, username, pin);
        if (!displayName) return json({ ok: false, error: 'PIN خطأ أو المستخدم غير موجود' }, 401, request);

        let logged = true;
        try {
          await writeLog(env.DB, {
            tool: resolveAuthTool(appId), type: 'login', employee: username,
            notes: `دخول: ${displayName}`,
          });
        } catch (e) { logged = false; }
        return json({ ok: true, displayName, logged }, 200, request);
      }

      if (action === 'log_logout') {
        const username = url.searchParams.get('username');
        const appId    = url.searchParams.get('appId');
        let logged = true;
        if (username) {
          try {
            await writeLog(env.DB, {
              tool: resolveAuthTool(appId), type: 'logout', employee: username,
              notes: `خروج: ${username.replace(/_/g, ' ')}`,
            });
          } catch (e) { logged = false; }
        }
        return json({ ok: true, logged }, 200, request);
      }

      if (action === 'get_employees') {
        const { results } = await env.DB.prepare(
          'SELECT username, display_name FROM employees WHERE is_active = 1 ORDER BY display_name'
        ).all();
        return json({ ok: true, employees: results }, 200, request);
      }
      // ────────────────────────────────────────────────────────────────

      // ─── §SCREEN — شاشة الأحداث (§6/§7 من البريف) ───────────────────
      if (action === 'list_events') {
        const orderParam    = (url.searchParams.get('order') || '').trim();
        const trackingParam = (url.searchParams.get('tracking') || '').trim();
        const dateFrom       = url.searchParams.get('dateFrom') || null;
        const dateTo          = url.searchParams.get('dateTo') || null;
        const limitRaw  = parseInt(url.searchParams.get('limit')  || '100', 10);
        const offsetRaw = parseInt(url.searchParams.get('offset') || '0',   10);
        const limit  = Number.isFinite(limitRaw)  ? Math.min(Math.max(limitRaw, 1), 200) : 100;
        const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

        let sql = 'SELECT * FROM bosta_webhook_events WHERE 1=1';
        const b = [];
        if (orderParam) {
          const withHash = orderParam.startsWith('#') ? orderParam : '#' + orderParam;
          sql += ' AND (order_number = ? OR business_reference = ?)';
          b.push(orderParam.replace(/^#/, ''), withHash);
        }
        if (trackingParam) { sql += ' AND tracking_number = ?'; b.push(trackingParam); }
        if (dateFrom)        { sql += ' AND substr(received_at, 1, 10) >= ?'; b.push(dateFrom); }
        if (dateTo)          { sql += ' AND substr(received_at, 1, 10) <= ?'; b.push(dateTo); }
        sql += ' ORDER BY received_at DESC LIMIT ? OFFSET ?';

        // 🔴 ممنوع ترجيع [] لما الجدول مش موجود — ده بيخلّي "D1 مكسورة" تبان
        //    "مفيش أحداث"، وهو اللي ضيّع يوم كامل في 20/21-09-2026
        //    (ecommoda-constants §7.0 — صفر صفوف مش دليل).
        try {
          const { results } = await env.DB.prepare(sql).bind(...b, limit, offset).all();
          return json({ ok: true, events: results }, 200, request);
        } catch (e) {
          if (/no such table/i.test(e.message)) {
            return json({
              ok: false, errorCode: 'events_table_missing',
              error: 'جدول bosta_webhook_events مش موجود في D1 — أي حدث جاي من بوسطة بيضيع. شغّل الـ CREATE TABLE من CLAUDE.md في D1 Console.',
            }, 503, request);
          }
          throw e;
        }
      }

      if (action === 'diag') {
        const checks = [];
        checks.push({ ok: !!env.WORKER_SECRET, label: 'WORKER_SECRET', detail: env.WORKER_SECRET ? 'موجود' : '❌ غايب' });
        checks.push({ ok: !!env.BOSTA_WEBHOOK_HEADER_NAME, label: 'BOSTA_WEBHOOK_HEADER_NAME', detail: env.BOSTA_WEBHOOK_HEADER_NAME ? `موجود (${String(env.BOSTA_WEBHOOK_HEADER_NAME).length} حرف)` : '❌ غايب' });
        checks.push({ ok: !!env.BOSTA_WEBHOOK_HEADER_VALUE, label: 'BOSTA_WEBHOOK_HEADER_VALUE', detail: env.BOSTA_WEBHOOK_HEADER_VALUE ? 'موجود' : '❌ غايب' });
        checks.push({ ok: !!env.SHOP_DOMAIN, label: 'SHOP_DOMAIN', detail: env.SHOP_DOMAIN || '❌ غايب' });
        checks.push({ ok: !!env.CLIENT_ID && !!env.CLIENT_SECRET, label: 'Shopify credentials', detail: (env.CLIENT_ID && env.CLIENT_SECRET) ? 'موجودة' : '❌ ناقصة' });
        checks.push({ ok: true, label: 'WRITE_METAFIELDS', detail: String(env.WRITE_METAFIELDS ?? 'false') });
        checks.push({ ok: true, label: 'SILENCE_THRESHOLD_HOURS', detail: String(env.SILENCE_THRESHOLD_HOURS ?? DEFAULT_SILENCE_THRESHOLD_HOURS) });

        let lastEvent = null, count24h = 0, dup24h = 0, matchFailed24h = 0;
        let unauthorized24h = 0, storeFailed24h = 0;
        let eventsTableOk = false, logsTableOk = false;
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

        // 🔴 الاستعلامين منفصلين عن قصد: عدّادات `logs` لازم تفضل شغّالة حتى
        //    لو جدول الأحداث نفسه مكسور — العكس هو اللي خفى سبب عطل
        //    20/21-09-2026 (كل العدّادات كانت جوه try واحد ووقفت مع أول فشل).
        try {
          const countType = async (type) => (await env.DB.prepare(
            'SELECT COUNT(*) as n FROM logs WHERE tool = ? AND type = ? AND timestamp >= ?'
          ).bind(TOOL_NAME, type, since).first())?.n ?? 0;
          dup24h          = await countType('duplicate_skipped');
          matchFailed24h  = await countType('match_failed');
          unauthorized24h = await countType('unauthorized');
          storeFailed24h  = (await env.DB.prepare(
            'SELECT COUNT(*) as n FROM logs WHERE tool = ? AND timestamp >= ? AND notes LIKE ?'
          ).bind(TOOL_NAME, since, STORE_FAIL_NOTE + '%').first())?.n ?? 0;
          logsTableOk = true;
          checks.push({ ok: true, label: 'D1 · جدول logs', detail: 'متصل' });
        } catch (e) {
          checks.push({ ok: false, label: 'D1 · جدول logs', detail: 'FAILED: ' + e.message });
        }

        try {
          lastEvent = await env.DB.prepare(
            'SELECT received_at, business_reference, state, write_status FROM bosta_webhook_events ORDER BY received_at DESC LIMIT 1'
          ).first();
          count24h = (await env.DB.prepare(
            'SELECT COUNT(*) as n FROM bosta_webhook_events WHERE received_at >= ?'
          ).bind(since).first())?.n ?? 0;
          eventsTableOk = true;
          checks.push({ ok: true, label: 'D1 · جدول bosta_webhook_events', detail: 'موجود' });
        } catch (e) {
          checks.push({ ok: false, label: 'D1 · جدول bosta_webhook_events', detail: 'FAILED: ' + e.message + ' — أي حدث جاي من بوسطة بيضيع' });
        }

        // §5 — حالتان حمراوان كانوا بيعدّوا من غير ما حد يشوفهم
        checks.push({
          ok: unauthorized24h === 0, label: 'أحداث مرفوضة (401) آخر 24 ساعة',
          detail: unauthorized24h === 0 ? '0' : `${unauthorized24h} — بوسطة بتبعت والتحقق بيرفض: راجع BOSTA_WEBHOOK_HEADER_NAME/VALUE`,
        });
        checks.push({
          ok: storeFailed24h === 0, label: 'أحداث فشل تخزينها في D1 آخر 24 ساعة',
          detail: storeFailed24h === 0 ? '0' : `${storeFailed24h} — الحدث وصل واترد عليه 200 وضاع: راجع جدول bosta_webhook_events`,
        });

        let shopifyOk = null;
        try {
          assertEnv(env, 'shopify');
          const token = await getAccessToken(env);
          const data  = await shopifyGQL(env, token, `{ currentAppInstallation { accessScopes { handle } } }`, {}, 'accessScopes');
          shopifyOk = data.data?.currentAppInstallation?.accessScopes?.map(s => s.handle) ?? [];
          checks.push({ ok: true, label: 'Shopify OAuth', detail: 'نجح' });
        } catch (e) {
          checks.push({ ok: false, label: 'Shopify OAuth', detail: 'FAILED: ' + e.message });
        }

        return json({
          ok: true, checks, workerVersion: WORKER_VERSION,
          lastEvent, count24h, dup24h, matchFailed24h, accessScopes: shopifyOk,
          unauthorized24h, storeFailed24h, eventsTableOk, logsTableOk,
          silenceThresholdHours: Number(env.SILENCE_THRESHOLD_HOURS) || DEFAULT_SILENCE_THRESHOLD_HOURS,
        }, 200, request);
      }

      if (action === 'get_config') {
        return json({
          ok: true, version: WORKER_VERSION,
          writeMetafields: String(env.WRITE_METAFIELDS).toLowerCase() === 'true',
        }, 200, request);
      }
      // ────────────────────────────────────────────────────────────────

      // ─── §LOG-ENDPOINTS ───────────────────────────────────────────
      if (action === 'get_logs') {
        const p         = logParamsFrom(url, TOOL_NAME);
        const limitRaw  = parseInt(url.searchParams.get('limit')  || '100', 10);
        const offsetRaw = parseInt(url.searchParams.get('offset') || '0',   10);
        const limit  = Number.isFinite(limitRaw)  ? Math.min(Math.max(limitRaw, 1), 100) : 100;
        const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
        const sortBy  = url.searchParams.get('sortBy');
        const sortDir = url.searchParams.get('sortDir');
        const entries = await getLogs(env.DB, { ...p, limit, offset, sortBy, sortDir });
        return json({ ok: true, entries }, 200, request);
      }

      if (action === 'get_logs_count') {
        const total = await getLogsCount(env.DB, logParamsFrom(url, TOOL_NAME));
        return json({ ok: true, total }, 200, request);
      }

      if (action === 'get_logs_export') {
        const p = logParamsFrom(url, TOOL_NAME);
        const [entries, total] = await Promise.all([
          getLogsExport(env.DB, p),
          getLogsCount(env.DB, p),
        ]);
        return json({ ok: true, entries, cap: LOG_EXPORT_MAX, total, truncated: total > LOG_EXPORT_MAX }, 200, request);
      }
      // ────────────────────────────────────────────────────────────────

      return json({ ok: false, error: 'Unknown action' }, 404, request);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: err.message }, 500, request);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkSilence(env));
  },
};
