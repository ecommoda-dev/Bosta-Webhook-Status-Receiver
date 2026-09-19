# Bosta-Webhook-Status-Receiver

مستقبل أحداث الويبهوك الخاصة بتغيّر حالة الشحنة من بوسطة، لحساب EcomModa.
يسجّل كل حدث خام في D1 ويكتب آخر حالة على أربع ميتافيلدات (S1/S2) في الأوردر
المطابق على شوبيفاي.

التفاصيل الكاملة (الإعداد، الأسرار، الفخاخ، البنود المفتوحة) في
[`CLAUDE.md`](./CLAUDE.md).

بُني حسب `ecommoda-worker-builder` و`bosta-api-helper` و
`ecommoda-tool-migration-playbook` (السكيلز الخاصة بستاك EcomModa).
