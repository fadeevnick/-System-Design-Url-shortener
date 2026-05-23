---
title: Double-Entry Ledger
tags: [payments, finance, accounting, consistency, immutability]
related: [idempotency-key, outbox, saga, event-driven-architecture]
---

# Double-Entry Ledger

## What

Принцип бухгалтерского учёта (существует с XV века): каждая транзакция = минимум две записи — **дебет** одного счёта и **кредит** другого на одинаковую сумму. Сумма всех дебетов всегда равна сумме всех кредитов. Нарушение баланса = ошибка в системе.

В программных системах: ledger — append-only таблица записей. Текущий баланс — агрегат (`SUM`) всех записей по счёту. Записи никогда не изменяются и не удаляются.

## Why

- **Audit trail**: история каждого движения денег хранится вечно — требование регуляторов.
- **Self-consistency**: `SUM(debits) = SUM(credits)` по всем счетам в любой момент — нарушение = ошибка немедленно обнаруживается.
- **No negative balance by construction**: нельзя дебетовать больше, чем есть на счёте, без явной проверки.
- **Reconciliation-friendly**: сравнение внутреннего ledger с внешним (PSP) — по суммам записей.

## When to use

- Любая финансовая система с реальными деньгами (платежи, переводы, кошельки).
- Виртуальная валюта / баллы лояльности / кредиты в системе.
- Инвентарный учёт (резервирование единиц товара).

**Когда НЕ использовать:**

- Простые счётчики без финансовой семантики — overhead избыточен.

## How

### Базовая структура

```sql
CREATE TABLE accounts (
    id          UUID PRIMARY KEY,
    owner_id    UUID NOT NULL,          -- user / merchant / system
    type        TEXT NOT NULL,          -- 'user_wallet', 'merchant', 'revenue', 'escrow'
    currency    CHAR(3) NOT NULL,       -- ISO 4217: 'USD', 'EUR', 'RUB'
    created_at  TIMESTAMPTZ
);

CREATE TABLE ledger_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID NOT NULL,      -- группирует пары debit+credit
    account_id      UUID REFERENCES accounts,
    amount          BIGINT NOT NULL,    -- в минимальных единицах (cents, kopecks)
    direction       TEXT CHECK (direction IN ('debit', 'credit')),
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    -- NO UPDATE, NO DELETE — append-only
    idempotency_key TEXT UNIQUE         -- предотвращает двойную запись
);

CREATE INDEX idx_ledger_account ON ledger_entries(account_id, created_at);
CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
```

**Никогда не хранить баланс напрямую** (кроме кэша). Баланс = `SUM(credit) - SUM(debit)` по account_id.

### Пример: платёж покупателя продавцу ($10)

```sql
-- Транзакция: buyer платит seller $10, fee $0.30 идёт платформе
-- Все три записи в одной DB транзакции (ACID)

BEGIN;
  INSERT INTO ledger_entries VALUES
    -- Buyer wallet списание
    (gen_uuid(), 'txn_abc', 'buyer_wallet_id',    1000, 'debit',  'purchase #42'),
    (gen_uuid(), 'txn_abc', 'platform_escrow_id', 1000, 'credit', 'purchase #42'),

    -- Когда заказ выполнен: из escrow → seller
    (gen_uuid(), 'txn_def', 'platform_escrow_id',  970, 'debit',  'payout order #42'),
    (gen_uuid(), 'txn_def', 'seller_wallet_id',    970, 'credit', 'payout order #42'),

    -- Fee остаётся у платформы
    (gen_uuid(), 'txn_def', 'platform_escrow_id',   30, 'debit',  'fee order #42'),
    (gen_uuid(), 'txn_def', 'platform_revenue_id',  30, 'credit', 'fee order #42');
COMMIT;

-- Проверка баланса: SUM(credit) - SUM(debit) = 0 по всем счетам
-- $10 = $9.70 (seller) + $0.30 (platform fee) ✓
```

### Balance Computation

```sql
-- Текущий баланс счёта:
SELECT
    SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) AS balance
FROM ledger_entries
WHERE account_id = 'buyer_wallet_id';

-- Проблема: медленно при миллионах записей
-- Решение: balance snapshot + incremental

CREATE TABLE balance_snapshots (
    account_id    UUID PRIMARY KEY,
    balance       BIGINT NOT NULL,
    as_of_entry   UUID,           -- last ledger_entry_id included
    computed_at   TIMESTAMPTZ
);

-- Запрос с snapshot:
SELECT s.balance + COALESCE(
    SUM(CASE WHEN e.direction = 'credit' THEN e.amount ELSE -e.amount END), 0
)
FROM balance_snapshots s
LEFT JOIN ledger_entries e
    ON e.account_id = s.account_id
    AND e.id > s.as_of_entry   -- только новые записи
WHERE s.account_id = 'buyer_wallet_id'
GROUP BY s.balance;
```

### Exactly-Once via Idempotency Key

```
Проблема: сеть упала после INSERT, клиент ретраит.
Без защиты — двойная запись (double charge).

Решение: idempotency_key UNIQUE constraint в ledger_entries.
    key = SHA256(transaction_id + account_id + direction)

Повторный INSERT → duplicate key error → вернуть существующую запись.
```

### Reconciliation

```
Ежедневная сверка с PSP (Stripe):

1. Скачать CSV от Stripe: {stripe_charge_id, amount, status, created_at}
2. Сравнить с internal ledger_entries WHERE source='stripe':
    - Совпали → OK
    - В Stripe есть, в ledger нет → missing entry (система не записала) → alert + manual fix
    - В ledger есть, в Stripe нет → ghost entry → alert + investigation
    - Суммы не совпадают → amount mismatch → alert

3. Результат сверки → reconciliation_report таблица
4. Все несоответствия → PagerDuty + финансовая команда
```

### Never Store in BIGINT без осторожности

```
Сумма в BIGINT:
    $10.00 → 1000 (cents)
    ₽999.99 → 99999 (kopecks)

НИКОГДА FLOAT/DOUBLE для денег:
    0.1 + 0.2 = 0.30000000000000004  ← катастрофа

Используй: BIGINT (cents) или NUMERIC(19,4) в Postgres.
Java: BigDecimal. Python: Decimal. Go: shopspring/decimal.
```

## Diagram

```
Payment $10: buyer → platform escrow → seller (minus fee)

Accounts:
  [buyer_wallet]    [platform_escrow]    [seller_wallet]    [platform_revenue]

Step 1: buyer pays:
  debit  buyer_wallet    $10.00
  credit platform_escrow $10.00

Step 2: order fulfilled:
  debit  platform_escrow  $9.70  →  credit seller_wallet    $9.70
  debit  platform_escrow  $0.30  →  credit platform_revenue $0.30

Invariant: SUM(all debits) = SUM(all credits) = $10.00 ✓
```

## Pitfalls

- **Хранить баланс как мутабельное поле** — потеря консистентности при concurrent updates. Только append-only ledger.
- **Float для денег** — неизбежные ошибки округления. Только integer cents или NUMERIC.
- **Нет idempotency key** — retry = double charge.
- **Удаление/обновление записей** — нельзя. Ошибочная запись компенсируется **reverse entry** (другая запись с противоположным знаком).
- **Не проверять invariant** — баланс всех счетов должен быть 0 (money не создаётся из воздуха). Запускай assertion ежедневно.

## Variations

- **Event Sourcing Ledger** — ledger_entries IS the event log. Текущее состояние = replay всех событий. Идеально для аудита, сложнее для быстрого balance query (нужен snapshot).
- **Partitioned Ledger** — шардирование по account_id или по дате (горячие данные в одном шарде, историческое в cold storage).
- **Multi-currency Ledger** — каждая запись имеет currency + exchange_rate_at_time; конвертация всегда записывается явно.

## Used in case studies

- [[012-payment-system]] — ledger для internal wallet и reconciliation с PSP

## References

- Martin Kleppmann — *Designing Data-Intensive Applications*, Chapter 7 (Transactions)
- Stripe Engineering Blog — Double-Entry Accounting
- [Airbnb Engineering — Scaling Airbnb's Payment Architecture](https://medium.com/airbnb-engineering)
- PCI DSS v4.0 — Payment Card Industry Data Security Standard
