# Wallet & Double-Entry Ledger — Hướng Dẫn Thiết Kế (Reusable Guide)

> **Mục đích:** Tài liệu tái sử dụng để thiết kế hệ thống ví (wallet) theo mô hình
> **double-entry ledger** đạt độ chính xác cấp tổ chức tài chính. Bao gồm: nguyên lý,
> schema, cách lấy số dư nhanh & luôn đúng, chống race/overspend, chống lệch cache,
> checkpoint/snapshot cho account triệu giao dịch, hạ tầng AWS cụ thể, và checklist.
>
> **Bối cảnh áp dụng:** MegaWin Operator Wallet, nhưng viết ở dạng generic để dùng cho
> mọi hệ thống fintech/iGaming/e-wallet sau này.
>
> **Đơn vị tiền:** luôn dùng **integer** (VND — đơn vị nhỏ nhất), không bao giờ float.

---

## 0. TL;DR — Đọc 60 giây

1. **Ledger là Single Source of Truth.** Balance là *derived state* (`SUM(entries)`), không phải *stored state*.
2. **Double-entry:** mỗi giao dịch ≥ 2 dòng cân nhau, `Σ debit = Σ credit`. Invariant toàn hệ thống: `Σ(all amounts) = 0`.
3. **Append-only:** không UPDATE/DELETE entry. Sửa sai = ghi *reversing entry*.
4. **Đọc số dư O(1)** bằng `balance_after` trên mỗi entry (running balance), KHÔNG `SUM` toàn lịch sử.
5. **Chống overspend** bằng conditional write (`UPDATE ... WHERE balance >= x`) + `CHECK (balance >= 0)` + optimistic `version` / `FOR UPDATE`. DB tự từ chối, không phụ thuộc `SUM`.
6. **Account triệu giao dịch:** dùng **snapshot/checkpoint** — chỉ `SUM` phần *sau* mốc gần nhất. Archive entry cũ sang cold storage.
7. **Reconciliation nền định kỳ:** so cache vs ledger; lệch → rebuild từ ledger (SSOT) + alert. Không nằm trên hot path.
8. **Hạ tầng AWS:** PostgreSQL (Aurora / RDS) cho ledger ACID; ElastiCache Redis cho snapshot đọc nhanh; SQS/EventBridge cho recording bất đồng bộ; các context khác eventual-consistency.

---

## 1. Nguyên lý nền tảng

### 1.1 Balance là *derived*, không phải *stored*

Trong double-entry ledger, số dư **không** là con số ghi/sửa trực tiếp. Nó là kết quả tính từ tổng các bút toán:

```
balance(account) = Σ(amount của mọi entry thuộc account đó)
```

Đây là ý nghĩa của "Single Source of Truth": **bảng entries là chân lý duy nhất.** Không tồn tại ô `balance` nào có thể "sai lệch" với ledger theo định nghĩa — vì balance *được sinh ra từ* ledger. Nếu có ô balance, nó chỉ là **cache** và *phải* bằng `SUM(ledger)`.

### 1.2 Double-entry (bút toán kép)

Mỗi giao dịch tài chính = **ít nhất 2 entries cân nhau** (tổng = 0). Ví dụ nạp 100,000:

```
Transaction tx=uuidv7 (deposit 100,000)
  ├─ CREDIT  player:U123:cash        +100,000
  └─ DEBIT   psp:vnpay:clearing      -100,000
                                     ──────────
                                       tổng = 0 ✓
```

**Convention dấu (quan trọng — chốt 1 lần, không đổi):**
- `amount > 0` = credit (tiền vào account).
- `amount < 0` = debit (tiền ra account).
- Mỗi transaction: `Σ amount = 0`.
- Invariant toàn hệ thống mọi thời điểm: `Σ(all entries.amount) = 0`. Không tiền nào "bốc hơi" hay "sinh ra". Nếu tổng ≠ 0 → chắc chắn có bug, phát hiện ngay.

### 1.3 Balance-first vs Ledger-first — đảo vai trò, không chỉ "thêm lịch sử"

Điểm nhiều người hiểu lầm: cả hai đều có thể có 1 ô lưu số dư. Khác biệt nằm ở **quan hệ chân lý**:

| | Balance-first (truyền thống) | Ledger-first |
|---|---|---|
| Đâu là sự thật? | Ô `balance` | Tổng các entries |
| Ô balance là gì? | Bản gốc, **không tái tạo được** | **Cache, luôn tái tạo được** |
| History dùng làm gì? | Log tham khảo, không ràng buộc | **Định nghĩa ra balance** |
| Balance lệch thì sao? | **Mất dữ liệu, không biết đúng là bao nhiêu** | Rebuild từ ledger, luôn cứu được |
| Kiểm toán "balance đúng?" | Không chứng minh được | `balance == SUM(entries)` — chứng minh được |
| Sửa giao dịch sai | `UPDATE` đè (mất dấu vết) | Ghi reversing entry (giữ dấu vết) |

**Bản chất:** ledger-first *hạ cấp* ô balance từ "chân lý" xuống "cache", và *nâng* lịch sử giao dịch từ "log" lên "nguồn chân lý ràng buộc". Chính sự đảo vai trò đó — chứ không phải việc có thêm một bảng — đảm bảo số dư *luôn chính xác và luôn chứng minh được*.

Ba thứ mà balance-first **không bao giờ có**:
1. **Provability** — luôn chứng minh balance đúng bằng `SUM(entries)`.
2. **Recoverability** — cache hỏng → rebuild 100% từ ledger.
3. **Conservation** — mỗi giao dịch 2 vế cân nhau → `Σ = 0`; lệch là biết ngay.

---

## 2. Schema ledger (PostgreSQL)

### 2.1 Bảng cốt lõi

```sql
-- ── Danh mục tài khoản (chart of accounts) ──────────────────────────────
CREATE TABLE accounts (
  id            BIGSERIAL PRIMARY KEY,
  -- Định danh có cấu trúc, ví dụ: 'player:U123:cash', 'house:stake'
  code          TEXT        NOT NULL UNIQUE,
  -- 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  -- Ví player là LIABILITY của operator (nợ player).
  kind          TEXT        NOT NULL,
  currency      CHAR(3)     NOT NULL DEFAULT 'VND',
  -- true = cho phép balance âm (chỉ house/clearing nội bộ). Ví player = false.
  allow_negative BOOLEAN    NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Transaction (nhóm các entry cân nhau) ───────────────────────────────
CREATE TABLE ledger_transactions (
  -- UUIDv7: sortable theo thời gian + dùng làm idempotency key.
  id            UUID        PRIMARY KEY,
  -- Loại nghiệp vụ: 'deposit' | 'withdrawal' | 'bet' | 'payout' | 'reversal' | ...
  type          TEXT        NOT NULL,
  -- Idempotency: cùng external_ref chỉ ghi 1 lần (webhook PSP, callback core).
  external_ref  TEXT        UNIQUE,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Entry (dòng bút toán, APPEND-ONLY) ──────────────────────────────────
CREATE TABLE ledger_entries (
  -- seq toàn cục, tăng đơn điệu. Dùng BIGSERIAL hoặc sequence riêng.
  seq            BIGSERIAL   PRIMARY KEY,
  transaction_id UUID        NOT NULL REFERENCES ledger_transactions(id),
  account_id     BIGINT      NOT NULL REFERENCES accounts(id),
  -- amount > 0 credit, < 0 debit. Integer, đơn vị VND nhỏ nhất.
  amount         BIGINT      NOT NULL,
  -- Running balance của account NGAY SAU khi áp dụng entry này.
  -- Tính TRONG cùng transaction ghi entry → đọc balance = đọc dòng cuối, O(1).
  balance_after  BIGINT      NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index sống còn: lấy entry mới nhất của 1 account là O(1).
CREATE INDEX idx_entries_account_seq ON ledger_entries (account_id, seq DESC);

-- Bảo toàn: entry đã ghi không được sửa/xoá (enforce ở DB, xem 2.3).
```

### 2.2 `balance_after` — running balance trên mỗi entry

Đây là kỹ thuật ngân hàng / TigerBeetle dùng. Mỗi entry lưu luôn số dư sau khi áp dụng nó:

```
ledger_entries (account = player:U123:cash)
┌─────┬─────────┬──────────────┐
│ seq │ amount  │ balance_after│
├─────┼─────────┼──────────────┤
│ 998 │ +10,000 │      45,000  │
│ 999 │  -3,000 │      42,000  │
│1000 │  +5,000 │      47,000  │ ← đọc dòng này = balance hiện tại (O(1))
└─────┴─────────┴──────────────┘
```

Invariant liên hoàn (chuỗi móc xích, verify không cần SUM toàn bộ):

```
balance_after(n) == balance_after(n-1) + amount(n)
```

Muốn kiểm tra tính đúng đắn, chỉ cần verify vài mắt xích gần nhất khớp công thức — không cộng lại triệu dòng.

### 2.3 Enforce append-only ở tầng DB

Đừng chỉ tin application code. Chặn UPDATE/DELETE bằng trigger (hoặc quyền GRANT):

```sql
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only (seq=%)', OLD.seq;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entries_no_update
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
```

Cách chặt hơn nữa (production): tạo role riêng chỉ có `INSERT`/`SELECT` trên `ledger_entries`, không cấp `UPDATE`/`DELETE` cho bất kỳ app role nào.

### 2.4 Sửa sai = reversing entry, không UPDATE

```
-- SAI: sửa entry #1001
-- ĐÚNG: ghi transaction mới bù trừ, tham chiếu bản gốc
Transaction tx2 (type='reversal', metadata.reverses='tx1')
  ├─ DEBIT   player:U123:cash        -100,000
  └─ CREDIT  psp:vnpay:clearing      +100,000
```

Giữ audit trail đầy đủ + balance luôn tái tạo được.

---

## 3. Đọc số dư O(1) & chống overspend

### 3.1 Đọc số dư — O(1), không SUM

```sql
SELECT balance_after
FROM ledger_entries
WHERE account_id = :account
ORDER BY seq DESC
LIMIT 1;   -- O(1) nhờ index (account_id, seq DESC). NULL/0 nếu chưa có entry.
```

Với đọc siêu nóng (hiển thị ví, list), cache thêm vào Redis (xem §6). Nhưng nguồn chân lý đọc-nhanh trong DB vẫn là `balance_after` của entry cuối — *nằm trong ledger*, không phải bảng tách rời có thể trôi.

### 3.2 Ghi giao dịch an toàn — tất cả trong 1 transaction

Guard đủ tiền + serialize concurrency + ghi entry, atomic:

```sql
BEGIN;
  -- (1) Khóa & lấy balance_after mới nhất của account. FOR UPDATE serialize
  --     mọi giao dịch cùng account → không race, không overspend.
  SELECT seq, balance_after
    INTO prev_seq, prev_bal
  FROM ledger_entries
  WHERE account_id = :player
  ORDER BY seq DESC
  LIMIT 1
  FOR UPDATE;

  -- (2) Guard đủ tiền NGAY tại đây, dựa trên balance_after — KHÔNG SUM.
  --     Nếu (prev_bal - 50000) < 0 và account không allow_negative → ROLLBACK.
  IF prev_bal - 50000 < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  -- (3) Ghi 2 vế cân nhau, mỗi vế kèm balance_after tính ngay.
  INSERT INTO ledger_transactions (id, type, external_ref)
  VALUES (:tx, 'bet', :external_ref);   -- UNIQUE external_ref = idempotency

  INSERT INTO ledger_entries (transaction_id, account_id, amount, balance_after)
  VALUES
    (:tx, :player,      -50000, prev_bal - 50000),
    (:tx, :house_stake, +50000, /* balance_after của house */ ...);
COMMIT;
```

**Nguyên tắc chống race:**
- `FOR UPDATE` trên entry cuối của account → các giao dịch cùng account chạy tuần tự. Khác account vẫn song song → throughput cao.
- Guard nằm *trong* transaction, dựa trên giá trị vừa khóa → không có khe hở TOCTOU (time-of-check to time-of-use).

### 3.3 Nếu dùng bảng balance cache riêng — conditional write

Khi cần bảng `account_balances` tách biệt (đọc cực nóng), **đừng** đọc ra app rồi kiểm tra rồi trừ. Kiểm tra và trừ trong MỘT câu atomic để DB tự chặn:

```sql
UPDATE account_balances
   SET balance = balance - 50000,
       version = version + 1
 WHERE account_id = :player
   AND balance >= 50000;    -- ← điều kiện nằm TRONG câu UPDATE
-- rowsAffected = 1 → đủ tiền, đã trừ. rowsAffected = 0 → từ chối, không trừ gì.
```

Dù 1000 request đồng thời, DB serialize `UPDATE` trên cùng row → không thể chi âm. Thêm ràng buộc cứng để cache **không bao giờ** âm kể cả khi có bug:

```sql
ALTER TABLE account_balances
  ADD CONSTRAINT balance_non_negative CHECK (balance >= 0);
```

### 3.4 Optimistic concurrency (version) — khi buộc đọc–tính–ghi ở app

```sql
-- đọc: balance=50000, version=42
UPDATE account_balances
   SET balance = :new_balance, version = version + 1
 WHERE account_id = :player AND version = 42;
-- rowsAffected = 0 → có người khác vừa đổi → RETRY từ đầu (đọc lại version mới).
```

Chặn tình huống "hai giao dịch cùng đọc 50k, cùng trừ, một cái ghi đè cái kia" — nguyên nhân trực tiếp gây cache lệch ledger.

### 3.5 Idempotency — retry không nhân đôi tiền

- `ledger_transactions.external_ref UNIQUE` (hoặc `id` UUIDv7 từ upstream). Insert trùng → DB reject → không ghi 2 lần.
- **Withdrawal/payout: idempotency key theo TỪNG attempt.** Retry sang rail khác phải dùng key MỚI để tránh double-payout âm thầm. Nhưng cùng một attempt logic phải dùng cùng key.
- Test kỹ replay mọi external call (webhook PSP gửi lại, callback core retry).

---

## 4. Chống lệch cache & Reconciliation

### 4.1 Nếu làm đúng, cache KHÔNG THỂ lệch

Tình huống "cache 50k nhưng ledger 47k" **chỉ xảy ra khi vi phạm atomicity**. Nếu ghi ledger và cập nhật cache trong **cùng một DB transaction**, chúng không bao giờ lệch. Cache lệch chỉ đến từ:
- Cập nhật cache **ngoài** transaction ghi ledger (2 lệnh riêng, cái sau fail).
- Có đường ghi ledger **không đi qua** code cập nhật cache (import tay, job khác, migration).
- `SET balance = :computed_value` (ghi đè giá trị tính sẵn) thay vì `SET balance = balance + :delta` → mất update của giao dịch song song.

> **Nguyên tắc vàng:** Cache chỉ được sửa bằng **delta**, **trong cùng transaction** với ledger, và **KHÔNG có cửa hậu** nào ghi ledger mà bỏ qua cache. Tuân thủ điều này thì lệch bị loại từ gốc (~99% trường hợp).

### 4.2 Ba lớp phòng thủ (defense in depth)

**Lớp A — Prevention (đủ 99%):** mọi ghi ledger đều atomic + đi qua cache bằng delta → cache không đạt được trạng thái sai.

**Lớp B — Verify tại giao dịch nhạy cảm:** với giao dịch rủi ro cao (rút tiền, chuyển ra ngoài), verify cache khớp ledger *ngay trước khi ghi*, trong cùng transaction — nhưng chỉ cho **1 account** (rẻ, không phải toàn hệ thống):

```sql
BEGIN;
  SELECT balance FROM account_balances WHERE account_id = :player FOR UPDATE;      -- =50000
  -- Với balance_after: đọc entry cuối là đủ. Với SUM: xem §5 (chỉ SUM sau checkpoint).
  -- Lệch → ABORT, raise alert, KHÔNG trừ tiền. Khớp → tiến hành trừ.
COMMIT;
```

**Lớp C — Reconciliation nền (lưới an toàn cuối):** job định kỳ so cache vs ledger từng account. Lệch → **rebuild cache từ ledger** (ledger là SSOT) + alert để truy bug. Không nằm trên hot path.

### 4.3 Các phép reconcile bắt buộc

```sql
-- (1) Invariant toàn hệ thống: tổng mọi entry phải = 0.
SELECT SUM(amount) FROM ledger_entries;   -- kỳ vọng: 0. Khác 0 = ALERT nghiêm trọng.

-- (2) Cache khớp ledger (khi có bảng balance riêng, chưa dùng snapshot).
SELECT b.account_id, b.balance, SUM(e.amount) AS ledger_bal
FROM account_balances b
JOIN ledger_entries e ON e.account_id = b.account_id
GROUP BY b.account_id, b.balance
HAVING b.balance <> SUM(e.amount);        -- kỳ vọng: rỗng.

-- (3) Chuỗi balance_after liên hoàn (phát hiện entry ghi sai running balance).
SELECT e.seq
FROM ledger_entries e
JOIN LATERAL (
  SELECT balance_after AS prev_bal
  FROM ledger_entries p
  WHERE p.account_id = e.account_id AND p.seq < e.seq
  ORDER BY p.seq DESC LIMIT 1
) prev ON true
WHERE e.balance_after <> prev.prev_bal + e.amount;   -- kỳ vọng: rỗng.
```

### 4.4 Đối soát nhiều sổ (multi-ledger) — nơi hay sai nhất

Với hệ thống có tiền đi ra ngoài (PSP, nhà cái core), reconcile **3 nguồn**:

```
Ledger nội bộ (operator)  ↔  Sổ đối tác (core/nhà cái)  ↔  Sao kê PSP (bank statement)
```

Job chạy hằng ngày (hoặc theo batch settlement PSP). **Lệch 1 xu = báo động.** Đây là chuẩn kế toán tài chính: mọi con số phải khớp chéo, không "gần đúng".

---

## 5. Account triệu giao dịch — Snapshot / Checkpoint

### 5.1 Vấn đề

Account mở lâu năm có hàng triệu entries. `SUM(toàn bộ history)` để verify không còn rẻ. Nguyên tắc: **đừng bao giờ SUM từ đầu lịch sử — chỉ SUM từ một điểm mốc đã chốt.**

### 5.2 Ý tưởng: balance = snapshot + incremental

```
balance = snapshot_balance (tại mốc T) + SUM(entries SAU mốc T)
```

Bảng snapshot chốt số dư đã xác minh tại mốc, kèm con trỏ tới entry cuối của mốc:

```sql
CREATE TABLE balance_snapshots (
  account_id  BIGINT      NOT NULL,
  -- balance đã xác minh tại mốc này.
  balance     BIGINT      NOT NULL,
  -- entry cuối cùng được bao gồm trong snapshot. Verify chỉ SUM entries seq > last_seq.
  last_seq    BIGINT      NOT NULL,
  is_latest   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, last_seq)
);
```

Verify một account giờ chỉ SUM phần incremental (thường vài chục dòng):

```sql
SELECT s.balance + COALESCE(SUM(e.amount), 0)
FROM balance_snapshots s
LEFT JOIN ledger_entries e
  ON e.account_id = s.account_id AND e.seq > s.last_seq   -- ← chỉ phần sau mốc
WHERE s.account_id = :player AND s.is_latest = true;
```

→ Verify là **O(số entry sau mốc)**, không phụ thuộc tổng lịch sử.

### 5.3 So sánh các thiết kế

| Thiết kế | Đọc balance | Verify 1 account | Điểm yếu |
|---|---|---|---|
| `SUM(toàn bộ entries)` | O(N) — chậm dần | O(N) | Sập khi N lớn |
| Cache table riêng | O(1) | O(N) khi verify | Verify vẫn phải SUM hết |
| **Checkpoint/snapshot định kỳ** | O(1) qua cache | **O(entries sau mốc)** | Cần job tạo snapshot |
| **`balance_after` mỗi entry** | **O(1)** (entry cuối) | **O(1)** (check vài mắt xích) | Cần serialize ghi/account |

Hai dòng cuối cắt đứt sự phụ thuộc vào tổng lịch sử. **Kiến trúc đề xuất: kết hợp cả hai.**

### 5.4 Kiến trúc đề xuất (kết hợp)

1. **`balance_after` trên mỗi entry** → xương sống. Đọc O(1), guard O(1), verify liền kề O(1).
2. **Snapshot định kỳ** (mỗi ngày/tháng chốt 1 dòng) → dùng cho:
   - Báo cáo "số dư cuối kỳ" nhanh.
   - Mốc cho reconcile incremental.
   - **Archive entry cũ:** sau khi chốt snapshot, entry trước mốc chuyển sang cold storage.
3. **Reconciliation nền** dùng snapshot làm mốc: chỉ SUM `entries > last_snapshot.seq`.

### 5.5 Archive — trị dứt nỗi lo triệu dòng

```
[ Cold storage: entries seq 1 → 900,000 ]   (đã gói trong snapshot @ seq 900,000)
[ Hot table:    entries seq 900,001 → nay ]  (vài nghìn dòng, nhanh)

balance = snapshot(@900,000).balance + SUM(hot entries)   -- luôn nhỏ
```

Trên AWS: entry cũ archive sang **S3 (Parquet) + query bằng Athena** cho audit/compliance, hoặc partition cũ chuyển sang storage rẻ. Hot table (PostgreSQL) chỉ giữ entry sau snapshot gần nhất. Giữ được cả **immutability toàn vẹn** lẫn **hiệu năng O(1)**.

> **Lưu ý partition:** dùng PostgreSQL **declarative partitioning** trên `ledger_entries` theo range (thời gian hoặc seq). DETACH partition cũ để archive không khóa bảng nóng.

---

## 6. Hạ tầng & Công nghệ trên AWS

### 6.1 Bản đồ dịch vụ

| Layer | AWS / Công nghệ | Ghi chú |
|---|---|---|
| **Ledger DB (SSOT)** | **Aurora PostgreSQL** (hoặc RDS PostgreSQL) | ACID, row-lock, partitioning. Aurora: failover nhanh, đọc scale bằng replica. |
| Balance snapshot / đọc nóng | **ElastiCache for Redis** | Cache `balance_after` mới nhất; TTL ngắn + invalidate khi ghi. Không phải SSOT. |
| Recording bất đồng bộ | **SQS (FIFO)** + Lambda / worker | Tách authorization ↔ recording (xem 6.3). FIFO đảm bảo thứ tự per-account (MessageGroupId = accountId). |
| Event domain khác | **EventBridge** | Notification, BI, risk — eventual consistency. |
| Archive entry cũ | **S3 (Parquet)** + **Athena** | Audit/compliance, query rẻ, immutable (Object Lock). |
| Payout ra ngoài | Lambda + PSP Adapter | Idempotency key per attempt. |
| Secrets | **Secrets Manager** | DB creds, PSP keys — rotate tự động. |
| Quan sát | **CloudWatch** + alarm | Alert khi reconcile lệch, khi `SUM ≠ 0`. |
| Immutable audit | **QLDB** (tùy chọn) hoặc S3 Object Lock | Nếu cần cryptographic verifiable history. |

> **Chọn engine ledger:** mặc định **Aurora PostgreSQL** — cân bằng giữa quen thuộc (SQL, ACID, đội ngũ đã biết) và scale. Nếu throughput ví cực cao (chục nghìn tx/s) và muốn chuyên dụng: cân nhắc **TigerBeetle** (database double-entry accounting chuyên biệt, built-in `balance_after`, two-phase transfer, không cần tự viết guard). Nhưng TigerBeetle là hệ riêng, thêm chi phí vận hành — chỉ dùng khi PostgreSQL thực sự thành bottleneck.

### 6.2 Vì sao PostgreSQL cho ledger, không phải MongoDB/DynamoDB

- **ACID multi-row transaction** là bắt buộc: ghi ≥2 entries + guard + (cache) phải all-or-nothing. PostgreSQL làm việc này native, mạnh nhất.
- **Row-lock (`FOR UPDATE`)** serialize per-account gọn gàng.
- **CHECK constraint, trigger, foreign key** enforce invariant ngay ở tầng DB.
- DynamoDB có transaction nhưng giới hạn (25 item, không có `SUM`/join tiện cho reconcile). MongoDB có multi-doc transaction nhưng ledger tài chính hưởng lợi từ SQL + constraint cứng của Postgres.
- **Chiến lược polyglot:** Wallet/Ledger/Payment/Commission (nhóm tài chính) → PostgreSQL ACID. Các context còn lại (catalog, notification, CMS, risk scoring) → MongoDB/DynamoDB + eventual consistency.

### 6.3 Tách Authorization ↔ Recording (chịu tải cao)

Để vừa phản hồi real-time vừa chịu tải ghi lớn:

```
[Authorization — đồng bộ, nhanh]           [Recording — bất đồng bộ, bền]
Player đặt cược
  → check balance (Redis snapshot + row-lock Postgres cho guard)
  → cho phép/từ chối NGAY (low latency)
  → enqueue SQS FIFO (MessageGroupId = accountId)   ──►  Worker ghi ledger entries
                                                          (đúng thứ tự per-account,
                                                           idempotent theo tx)
```

- **Authorization** giữ đường nóng ngắn: chỉ khóa + guard + trả lời.
- **Recording** ghi ledger đầy đủ qua queue → không chặn user, retry được.
- **FIFO + MessageGroupId = accountId**: các giao dịch cùng account xử lý tuần tự (đúng thứ tự `balance_after`), khác account song song.

> **Cảnh báo:** mô hình này thêm độ phức tạp (eventual giữa authz và recording). Với MVP / tải vừa, **ghi ledger đồng bộ ngay trong request** (như §3.2) đơn giản và an toàn hơn. Chỉ tách khi thực sự cần throughput.

### 6.4 High Availability & DR

- **Aurora Multi-AZ** — failover tự động, không mất commit đã ack.
- **PITR (Point-in-time recovery)** + snapshot định kỳ.
- **Read replica** cho báo cáo/BI, KHÔNG đọc balance-để-ghi từ replica (lag → guard sai). Đọc guard luôn từ primary.
- Ledger append-only + immutable → khôi phục = replay, không lo mất "trạng thái mới nhất".

---

## 7. Tối ưu performance

### 7.1 Phân bổ chi phí đúng chỗ

| Thao tác | Tần suất | Chi phí mục tiêu |
|---|---|---|
| Đọc balance (xem ví, cược nhỏ) | Rất nhiều | O(1): Redis snapshot / `balance_after` entry cuối |
| Trừ/cộng tiền | Mỗi giao dịch | 1 transaction: khóa entry cuối + guard + INSERT |
| Verify cache=ledger 1 account | Giao dịch nhạy cảm | O(entries sau snapshot) — nhỏ |
| Reconcile toàn hệ thống | Định kỳ (nền) | SUM sau checkpoint, ngoài giờ nóng, trên replica |

**`SUM` toàn bộ KHÔNG bao giờ nằm trên hot path** — chỉ ở reconcile nền, và cũng chỉ SUM phần sau checkpoint.

### 7.2 Index & khóa

- `idx_entries_account_seq (account_id, seq DESC)` — lấy entry cuối O(1), sống còn.
- Chỉ khóa **entry cuối của đúng account** (`FOR UPDATE ... LIMIT 1`), không khóa cả bảng → account khác chạy song song.
- Giữ transaction **ngắn**: không gọi network/PSP bên trong transaction DB (gọi ngoài, ghi kết quả sau).

### 7.3 Throughput per-account vs cross-account

- Nút thắt là **các giao dịch cùng một account** (buộc tuần tự). Cross-account song song thoải mái.
- Account "nóng" (house, psp:clearing) bị tranh chấp cao → cân nhắc **sharding house account** thành nhiều sub-account (`house:stake:shard0..N`) rồi cộng gộp khi báo cáo, giảm hotspot lock.

### 7.4 Redis snapshot đúng cách

- Ghi Redis **sau khi** Postgres commit (đọc-nhanh, không phải nguồn ghi).
- Nếu Redis miss/stale → fallback đọc `balance_after` từ Postgres (luôn đúng). Redis chỉ là tối ưu, không phải phụ thuộc cứng.
- Không dùng Redis làm guard chống overspend (không ACID) — guard luôn ở Postgres.

### 7.5 Batch payout

- Trả thưởng hàng loạt (settle) → ghi ledger theo **batch trong 1 transaction** hoặc nhóm nhỏ, idempotent theo `tx`. Giảm số round-trip.

---

## 8. Checklist thiết kế & Anti-patterns

### 8.1 Checklist bắt buộc (rẻ lúc thiết kế, đắt khi sửa sau)

- [ ] **Integer tiền tệ** (VND đơn vị nhỏ nhất), tuyệt đối không float.
- [ ] **Double-entry**: mỗi tx ≥ 2 entries, `Σ amount = 0`. Enforce ở app + kiểm ở reconcile.
- [ ] **Append-only**: trigger/GRANT chặn UPDATE/DELETE trên `ledger_entries`.
- [ ] **`balance_after`** trên mỗi entry, tính trong cùng transaction ghi entry.
- [ ] **Guard đủ tiền atomic**: `WHERE balance >= x` hoặc check trong transaction đã `FOR UPDATE`.
- [ ] **`CHECK (balance >= 0)`** cho account không cho phép âm.
- [ ] **Idempotency**: `external_ref`/`tx` UNIQUE; withdrawal key per-attempt.
- [ ] **Serialize per-account**: `FOR UPDATE` entry cuối, hoặc SQS FIFO MessageGroupId.
- [ ] **Snapshot/checkpoint** cho account dài hạn; verify/reconcile chỉ SUM sau mốc.
- [ ] **Reconciliation job** từ ngày đầu (P0): `Σ=0`, cache=ledger, chuỗi `balance_after`, đối soát PSP/core.
- [ ] **Reversing entry** cho sửa sai — không bao giờ UPDATE bản gốc.
- [ ] **Audit mọi quyết định tài chính** (ai, rule nào, dữ liệu gì) — bất biến.
- [ ] **Không gọi external (PSP) trong transaction DB.**
- [ ] **Chart of accounts** rõ ràng từ đầu: `player:{id}:cash|bonus|locked`, `house:*`, `psp:*`, `agent:*`.

### 8.2 Anti-patterns — KHÔNG làm

| Anti-pattern | Vì sao sai | Thay bằng |
|---|---|---|
| `UPDATE accounts SET balance = balance - x` rồi mới ghi history | Balance-first: history không ràng buộc, lệch không cứu được | Ledger-first: ghi entries, balance là derived |
| Đọc balance ra app → if đủ → trừ | TOCTOU race → overspend | Conditional write `WHERE balance >= x` atomic |
| `SET balance = :computed` (giá trị tính sẵn) | Mất update song song | `SET balance = balance + :delta` |
| `SUM(toàn bộ history)` mỗi lần đọc/verify | O(N), sập khi N lớn | `balance_after` + snapshot, SUM sau mốc |
| Cập nhật cache ngoài transaction ghi ledger | Cache lệch khi lệnh sau fail | Cùng 1 transaction, delta |
| Cửa hậu ghi ledger (import tay) bỏ qua cache | Cache lệch âm thầm | Mọi ghi qua 1 code path duy nhất |
| UPDATE/DELETE entry để sửa | Mất audit trail, balance không tái tạo | Reversing entry |
| Float cho tiền | Sai số làm tròn | Integer đơn vị nhỏ nhất |
| Guard overspend bằng Redis | Redis không ACID | Guard ở Postgres, Redis chỉ đọc-nhanh |
| Đọc balance-để-ghi từ read replica | Lag → guard sai | Đọc guard từ primary |
| Double-payout do retry cùng key sang rail khác | Mất tiền âm thầm | Idempotency key per-attempt |

---

## 9. Tóm tắt một trang

- **Ledger là SSOT; balance là cache derived.** Không lệch được về định nghĩa — chỉ cache stale, luôn rebuild từ ledger.
- **Đọc số dư O(1)** qua `balance_after` entry cuối (+ Redis cho đọc nóng). Không SUM lịch sử.
- **Chống overspend** = conditional write + `CHECK (balance >= 0)` + `FOR UPDATE`/version. DB tự từ chối.
- **Atomicity + append-only + idempotency** → không trạng thái nửa vời, không mất audit, retry không nhân tiền.
- **Account triệu giao dịch** → snapshot/checkpoint, chỉ SUM sau mốc, archive entry cũ sang S3.
- **Reconciliation nền** (Σ=0, cache=ledger, đối soát PSP/core) là lưới an toàn — lệch 1 xu là alert.
- **AWS:** Aurora PostgreSQL (ledger ACID) + ElastiCache Redis (đọc nóng) + SQS FIFO (recording) + S3/Athena (archive). Cân nhắc TigerBeetle nếu throughput cực cao.

---

## Nguồn tham khảo (chuẩn ngành)
- Single Source of Truth / ledger-first wallet — urgentgames
- Designing a Payment System (double-entry ledger) — Pragmatic Engineer
- TigerBeetle — double-entry accounting database (balance_after, two-phase transfer)
- Martin Kleppmann, *Designing Data-Intensive Applications* — immutability, event log, derived state
- Square/Stripe engineering — idempotency keys, ledger reconciliation
- Xem thêm `docs/operator/operator-platform-design.md` §5 (Wallet & Ledger) cho bối cảnh MegaWin cụ thể.
