# MegaWin Callback API — Hướng Dẫn Tích Hợp Cho Tenant

> **API Reference (OpenAPI):** Xem spec đầy đủ với request/response examples tại [`docs/openapi.yaml`](./openapi.yaml).
> Preview interactive docs: `pnpm docs:preview` → mở `http://localhost:8080`.

## Tổng Quan

MegaWin là game provider cung cấp sản phẩm xổ số (Keno, Lotto 5/35, Mega 6/45, Power 6/55, Max 3D, Max 3D Pro, Bingo 18) và các sản phẩm game khác.

Tenant là đối tác phân phối, **tự quản lý wallet/balance** của player. MegaWin gọi ngược (callback) vào API của tenant để thực hiện các thao tác trên ví player.

### Luồng hoạt động

```
Player → Tenant App → MegaWin API (đặt cược, xem kết quả)
                 ↑
MegaWin ─────────┘ callback (trừ tiền, cộng tiền, check balance)
```

### 4 Endpoints cần implement

| #   | Method | Path                      | Mục đích                                                 |
| --- | ------ | ------------------------- | -------------------------------------------------------- |
| 1   | `POST` | `/transaction`            | Thực hiện 1 giao dịch (bet, rollback, bonus, adjustment) |
| 2   | `POST` | `/transaction/batch`      | Thực hiện nhiều giao dịch cùng lúc (payout, refund)      |
| 3   | `GET`  | `/transaction/:tx/status` | Kiểm tra trạng thái giao dịch (read-only)                |
| 4   | `GET`  | `/balance`                | Lấy số dư ví player                                      |

---

## Authentication

MegaWin gửi 2 headers trong mọi request:

| Header        | Mô tả                               | Ví dụ                  |
| ------------- | ----------------------------------- | ---------------------- |
| `x-api-key`   | API key tenant cung cấp cho MegaWin | `sk_live_abc123def456` |
| `x-tenant-id` | Mã tenant                           | `acme`                 |

**Yêu cầu:**

- Validate `x-api-key` khớp với key đã cấp cho MegaWin.
- Validate `x-tenant-id` khớp với tenant ID hệ thống.
- Trả HTTP `401 Unauthorized` nếu authentication thất bại.

---

## Response Pattern

Tất cả callback APIs sử dụng chung **một envelope duy nhất**:

```json
{
  "success": true,
  "data": { ... }
}
```

hoặc khi thất bại:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Mô tả lỗi human-readable"
  }
}
```

| Field           | Type    | Mô tả                                                   |
| --------------- | ------- | ------------------------------------------------------- |
| `success`       | boolean | `true` = xử lý thành công, `false` = thất bại           |
| `data`          | object  | Dữ liệu trả về khi `success: true`. Shape tuỳ endpoint. |
| `error`         | object  | Thông tin lỗi khi `success: false`                      |
| `error.code`    | string  | Mã lỗi machine-readable                                 |
| `error.message` | string  | Mô tả lỗi human-readable                                |

> **Tại sao pattern này?** Envelope `{ success, data, error }` mirror pattern mà MegaWin API sử dụng.
> Hai chiều dùng chung format → tenant chỉ cần 1 bộ parser/handler cho cả request lẫn response.

---

## Nguyên Tắc Chung

### Idempotency

Mọi giao dịch có `tx` (transaction ID) unique. Đây là **idempotency key**.

**Tenant PHẢI:**

1. Trước khi xử lý giao dịch, kiểm tra `tx` đã tồn tại chưa.
2. Nếu `tx` đã xử lý → trả lại kết quả cũ với `success: true` kèm `duplicate: true` trong `data`. **KHÔNG tạo giao dịch mới.**
3. Nếu `tx` chưa có → xử lý giao dịch, lưu `tx`, trả `success: true`.

```json
{
  "success": true,
  "data": {
    "tx": "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
    "balance": 950000,
    "currency": "VND",
    "duplicate": true
  }
}
```

`duplicate` là **flag bên trong `data`**, không phải status riêng. Response vẫn là `success: true` vì giao dịch đã được xử lý thành công trước đó — tenant chỉ cần trả lại balance hiện tại.

> **Tại sao?** MegaWin retry khi gặp timeout/server error. Nếu tenant không kiểm tra trùng,
> cùng 1 bet có thể bị trừ tiền 2 lần.

### Action + Reason

Mỗi giao dịch có 2 trường quan trọng:

- **`action`**: `"debit"` (trừ tiền) hoặc `"credit"` (cộng tiền) — quyết định **money flow**.
- **`reason`**: lý do giao dịch — chỉ cho **audit/log**, không ảnh hưởng logic cộng/trừ.

```
Tenant chỉ cần:
if (action === "debit") → wallet.subtract(amount)
if (action === "credit") → wallet.add(amount)
```

Bảng reason:

| Reason       | Action đi kèm         | Mô tả                           |
| ------------ | --------------------- | ------------------------------- |
| `bet`        | `debit`               | Player đặt cược — trừ tiền vé   |
| `payout`     | `credit`              | Trả thưởng khi player thắng     |
| `refund`     | `credit`              | Hoàn tiền khi kỳ quay bị huỷ    |
| `rollback`   | `credit`              | Hoàn lại debit khi bet thất bại |
| `bonus`      | `credit`              | Thưởng khuyến mãi               |
| `adjustment` | `debit` hoặc `credit` | Điều chỉnh thủ công             |

### Player ID

`playerId` là **lowercase username** mà tenant đăng ký khi tạo player trên MegaWin.

Ví dụ: tenant đăng ký player `"John_Doe"` → MegaWin lưu `"john_doe"` → callback gửi `playerId: "john_doe"`.

Tenant dùng `playerId` để lookup đúng ví player trong hệ thống.

---

## Endpoint 1: Single Transaction

### `POST /transaction`

Thực hiện 1 giao dịch trên ví player.

### Khi nào MegaWin gọi

| Thời điểm           | Action                | Reason       | Mô tả               |
| ------------------- | --------------------- | ------------ | ------------------- |
| Player đặt cược     | `debit`               | `bet`        | Trừ tiền vé         |
| Bet thất bại        | `credit`              | `rollback`   | Hoàn tiền bet lỗi   |
| Thưởng khuyến mãi   | `credit`              | `bonus`      | Cộng bonus          |
| Điều chỉnh thủ công | `debit` hoặc `credit` | `adjustment` | Operator điều chỉnh |

### Request Body

```json
{
  "action": "debit",
  "reason": "bet",
  "tx": "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
  "playerId": "john_doe",
  "amount": 50000,
  "currency": "VND",
  "gameId": "keno",
  "roundIds": ["2026-04-10.095"],
  "description": "Đặt cược Keno kỳ 2026-04-10.095",
  "metadata": {
    "ticketNo": "KENO-20260410-00001"
  }
}
```

| Field         | Type                  | Bắt buộc | Mô tả                                                                                                               |
| ------------- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `action`      | `"debit" \| "credit"` | ✅       | Hướng tiền: trừ hoặc cộng                                                                                           |
| `reason`      | string                | ✅       | Lý do giao dịch (xem bảng trên)                                                                                     |
| `tx`          | string                | ✅       | Transaction ID — UUIDv7 (RFC 9562), **idempotency key**                                                             |
| `playerId`    | string                | ✅       | Lowercase username của player                                                                                       |
| `amount`      | number                | ✅       | Số tiền > 0 (VND)                                                                                                   |
| `currency`    | string                | ✅       | Mã tiền tệ: `"VND"`                                                                                                 |
| `force`       | boolean               | ❌       | `true` = debit bắt buộc, kể cả balance âm. Mặc định `false`. Xem [Force Debit](#force-debit--thu-hồi-payout-sai).   |
| `gameId`      | string                | ❌       | Mã sản phẩm game: `"keno"`, `"lotto535"`, ...                                                                       |
| `roundIds`    | string[]              | ❌       | Danh sách kỳ quay / phiên chơi. VD: `["2026-04-10.095"]`                                                            |
| `description` | string                | ❌       | Mô tả cho lịch sử giao dịch (tiếng Việt)                                                                            |
| `metadata`    | object                | ❌       | Dữ liệu mở rộng game-specific. Key phổ biến: `ticketNo`, `entryId`. Rollback có thể chứa `refTx` (tx gốc cần hoàn). |

### Response Body

**Thành công:**

```json
{
  "success": true,
  "data": {
    "tx": "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
    "balance": 950000,
    "currency": "VND"
  }
}
```

**Trùng lặp (đã xử lý trước đó):**

```json
{
  "success": true,
  "data": {
    "tx": "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
    "balance": 950000,
    "currency": "VND",
    "duplicate": true
  }
}
```

**Thất bại:**

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Player balance 30,000 VND < bet amount 50,000 VND"
  }
}
```

| Field            | Type    | Bắt buộc | Mô tả                                                                             |
| ---------------- | ------- | -------- | --------------------------------------------------------------------------------- |
| `success`        | boolean | ✅       | `true` = giao dịch thành công hoặc duplicate, `false` = thất bại                  |
| `data`           | object  | ⚠️       | Có khi `success: true`                                                            |
| `data.tx`        | string  | ✅       | Echo lại `tx` từ request                                                          |
| `data.balance`   | number  | ✅       | Số dư ví **sau** giao dịch (VND)                                                  |
| `data.currency`  | string  | ✅       | Mã tiền tệ                                                                        |
| `data.duplicate` | boolean | ❌       | `true` nếu `tx` đã được xử lý trước đó. Không gửi hoặc `false` khi giao dịch mới. |
| `error`          | object  | ⚠️       | Có khi `success: false`                                                           |
| `error.code`     | string  | ✅\*     | Mã lỗi machine-readable                                                           |
| `error.message`  | string  | ✅\*     | Mô tả lỗi human-readable                                                          |

### Error Codes — Transaction API

Áp dụng cho **cả** single transaction và batch transaction (outer error + per-item error).

| Code                   | Mô tả                   | MegaWin xử lý                                          |
| ---------------------- | ----------------------- | ------------------------------------------------------ |
| `INSUFFICIENT_BALANCE` | Số dư không đủ để debit | Reject, thông báo player nạp thêm                      |
| `PLAYER_NOT_FOUND`     | Player không tồn tại    | Reject, kiểm tra đăng ký                               |
| `WALLET_FROZEN`        | Ví bị đóng băng         | Reject, thông báo player                               |
| `INVALID_CURRENCY`     | Loại tiền không hỗ trợ  | Reject                                                 |
| `INTERNAL_ERROR`       | Lỗi nội bộ tenant       | Xem chi tiết [bên dưới](#megawin-xử-lý-internal_error) |

> **Lưu ý:** Hành vi MegaWin khác nhau tuỳ context:
>
> - **Single transaction (place-bet):** Mọi `success: false` (kể cả `INTERNAL_ERROR`) → xoá WAL → huỷ bet → **dừng hẳn, không retry.**
> - **Batch payout/refund:** Per-item `success: false` → mark entry failed → **dispatch loop gửi lại cùng `tx`** ở batch tiếp theo (tối đa 10 vòng). Đây là business-level retry, không phải HTTP retry.

> **`force: true` và `INSUFFICIENT_BALANCE`:** Khi MegaWin gửi `force: true`, tenant PHẢI thực hiện debit
> kể cả balance < amount (cho phép âm). Không trả `INSUFFICIENT_BALANCE` cho request có `force: true`.

---

## Endpoint 2: Batch Transaction

### `POST /transaction/batch`

Thực hiện nhiều giao dịch cùng lúc. MegaWin gửi tối đa **50 items** per batch.

### Khi nào MegaWin gọi

| Thời điểm               | Action   | Reason   | Mô tả                                    |
| ----------------------- | -------- | -------- | ---------------------------------------- |
| Settle kỳ quay          | `credit` | `payout` | Trả thưởng cho tất cả players trúng giải |
| Huỷ kỳ quay (void draw) | `credit` | `refund` | Hoàn tiền cho tất cả players đã đặt cược |

### Request Body

```json
{
  "items": [
    {
      "action": "credit",
      "reason": "payout",
      "tx": "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
      "playerId": "john_doe",
      "amount": 200000,
      "currency": "VND",
      "gameId": "keno",
      "roundIds": ["2026-04-10.095"],
      "description": "Trả thưởng Keno kỳ 2026-04-10.095",
      "metadata": {
        "ticketNo": "KENO-20260410-00001",
        "entryId": "01HXYZ789DEF"
      }
    },
    {
      "action": "credit",
      "reason": "payout",
      "tx": "019078a0-c3d4-7abc-9ef0-2d3e4f5a6b7c",
      "playerId": "jane_smith",
      "amount": 500000,
      "currency": "VND",
      "gameId": "keno",
      "roundIds": ["2026-04-10.095"],
      "description": "Trả thưởng Keno kỳ 2026-04-10.095",
      "metadata": {
        "ticketNo": "KENO-20260410-00007",
        "entryId": "01HABC456GHI"
      }
    }
  ]
}
```

Mỗi item có cùng cấu trúc fields như Single Transaction (xem bảng ở trên).

### Response Body

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "tx": "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b",
        "success": true,
        "balance": 1200000
      },
      {
        "tx": "019078a0-c3d4-7abc-9ef0-2d3e4f5a6b7c",
        "success": true,
        "balance": 2500000
      }
    ]
  }
}
```

| Field                          | Type    | Bắt buộc | Mô tả                                                                               |
| ------------------------------ | ------- | -------- | ----------------------------------------------------------------------------------- |
| `success`                      | boolean | ✅       | `true` = batch được xử lý (kể cả partial failure), `false` = toàn bộ batch thất bại |
| `data`                         | object  | ⚠️       | Có khi `success: true`                                                              |
| `data.results`                 | array   | ✅       | 1 result per item, **cùng thứ tự** với `items` trong request                        |
| `data.results[].tx`            | string  | ✅       | Echo lại `tx` từ item                                                               |
| `data.results[].success`       | boolean | ✅       | `true` = item xử lý thành công hoặc duplicate, `false` = item thất bại              |
| `data.results[].balance`       | number  | ❌       | Số dư sau giao dịch (optional trong batch)                                          |
| `data.results[].duplicate`     | boolean | ❌       | `true` nếu `tx` đã được xử lý trước đó                                              |
| `data.results[].error`         | object  | ❌       | Thông tin lỗi nếu `success: false`                                                  |
| `data.results[].error.code`    | string  | ✅\*     | Mã lỗi machine-readable                                                             |
| `data.results[].error.message` | string  | ✅\*     | Mô tả lỗi human-readable                                                            |
| `error`                        | object  | ⚠️       | Có khi outer `success: false` (toàn bộ batch fail)                                  |
| `error.code`                   | string  | ✅\*     | Mã lỗi machine-readable                                                             |
| `error.message`                | string  | ✅\*     | Mô tả lỗi human-readable                                                            |

### Xử lý lỗi trong Batch

**Partial success được chấp nhận.** Nếu 1 item fail, các items khác vẫn phải xử lý. Outer `success` vẫn là `true`:

```json
{
  "success": true,
  "data": {
    "results": [
      { "tx": "019078a0-...-001", "success": true, "balance": 1200000 },
      {
        "tx": "019078a0-...-002",
        "success": false,
        "error": { "code": "PLAYER_NOT_FOUND", "message": "Player not found" }
      },
      { "tx": "019078a0-...-003", "success": true, "balance": 800000, "duplicate": true }
    ]
  }
}
```

**Toàn bộ batch thất bại** (ví dụ database timeout) — outer `success: false`, không có `data`:

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Database timeout"
  }
}
```

MegaWin **không retry ở tầng HTTP** — items có `success: false` được mark `payoutFailed` / `refundFailed`.
Dispatch loop (Step Function) **chủ động gửi lại cùng `tx`** ở batch tiếp theo — tối đa **10 vòng**.
Đây là business-level retry: cùng `tx`, cùng `amount`, cùng `playerId`.
Sau 10 vòng vẫn fail → entry ngừng retry, cần xử lý thủ công.

> **Tại sao KHÔNG lưu error vào DB:** Dispatch loop gửi lại cùng `tx`.
> Nếu tenant lưu `{ tx, status: "FAILED" }`, lần sau tenant thấy tx đã tồn tại → trả cached error
> → entry bị reject vĩnh viễn dù hệ thống đã phục hồi. Xem [Transaction Record Design](#transaction-record-design--thiết-kế-bảng-lưu-trữ-giao-dịch).

---

## Endpoint 3: Transaction Status Check

### `GET /transaction/:tx/status`

Kiểm tra trạng thái 1 giao dịch — **read-only, không side effect**.

### Khi nào MegaWin gọi

Recovery scheduler gọi khi tìm thấy orphan transaction (debit đã gửi nhưng timeout/lỗi mạng, không nhận được response).

Mục đích: **ngăn phantom credit** — scenario:

1. MegaWin gửi debit → timeout → không biết tenant đã xử lý chưa.
2. Nếu rollback mà không check → gửi credit → player nhận tiền miễn phí.
3. Với status check: `success: false` (NOT_FOUND) → xoá WAL, KHÔNG gửi credit.

### Path Parameters

| Param | Type   | Bắt buộc | Mô tả                                |
| ----- | ------ | -------- | ------------------------------------ |
| `tx`  | string | ✅       | Transaction ID (UUIDv7) cần kiểm tra |

**Ví dụ:** `GET /transaction/019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b/status`

### Response Body

**Giao dịch đã xử lý thành công:**

```json
{
  "success": true,
  "data": {
    "processedAt": "2026-04-10T07:30:00Z"
  }
}
```

**Không tìm thấy — tenant chưa nhận hoặc đã xử lý nhưng không lưu failure:**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Transaction not found"
  }
}
```

| Field              | Type    | Bắt buộc | Mô tả                                                                            |
| ------------------ | ------- | -------- | -------------------------------------------------------------------------------- |
| `success`          | boolean | ✅       | `true` = tx tồn tại và đã xử lý thành công, `false` = không tồn tại hoặc đã fail |
| `data`             | object  | ⚠️       | Có khi `success: true`                                                           |
| `data.processedAt` | string  | ❌       | Thời điểm xử lý (ISO 8601). Tenant trả nếu có audit timestamp.                   |
| `error`            | object  | ⚠️       | Có khi `success: false`                                                          |
| `error.code`       | string  | ✅\*     | Mã lỗi — `NOT_FOUND` khi tx không có record trong DB                             |
| `error.message`    | string  | ✅\*     | Mô tả lỗi human-readable                                                         |

### Error Codes — Transaction Status API

Superset của Transaction API error codes, thêm `NOT_FOUND` cho trường hợp tx chưa bao giờ nhận.

| Code                   | Mô tả                                         | MegaWin xử lý           |
| ---------------------- | --------------------------------------------- | ----------------------- |
| `NOT_FOUND`            | Tx chưa bao giờ nhận — giao dịch chưa xảy ra  | Xoá WAL, không rollback |
| `INSUFFICIENT_BALANCE` | Tx đã nhận nhưng fail do số dư không đủ       | Xoá WAL                 |
| `PLAYER_NOT_FOUND`     | Tx đã nhận nhưng fail do player không tồn tại | Xoá WAL                 |
| `WALLET_FROZEN`        | Tx đã nhận nhưng fail do ví bị khoá           | Xoá WAL                 |
| `INVALID_CURRENCY`     | Tx đã nhận nhưng fail do tiền tệ không hợp lệ | Xoá WAL                 |
| `INTERNAL_ERROR`       | Lỗi nội bộ tenant khi check                   | Xem ghi chú bên dưới    |

> **Scheduler chỉ đọc `success` boolean, không đọc error code.** Mọi `success: false` (NOT_FOUND, business error) đều được xử lý giống nhau → xoá WAL, không rollback. Error code chỉ dùng cho logging/debug.
>
> **`INTERNAL_ERROR` trong status check:** Nếu tenant trả HTTP 200 + `success: false` + `INTERNAL_ERROR`,
> scheduler coi đây là `success: false` → **xoá WAL**. Nếu tenant muốn scheduler thử lại sau (vì chưa biết
> tx đã xử lý chưa), trả **HTTP 502/503/504** thay vì HTTP 200 — MegaWin sẽ retry status check ở tầng HTTP.

---

## Endpoint 4: Balance

### `GET /balance`

Lấy số dư ví player hiện tại.

### Query Parameters

| Param      | Type   | Bắt buộc | Mô tả                                                        |
| ---------- | ------ | -------- | ------------------------------------------------------------ |
| `playerId` | string | ✅       | Lowercase username của player                                |
| `currency` | string | ❌       | Mã tiền tệ ISO 4217. Mặc định `"VND"` — MegaWin luôn gửi kèm |

**Ví dụ:** `GET /balance?playerId=john_doe&currency=VND`

### Response Body

**Thành công:**

```json
{
  "success": true,
  "data": {
    "playerId": "john_doe",
    "balance": 1500000,
    "currency": "VND"
  }
}
```

**Thất bại:**

```json
{
  "success": false,
  "error": {
    "code": "PLAYER_NOT_FOUND",
    "message": "Player john_doe not found"
  }
}
```

| Field           | Type    | Bắt buộc | Mô tả                                               |
| --------------- | ------- | -------- | --------------------------------------------------- |
| `success`       | boolean | ✅       | `true` = lấy balance thành công, `false` = thất bại |
| `data`          | object  | ⚠️       | Có khi `success: true`                              |
| `data.playerId` | string  | ✅       | Echo lại từ request                                 |
| `data.balance`  | number  | ✅       | Số dư hiện tại (>= 0)                               |
| `data.currency` | string  | ✅       | Mã tiền tệ                                          |
| `error`         | object  | ⚠️       | Có khi `success: false`                             |
| `error.code`    | string  | ✅\*     | Mã lỗi machine-readable                             |
| `error.message` | string  | ✅\*     | Mô tả lỗi human-readable                            |

### Error Codes — Balance API

| Code               | Mô tả                                      | MegaWin xử lý                                                     |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------- |
| `PLAYER_NOT_FOUND` | Player không tồn tại trong hệ thống tenant | Báo lỗi cho ops                                                   |
| `INVALID_CURRENCY` | Tiền tệ không nằm trong thoả thuận 2 bên   | Báo lỗi cho ops                                                   |
| `INTERNAL_ERROR`   | Lỗi nội bộ tenant                          | Trả HTTP 502/503/504 thay vì HTTP 200 — MegaWin retry ở tầng HTTP |

---

## Transaction ID (`tx`) Format

MegaWin sinh `tx` dạng **UUIDv7** (RFC 9562) — opaque string, time-ordered, 36 ký tự.

**Ví dụ:** `"019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b"`

Tenant **KHÔNG cần parse** `tx` — chỉ lưu nguyên vẹn làm idempotency key.

UUIDv7 đảm bảo:

- **Globally unique** — không collision giữa các service.
- **Time-ordered** — sort theo chronological order tự nhiên.
- **Opaque** — tenant không phụ thuộc vào nội dung bên trong, MegaWin có thể thay đổi generation strategy mà không breaking.

---

## Metadata Fields Phổ Biến

`metadata` là object mở rộng. MegaWin có thể gửi các key sau:

| Key        | Type   | Mô tả                           | Ví dụ                   |
| ---------- | ------ | ------------------------------- | ----------------------- |
| `ticketNo` | string | Mã vé hiển thị cho player       | `"KENO-20260410-00001"` |
| `entryId`  | string | MegaWin entry ID (cho đối soát) | `"01HXYZ789DEF"`        |

Tenant có thể lưu metadata nguyên vẹn hoặc bỏ qua. MegaWin có thể thêm key mới bất cứ lúc nào — tenant không nên reject request khi gặp key lạ.

---

## Retry & Timeout

### MegaWin retry policy — tầng HTTP

- **Retry:** Tối đa 3 lần (tổng 4 attempts).
- **Backoff:** Exponential — 500ms → 1s → 2s (có jitter ±30%).
- **Retryable status codes:** `0` (network error), `408`, `429`, `502`, `503`, `504`.
- **KHÔNG retry:** `200`, `400`, `401`, `403`, `404`, `409`, `422`, **`500`**.

> **`500 Internal Server Error` KHÔNG được retry** vì có thể là bug permanent.
> Tenant muốn MegaWin retry → trả `502`, `503`, hoặc `504` thay vì `500`.

### MegaWin xử lý `INTERNAL_ERROR`

`INTERNAL_ERROR` là error code ở tầng **business** (HTTP 200 + `success: false`).
MegaWin có **2 tầng retry** hoàn toàn khác nhau:

| Tầng                     | Khi nào xảy ra                         | Cơ chế retry                                                 |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------ |
| **HTTP retry**           | Tenant trả `502` / `503` / `504`       | HttpClient retry tối đa 3 lần (exponential backoff), tự động |
| **Business-level retry** | Tenant trả HTTP 200 + `success: false` | Tuỳ flow — xem bảng bên dưới                                 |

**Hệ quả theo từng flow:**

| Flow                         | Tenant trả HTTP 200 + `success: false`                                               | Tenant trả HTTP 502/503/504                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Single (place-bet debit)** | Xoá WAL, huỷ bet — **dừng hẳn, không retry**                                         | HttpClient retry 3 lần → hết retry → giữ WAL → scheduler check status sau           |
| **Batch (payout/refund)**    | Mark per-item failed → **dispatch loop chủ động gửi lại cùng `tx`** (tối đa 10 vòng) | HttpClient retry 3 lần → hết retry → mark toàn batch failed → dispatch loop gửi lại |
| **Status check (scheduler)** | Coi `success: false` → xoá WAL — **dừng hẳn**                                        | HttpClient retry 3 lần → hết retry → increment attempt → retry lần scheduler sau    |

> **Dispatch loop là cơ chế retry chính cho payout/refund.** Khi item bị `success: false` (bất kỳ error code),
> MegaWin mark failed rồi dispatch loop (Step Function) **chủ động gửi lại cùng `tx`** ở batch tiếp.
> Đây là lý do tenant **KHÔNG được lưu error vào DB** — nếu lưu `{ tx, status: "FAILED" }`, dispatch loop
> gửi lại cùng tx → tenant thấy cached error → reject vĩnh viễn dù hệ thống đã phục hồi.

> **Khuyến nghị:** Nếu tenant gặp lỗi nội bộ nhưng **chưa thực hiện** giao dịch (DB chưa bị update), trả
> **HTTP 502/503** để MegaWin retry ở tầng HTTP ngay lập tức. Nếu đã trả HTTP 200 + `success: false`, MegaWin
> vẫn retry được (qua dispatch loop) nhưng chỉ trong batch context — single transaction sẽ bị huỷ hẳn.

### Timeout

MegaWin đặt timeout **30 giây** cho batch, **10 giây** cho single transaction.

**Khuyến nghị cho tenant:**

- Xử lý single transaction < 5 giây.
- Xử lý batch 50 items < 20 giây.
- Nếu cần lâu hơn → tối ưu database hoặc dùng async processing.

---

## Luồng Xử Lý Đề Xuất Cho Tenant

### Single Transaction

```
1. Validate x-api-key và x-tenant-id
2. Parse request body
3. Kiểm tra tx đã tồn tại trong DB:
   → COMPLETED: trả success: true + data với duplicate: true + balance hiện tại
   → Không có record: xử lý tiếp
4. Validate playerId tồn tại → nếu không: trả success: false + PLAYER_NOT_FOUND
5. Validate currency → nếu sai: trả success: false + INVALID_CURRENCY
6. Bắt đầu DB transaction:
   if action === "debit":
     if force === true:
       Trừ tiền KHÔNG check balance → balance có thể âm
     else:
       Check balance >= amount → nếu không đủ: trả INSUFFICIENT_BALANCE
     Trừ tiền + INSERT wallet record(status=COMPLETED) trong 1 DB transaction
   if action === "credit":
     Cộng tiền + INSERT wallet record(status=COMPLETED) trong 1 DB transaction
   if DB error → rollback TOÀN BỘ, KHÔNG INSERT record, trả HTTP 502/503
     MegaWin retry ở tầng HTTP (exponential backoff, tối đa 3 lần)
     Nếu hết retry → single: giữ WAL cho scheduler; batch: mark failed → dispatch loop retry
7. Trả success: true + data với tx, balance mới, currency
```

> **Quy tắc cốt lõi:**
>
> - KHÔNG INSERT record khi lỗi. Chỉ INSERT record khi commit thành công (COMPLETED).
> - Khi DB error, trả **HTTP 502/503** nếu muốn MegaWin retry ngay ở tầng HTTP.
> - Nếu trả HTTP 200 + `success: false`: single → huỷ hẳn; batch → dispatch loop gửi lại cùng `tx` sau.

### Batch Transaction

```
1. Validate x-api-key và x-tenant-id
2. Parse request body
3. Duyệt từng item:
     a. Kiểm tra tx đã tồn tại → success: true + duplicate: true
     b. Validate playerId → success: false + error nếu không tìm thấy
     c. Xử lý giao dịch (debit/credit)
     d. Ghi kết quả vào results[]
4. Trả success: true + data.results[] cùng thứ tự items
```

> **Lưu ý:** Mỗi item trong batch là **độc lập**. Item A fail không ảnh hưởng item B.

---

## Transaction Record Design — Thiết Kế Bảng Lưu Trữ Giao Dịch

> Đây là phần quan trọng nhất để idempotency hoạt động đúng. Thiết kế sai dẫn đến **retry loop vô hạn** hoặc **phantom credit** (player nhận tiền miễn phí).

### Nguyên tắc cốt lõi

**Chỉ lưu transaction khi commit thành công (COMPLETED).** Không lưu failure.

Thiết kế này đơn giản và đúng vì:

1. **Idempotency chỉ cần cho success path** — khi tenant nhận cùng `tx` lần 2+, trả `success: true` + `duplicate: true`. Không cần cache failure.

2. **Single (place-bet): KHÔNG retry** — khi hot path nhận `success: false` (INSUFFICIENT_BALANCE, PLAYER_NOT_FOUND...), MegaWin xoá WAL và dừng hẳn. Không bao giờ gửi lại cùng `tx`.

3. **Batch (payout/refund): dispatch loop retry** — per-item `success: false` → mark failed → dispatch loop chủ động gửi lại cùng `tx` ở batch tiếp (tối đa 10 vòng). Vì vậy KHÔNG lưu error vào DB — dispatch loop sẽ gặp cached error mãi mãi.

4. **Scheduler KHÔNG re-send debit** — scheduler chỉ check status (read-only) rồi quyết định xoá WAL hoặc rollback credit. Không bao giờ gửi lại transaction request.

### Tại sao không cần lưu failure?

Hãy xét 3 flows của MegaWin:

**Hot path (place-bet):**

```
MegaWin gửi debit → tenant trả success: false (INSUFFICIENT_BALANCE)
→ MegaWin nhận response → xoá WAL → reject bet → DỪNG
→ Player đặt lại → tx MỚI (uuid-B) → tenant xử lý fresh
```

MegaWin nhận response trực tiếp → xử lý ngay → không bao giờ gửi lại uuid-A.

**Batch dispatch (payout/refund):**

```
MegaWin gửi credit tx:uuid-A → tenant trả success: false (INTERNAL_ERROR)
→ MegaWin mark entry failed → dispatch loop chạy lại
→ Dispatch loop gửi batch mới, chứa cùng tx:uuid-A
→ Tenant thấy tx chưa có record → xử lý fresh → thành công ✅
```

Dispatch loop CÓ gửi lại cùng `tx`. Nếu tenant lưu `{ tx: uuid-A, status: FAILED }`:

```
→ Dispatch loop gửi lại tx:uuid-A
→ Tenant thấy record FAILED trong DB → trả cached error
→ Entry bị reject vĩnh viễn dù hệ thống đã phục hồi ❌
```

**Scheduler (crash recovery):**

```
MegaWin gửi debit → crash/timeout → KHÔNG nhận response
→ WAL còn DEBIT_PENDING → scheduler chạy sau 30s
→ GET /transaction/:tx/status
→ Tenant không có record → trả success: false + NOT_FOUND
→ Scheduler xoá WAL → DỪNG. Không gửi lại debit.
```

Scheduler chỉ check status rồi xoá WAL. Không re-send debit.

**Kết luận:** Không lưu failure vì (1) hot path không gửi lại cùng `tx`, (2) batch dispatch loop CÓ gửi lại cùng `tx` → cached failure gây deadlock.

### Quy tắc bắt buộc: INTERNAL_ERROR KHÔNG được lưu vào DB

`INTERNAL_ERROR` = "Tôi chưa xử lý được — hãy thử lại."

Tuỳ context, MegaWin có thể **chủ động gửi lại cùng `tx`**:

- **Single (place-bet):** Huỷ hẳn, không gửi lại.
- **Batch (payout/refund):** Dispatch loop chủ động gửi lại cùng `tx` ở batch tiếp (tối đa 10 vòng).

**Nếu tenant lưu error record vào DB:**

```
Tenant gặp DB timeout khi xử lý credit cho tx:uuid-A
→ Chưa cộng tiền, nhưng lưu: { tx: uuid-A, status: "FAILED", error: "INTERNAL_ERROR" }

Dispatch loop gửi lại tx:uuid-A ở batch tiếp theo
→ Tenant thấy tx trong DB → trả cached failure
→ Kết quả sai: entry bị reject vĩnh viễn dù hệ thống đã phục hồi. ❌
```

**Quy tắc:** Giao dịch không thành công → rollback toàn bộ, KHÔNG INSERT gì vào DB.
Nếu muốn MegaWin retry ngay ở tầng HTTP (thay vì đợi dispatch loop), trả HTTP 502/503.

### Bảng tổng kết

| Kết quả xử lý            | Lưu DB                        | Status check trả gì             | Scheduler làm gì             |
| ------------------------ | ----------------------------- | ------------------------------- | ---------------------------- |
| Thành công (commit xong) | ✅ `COMPLETED` — bắt buộc lưu | `success: true` + `processedAt` | Check ticket → heal/rollback |
| Thất bại business        | ❌ Không lưu                  | `success: false` + `NOT_FOUND`  | Xoá WAL ✅                   |
| Crash / lỗi hạ tầng      | ❌ Không lưu                  | `success: false` + `NOT_FOUND`  | Xoá WAL ✅                   |

### Status Check semantics — scheduler chỉ đọc `success`

Recovery scheduler chạy mỗi 2 phút, quét WAL entries quá 30s. Logic binary:

```
success: true  → tiền ĐÃ bị trừ → check ticket exists → self-heal hoặc rollback credit
success: false → tiền CHƯA bị trừ → xoá WAL, KHÔNG gửi rollback credit
timeout/5xx    → không biết        → retry status check lần sau
```

**Rule duy nhất:** `success: true` ↔ tiền đã bị trừ (DB committed).

Nếu trả `success: true` khi tiền chưa bị trừ → **phantom credit** (player nhận tiền miễn phí).
Nếu trả `success: false` khi tiền đã bị trừ → tiền mất vĩnh viễn.

### Schema đề xuất

```sql
CREATE TABLE wallet_ledger (
  tx_id          VARCHAR(36) PRIMARY KEY,  -- UUIDv7 từ MegaWin, idempotency key
  action         VARCHAR(8)  NOT NULL,     -- 'debit' | 'credit'
  reason         VARCHAR(16) NOT NULL,     -- 'bet' | 'payout' | 'refund' | 'rollback' | 'bonus' | 'adjustment'
  player_id      VARCHAR(64) NOT NULL,
  amount         BIGINT      NOT NULL,     -- VND, đơn vị đồng
  currency       VARCHAR(8)  NOT NULL,
  balance_before BIGINT      NOT NULL,
  balance_after  BIGINT      NOT NULL,     -- Có thể âm nếu force debit
  processed_at   TIMESTAMP   NOT NULL
);
```

> Chỉ INSERT sau khi commit thành công. Không có cột `status` hay `error_code` — mọi row đều là COMPLETED.

### Force Debit — Thu Hồi Payout Sai

Đây là edge case quan trọng nhất. Bỏ sót dẫn đến **thất thoát tài chính vĩnh viễn**.

**Kịch bản:**

```
1. Settle draw → MegaWin credit 1,000,000 VND (payout)
   → Player balance: 0 + 1,000,000 = 1,000,000

2. Player rút tiền → balance: 0

3. Admin phát hiện kết quả sai → cần thu hồi 1,000,000 VND

4. MegaWin gửi:
   { action: "debit", reason: "adjustment", amount: 1_000_000, force: true, tx: "uuid-C" }
```

**Tenant xử lý `force: true`:**

```typescript
if (action === "debit") {
  if (force) {
    // Force debit — trừ tiền kể cả âm
    const newBalance = player.balance - amount;
    await db.updateBalance(playerId, newBalance);
    // INSERT wallet_ledger record
    return { success: true, data: { tx, balance: newBalance, currency: "VND" } };
  }

  // Normal debit — check balance
  if (player.balance < amount) {
    return { success: false, error: { code: "INSUFFICIENT_BALANCE", message: "..." } };
  }
  // ... trừ tiền bình thường
}
```

Balance âm = player nợ hệ thống, cần nạp tiền trước khi cược tiếp.

**Khi nào MegaWin gửi `force: true`?**

- Thu hồi payout sai (draw result bị sửa).
- Adjustment debit mà ops quyết định phải thực hiện bắt buộc.

**Khi nào KHÔNG có `force`?**

- Bet debit — luôn check balance bình thường.
- Normal adjustment — check balance bình thường.

### Checklist thiết kế bảng

- [ ] Chỉ INSERT record khi commit thành công (COMPLETED)
- [ ] KHÔNG INSERT record khi lỗi (business error hoặc lỗi nội bộ)
- [ ] Dùng DB transaction atomic — debit/credit và INSERT xảy ra cùng lúc
- [ ] Khi có record COMPLETED → retry trả `success: true` + `duplicate: true`
- [ ] Khi không có record → xử lý fresh
- [ ] `force: true` → trừ tiền không check balance, cho phép âm
- [ ] `force` không có hoặc `false` → check balance bình thường
- [ ] Snapshot `balance_before` / `balance_after` cho audit trail

---

| Status                      | Khi nào                                                         | Body                                                                          |
| --------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `200 OK`                    | Request được xử lý — kết quả business nằm trong `success` field | Response JSON theo envelope `{ success, data?, error? }`                      |
| `400 Bad Request`           | Body JSON invalid, thiếu field bắt buộc, hoặc query params sai  | `{ "success": false, "error": { "code": "BAD_REQUEST", "message": "..." } }`  |
| `401 Unauthorized`          | API key sai hoặc thiếu                                          | `{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "..." } }` |
| `500 Internal Server Error` | Bug permanent — MegaWin **KHÔNG retry**                         | Nên tránh; dùng 502/503 cho lỗi tạm thời                                      |
| `502 Bad Gateway`           | Lỗi tạm thời (upstream)                                         | MegaWin retry (exponential backoff, tối đa 3 lần)                             |
| `503 Service Unavailable`   | Tenant đang maintenance / quá tải                               | MegaWin retry (exponential backoff, tối đa 3 lần)                             |
| `504 Gateway Timeout`       | Upstream không respond kịp                                      | MegaWin retry (exponential backoff, tối đa 3 lần)                             |

> **Quan trọng:** `200 OK` nghĩa là "request đã được xử lý", không phải "giao dịch thành công".
> Business failures (insufficient balance, player not found...) trả HTTP `200` với `success: false`.
>
> **`400` và `401`:** Trả body theo cùng envelope `{ success: false, error: { code, message } }`.
> MegaWin đọc `error.message` để log — không hiển thị cho player.
>
> **Khi tenant gặp lỗi nội bộ (DB timeout, crash):** Trả `502` hoặc `503` để MegaWin retry.
> **KHÔNG trả `500`** — MegaWin không retry `500` vì coi là bug permanent.

---

## Game ID Reference

| Game ID    | Tên game   | Mô tả                              |
| ---------- | ---------- | ---------------------------------- |
| `keno`     | Keno       | Chọn 1-10 số từ 01-80              |
| `lotto535` | Lotto 5/35 | Chọn 5 số + 1 đặc biệt từ 1-35     |
| `mega645`  | Mega 6/45  | Chọn 6 số từ 01-45                 |
| `power655` | Power 6/55 | Chọn 6 số từ 01-55 + bonus         |
| `max3d`    | Max 3D     | Chọn số 3 chữ số                   |
| `max3dpro` | Max 3D Pro | Chọn số 3 chữ số (nhiều kiểu chơi) |
| `bingo18`  | Bingo 18   | Quay 3 số từ 1-6, tổng 3-18        |

MegaWin có thể thêm `gameId` mới khi ra sản phẩm mới. Tenant không nên reject request khi gặp `gameId` chưa biết.

---

## Checklist Tích Hợp

- [ ] Implement 4 endpoints: `/transaction`, `/transaction/batch`, `/transaction/:tx/status`, `/balance`
- [ ] Validate `x-api-key` + `x-tenant-id` trên mọi request
- [ ] Xử lý idempotency qua `tx` (UUIDv7) — kiểm tra trùng trước khi xử lý
- [ ] **Bắt buộc:** Duplicate COMPLETED → trả `success: true` với `data.duplicate: true` (không debit/credit lần 2)
- [ ] **Bắt buộc:** KHÔNG lưu DB khi lỗi (business error hoặc lỗi nội bộ) — chỉ lưu COMPLETED
- [ ] **Lỗi nội bộ (DB timeout, crash):** Ưu tiên trả HTTP `502`/`503` để MegaWin retry ngay ở tầng HTTP. Nếu trả HTTP 200 + `success: false`, batch vẫn retry qua dispatch loop, nhưng single sẽ huỷ hẳn
- [ ] **Dùng DB transaction atomic** — debit/credit và INSERT wallet record trong cùng 1 DB transaction
- [ ] Phân biệt `action` (debit/credit) cho money flow
- [ ] `force: true` → debit bắt buộc, kể cả balance âm, trả `success: true`
- [ ] `force` không có hoặc `false` → check balance bình thường → `INSUFFICIENT_BALANCE` nếu không đủ
- [ ] Trả `data.balance` mới nhất sau mỗi giao dịch
- [ ] Trả `error: { code, message }` khi `success: false`
- [ ] Dùng đúng envelope `{ success, data?, error? }` cho mọi endpoint
- [ ] Batch: xử lý từng item độc lập, partial success OK
- [ ] Batch: trả `data.results[]` cùng thứ tự với items trong request
- [ ] Status check: trả `success: true` nếu và chỉ nếu tiền **đã thực sự bị trừ** khỏi ví (DB committed); `success: false` + `NOT_FOUND` khi không có record
- [ ] Response time: < 5s (single), < 20s (batch 50 items)
- [ ] Test idempotency: gửi cùng `tx` 2 lần → lần 2 phải trả `success: true` + `data.duplicate: true`
- [ ] Test crash retry: trả HTTP 502 lần 1, lần 2 gửi cùng `tx` → xử lý fresh (không có record trong DB vì lần 1 chưa commit)
- [ ] Không reject request khi gặp `gameId`, `metadata` key, hoặc field mới (VD: `force`)

---

## Tài Liệu Tham Khảo

- **OpenAPI Spec:** [`docs/openapi.yaml`](./openapi.yaml) — HTTP contract đầy đủ, import được vào Postman.
- **Interactive Docs:** Chạy `pnpm docs:preview` để xem Redoc UI locally.
- **Postman:** Import `openapi.yaml` vào Postman → tự sinh collection với examples.
