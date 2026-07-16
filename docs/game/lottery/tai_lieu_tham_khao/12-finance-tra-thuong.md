# 12 — Finance (Tài chính: trả thưởng / thu tiền player)

**Mục đích**: sau khi kết sổ tính ra `WinLose` của player, service này **trả thưởng** (cộng tiền thắng vào ví) hoặc **thu lại** (khi redo/huỷ). Là cầu nối giữa bookkeeping (file 11) và hệ thống ví (wallet).

Đường dẫn: `server/src/services/lottery/services/finance`.

---

## A. Entity `PlayerResultEntity` — collection `playerResults`

| Field                                      | Kiểu       | Ý nghĩa                                          |
| ------------------------------------------ | ---------- | ------------------------------------------------ |
| `PlayerId, PlayerUsername, Path, ParentId` |            | Người thắng & cây                                |
| `Term, GameType, BetType`                  |            | Khóa kết sổ                                      |
| `TicketNr?`                                | string     | Phiếu tương ứng (nếu chi tiết theo phiếu)        |
| `Amount`                                   | Decimal128 | Số tiền trả (tiền thắng) hoặc thu (khi âm/redo)  |
| `Type`                                     | enum       | `Pay` (trả thưởng) / `Cancel` (thu lại khi redo) |
| `Status`                                   | enum       | `Pending / Published / Done / Fail`              |
| `TransactionId`                            | string     | Idempotency với ví                               |
| `CreatedAt`                                | Date       |                                                  |

---

## B. Luồng trả thưởng (2 bước)

Tách "tạo danh sách" và "phát sự kiện" để đảm bảo idempotency và có thể retry:

```
Bước 1: createPlayerResultPayList
   → quét ticketItems đã kết sổ có WinLose/Result > 0 (theo Term/GameType/BetType)
   → gom theo player → tạo PlayerResultEntity (Type=Pay, Status=Pending)
   (mỗi player result có TransactionId ổn định → tránh trả trùng)

Bước 2: publish events → wallet
   → duyệt PlayerResult Pending
   → publish sự kiện Increase balance sang ví (kèm TransactionId)
   → set Status=Published/Done
```

- **Chỉ trả phần `Result` (tiền thắng)** vào ví; tiền cược đã trừ lúc đặt cược (file 07). Không trả lại tiền cược của phần thua.
- Idempotency: ví xử lý theo `TransactionId` → phát lại không cộng trùng.

---

## C. Luồng thu lại (Cancel — dùng khi Redo)

Khi kết sổ lại (file 11 mục F), tiền đã trả ở lần trước phải thu hồi:

```
finance cancel (trong redo)
   → tạo PlayerResult Type=Cancel (đối ứng bản Pay đã trả)
   → publish Decrease balance sang ví (theo TransactionId đối ứng)
   → set Status
   → sau đó bookkeeping chạy lại + trả thưởng theo kết quả đúng
```

> Nhờ tách `Pay`/`Cancel` + TransactionId, việc redo không gây lệch ví: mỗi lần trả có bản đối ứng để thu về.

---

## D. Quan hệ với bookkeeping & wallet

```
bookkeeping (winlose) ──► ticketItems.WinLose/Result
        │
        ▼
finance.createPlayerResultPayList ──► playerResults (Pay, Pending)
        │
        ▼ publish (Increase balance + TransactionId)
   wallet service (ngoài lottery)
        ▲
        │ (redo) publish (Decrease balance)
finance cancel ◄── bookkeeping.redoExecution
```

---

## E. API / Worker

- **Agent** (Company + `WriteGame`): `POST /agent/finance/pay` (tạo & phát danh sách trả thưởng cho một kỳ/đài/kiểu), `POST /agent/finance/cancel`.
- Thường được gọi tự động trong luồng Step Function sau `bookkeeping-end`, hoặc thủ công để retry.

---

## F. Gợi ý khi xây lại

1. **Tách 2 bước (tạo list → phát event)** + **TransactionId ổn định** là chìa khoá chống trả thưởng trùng khi retry/replay.
2. **Chỉ cộng tiền thắng `Result`** (tiền cược đã trừ khi đặt) — đừng nhầm cộng cả `WinLose`.
3. **Pay/Cancel đối ứng** cho phép redo an toàn; ví chỉ cần idempotent theo TransactionId.
4. Giữ `playerResults` như sổ cái trung gian giữa lottery và wallet để đối soát.
