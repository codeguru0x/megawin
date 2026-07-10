# 08 — Huỷ phiếu (Ticket Cancel) & Huỷ số (Number Cancel)

**Mục đích**: cho phép huỷ phiếu đã cược (hoàn tiền), hoặc huỷ một/nhiều con số trên diện rộng (đại lý huỷ số cho toàn tuyến). Ngược chiều với đặt cược: phải hoàn tiền, giảm thống kê, cập nhật báo cáo huỷ.

Đường dẫn: `server/src/services/lottery/services/game-play` (nhánh cancel).

---

## A. Huỷ phiếu — Ticket Cancel

### A.1 Điều kiện huỷ (guard thời gian)

- Chỉ huỷ được sau `CancelLimit` KHÔNG áp dụng — thực chất `CancelLimit = thời điểm cược + parameter.CancelLimit(giây)`; sau đó **không** còn được huỷ. (Hằng `TicketCancelLimitInSeconds = 300`.)
- **Không huỷ được trong 10 phút trước giờ đóng** (`TicketCancelLimitBeforeAutoCloseInSeconds = 600`): dùng `term.canBetNow(..., additionInSeconds = 600)` — nếu trong vòng 600s trước AutoCloseAt thì chặn.
- Phiếu phải `Status = Valid`, term/game còn Open.
- Live có cơ chế riêng (giải đã mở thì không huỷ số đã trúng).

### A.2 Entity `TicketCancelTaskEntity` — collection `ticketCancelTasks`

`{ TicketNr, PlayerId, Term, GameType, BetType, Status, CanceledBy, Reason, CreatedAt }`. Ghi nhận yêu cầu huỷ (player tự huỷ / manager huỷ hộ).

### A.3 Luồng huỷ phiếu

```
POST cancel (player hoặc manager)
   → guard thời gian + quyền
   → set Ticket.Status = Canceled
   → hoàn tiền player (deposit lại TotalPayAmount)
   → giảm thống kê single/multi-number (đảo dấu increaseNumbersByTicketTXs)
   → cập nhật báo cáo huỷ (playerCanceledBetTypeReports / bookieCanceledBetTypeReports)
   → giảm outstanding ($inc âm)
   → publish realtime
```

---

## B. Huỷ số — Number Cancel

**Khác với huỷ phiếu**: đại lý muốn huỷ toàn bộ cược của **một/nhiều con số** trên toàn tuyến dưới (ví dụ số quá rủi ro). Ảnh hưởng nhiều phiếu của nhiều player.

### B.1 Entities

**`NumberCancelTaskEntity`** — collection `numberCancelTasks`:
`{ TaskId, UserId(đại lý ra lệnh), Term, GameType, BetType, Numbers[], Status(Pending/Processing/Done/Fail), TotalTickets, ProcessedTickets, CreatedAt }`.

**`NumberCancelTaskDetailEntity`** — collection `numberCancelTaskDetails`:
chi tiết từng phiếu/số bị huỷ trong task (audit + để redo/rollback).

### B.2 Luồng huỷ số (bất đồng bộ, khối lượng lớn)

```
POST cancel-numbers (đại lý)
   → tạo NumberCancelTask (Pending)
   → đẩy vào Kinesis (LOTTERY_GAME_PLAY_NUMBER_CANCEL) — chống trùng bằng Redis Set
   → worker duyệt các ticketItem chứa số cần huỷ (theo term/gt/bt + phạm vi tuyến dưới)
       → mỗi phiếu: huỷ phần số tương ứng, hoàn tiền, ghi TaskDetail
       → cập nhật thống kê + báo cáo huỷ
   → cập nhật ProcessedTickets / Status
   → publish realtime tiến độ
```

- **Idempotency**: Redis Set lưu key phiếu-số đã xử lý, tránh huỷ trùng khi worker retry.
- Huỷ số có thể huỷ **một phần** phiếu (chỉ các số nằm trong danh sách), không nhất thiết cả phiếu.

---

## C. Nguyên tắc hoàn tiền & đảo thống kê

- Hoàn tiền = `deposit` vào ví player đúng số tiền phần bị huỷ (đối xứng với `withdraw` lúc cược).
- Giảm thống kê: gọi cùng hàm cập nhật single/multi-number với **giá trị âm** (đảo dấu) — xem file 09.
- Báo cáo huỷ tách riêng (canceled reports) để đối soát: phần đã huỷ không tính vào doanh thu/thắng thua thực.

---

## D. API endpoints

**Player**: `POST /player/tickets/{TicketNr}/cancel` — tự huỷ phiếu trong thời gian cho phép.

**Agent/Manager**:

- `POST /agent/tickets/{TicketNr}/cancel` — huỷ hộ player (cần quyền + `WriteBetting`).
- `POST /agent/number-cancel` — huỷ số diện rộng; body `{ Term, GameType, BetType, Numbers[] }`.
- `GET /agent/number-cancel/tasks` — theo dõi tiến độ task.

---

## E. Gợi ý khi xây lại

1. **Hai guard thời gian** (sau khi cược ≥ `CancelLimit` và ≤ 600s trước đóng) phải kiểm cả hai đầu; dùng lại `canBetNow` với offset để nhất quán.
2. **Huỷ số là thao tác nặng** → phải bất đồng bộ (queue/worker) + idempotency Set, có bảng task theo dõi tiến độ.
3. **Mọi thao tác huỷ phải đảo đủ 4 việc**: hoàn tiền, giảm stats, ghi canceled report, giảm outstanding — thiếu một bước sẽ lệch báo cáo.
4. Lưu `TaskDetail` để có thể audit/rollback khi huỷ nhầm.
