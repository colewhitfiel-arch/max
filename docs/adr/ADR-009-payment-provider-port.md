# ADR-009. Платежи за портом `PaymentProvider`

**Статус:** accepted, 2026-09-21 (провайдер — уточнить у продукта)

## Контекст
Родитель оплачивает кружки в приложении. Продукт не зафиксировал провайдера; у MAX могут быть встроенные платежи. Оплата — необратимая операция с внешними вебхуками.

## Решение
- Интерфейс `PaymentProvider { create({ amount, description, returnUrl, metadata }) → { id, confirmationUrl }, parseWebhook(raw, headers) → event, getStatus(id) }`.
- Адаптер по умолчанию — ЮKassa; `FakePaymentProvider` для dev/test с ручным успехом/провалом.
- `Payment` фиксирует цену на момент создания (`amountKopecks = Club.priceKopecks × periodsCount`), `idempotencyKey` от клиента, `providerPaymentId` уникален.
- Успех приходит только вебхуком → `Payment(SUCCEEDED)` → `PaidPeriod` → событие `payment.succeeded`. Фронт лишь опрашивает статус.
- Оплаченный период считается по `PaidPeriod`, «следующая оплата» = `max(periodEnd) + 1`.

## Последствия
- Замена провайдера (в т.ч. на платежи MAX) — только адаптер и вебхук-роут.
- Возвраты и рассрочка — вне MVP; модель (`REFUNDED`) их допускает.
