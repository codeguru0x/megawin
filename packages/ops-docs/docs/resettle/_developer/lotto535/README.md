# Lotto 5/35 — Hướng dẫn Resettle (Kết sổ lại)

## Tổng quan

Resettle là quy trình kết sổ lại một kỳ quay sau khi phát hiện kết quả công bố sai. Hệ thống phân loại scenario dựa trên **2 tín hiệu chính**:

1. **chainLength** — số ledger entry có `drawId > T` (số kỳ đã kết sổ SAU T theo thời gian, **xuyên cycle**). Đây là tín hiệu **quyết định** B2.
2. **jpOrSplitAffected** — winner JP thay đổi HOẶC trạng thái **Split Cycle** thay đổi. Chỉ dùng phân biệt TYPE_A vs TYPE_B1 **khi chain rỗng**.


| Scenario           | Mô tả                                                                                               | Xử lý                          |
| ------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| **TYPE_A**         | Chain **rỗng** + JP/Split tại T **không đổi**                                                       | Tự động hoàn toàn              |
| **TYPE_B1**        | Chain **rỗng** + JP/Split tại T **thay đổi**                                                        | Auto payout + DBA update cycle |
| **TYPE_B2**        | Chain **không rỗng** (`chainLength > 0`, theo `drawId` — **có thể xuyên cycle**) — **luôn** cascade tuần tự | Cascade step-wise; DBA chốt/tái cấu trúc cycle giữa mỗi bước |
| **LEDGER_MISSING** | Ledger entry null dù kỳ đã settled                                                                  | Dừng — báo kỹ thuật            |


> ### ⚠️ Cross-cycle ⇒ vẫn là TYPE_B2 (không còn scenario CHẶN riêng)
>
> Lotto 5/35 **đóng cycle** khi `hasJpWinner` **HOẶC** `didSplit` (xem `finalize-settle` `shouldCloseCycle`). Khi một kỳ T đóng cycle, cycle kế (`cycleNo + 1`) được mở ngay.
>
> **Tình huống cross-cycle:** kỳ T cũ đã đóng cycle (do JP winner hoặc split), nhưng kết quả mới làm kỳ T **không còn đóng** — TRONG KHI cycle kế đã có ≥1 kỳ kết sổ. Cycle T đáng lẽ **không đóng** → các kỳ ở cycle kế cần gộp ngược vào cycle T.
>
> Trước đây tình huống này bị **CHẶN** (DBA thủ công toàn bộ). Nay chain phát hiện theo `drawId` (`findSettledChainAfterDraw`) nên các kỳ ở cycle kế **nằm trong chain** → cùng vào **TYPE_B2**, resettle **tuần tự** `T → T+1 → … → T+n`. **DBA chỉ tái cấu trúc cycle metadata** (đóng/mở/gộp `cycleNo`) **giữa mỗi bước** dựa trên ledger; worker chạy lại entries với `skipCycleUpdate=true`. Can thiệp DBA tối thiểu, không cần re-settle thủ công.
>
> `opening(T+n)` luôn lấy `closing` của **kỳ settle liền trước theo thời gian** (`findClosingBeforeDraw`) → đúng cả khi ranh giới cycle vừa bị xoá. Guard `RESETTLE_CASCADE_ORDER` đảm bảo không resettle kỳ sau khi kỳ trước chưa hoàn tất (gồm bước DBA chốt cycle).

> ### ⚠️ Có chain ⇒ LUÔN TYPE_B2 (quy tắc cốt lõi của Lotto 5/35)
>
> Split Lotto 5/35 phụ thuộc **pool**: `split(K) = Evening && opening(K) >= splitThreshold && !hasJpWinner`, với `opening(K) = closing(K-1)`.
>
> Khi sửa kết quả kỳ T, `closing(T)` **gần như luôn đổi** — kể cả khi T là roll-over→roll-over, chỉ cần số vé trúng tier đổi thì `contribution` đã đổi. `closing(T)` đổi → `opening` toàn chain đổi **dây chuyền** → một kỳ Evening trong chain có thể **vượt/tụt ngưỡng split dù số quay của nó không đổi** (split "chuyển kỳ").
>
> Không thể tiền-kiểm `closing(T)` mới mà không re-settle, nên mọi heuristic buffer đều rủi ro biên. **Có chain (theo `drawId`, xuyên cycle) = bắt buộc cascade tuần tự** để re-settle tính lại `opening`/`split` đúng cho từng kỳ.
>
> Đây là điểm khác bản chất với Power 6/55: winner Power655 chỉ phụ thuộc số quay (pool đổi không sinh winner mới), còn **split Lotto 5/35 phụ thuộc pool** → pool đổi CÓ thể sinh/mất split ở kỳ sau.

> ### ⚠️ Split Cycle — khi chain rỗng vẫn xử lý NHƯ JP-winner-affected
>
> Lotto 5/35 có **Split Cycle** (kỳ tối, opening ≥ ngưỡng, không có winner JP → chia jackpot xuống tier1–5).
> Khi chain rỗng, bất kỳ thay đổi split (`split→không` / `không→split`) đẩy sang **TYPE_B1** — an toàn như winner-change.
>
> - `newWouldSplit` = `drawNo === Evening && ledger(T).opening >= splitThreshold && !hasNewJpWinner`
> - `hadOldSplit` = `ledger(T).didSplit`

> ### ⚠️ Định nghĩa "chain sau T"
>
> Các kỳ **đã kết sổ** sau T theo thời gian (`drawId > T`, qua Cycle Ledger), **bất kể `cycleNo`** — nên bắt được cả các kỳ ở cycle kế khi T từng đóng cycle. Kỳ chưa settle không nằm trong chain.

## Cycle Ledger

Collection `lotto535_jackpot_cycle_entries` — **single jackpot** (không dual JP1/JP2):

```
{ cycleNo, drawId, drawNo, seq, opening, contribution, closing, hasJpWinner, didSplit, isSplitCycleAtSettle, settledAt, updatedAt }
```

- `opening` / `closing` — pool jackpot đầu/cuối kỳ (VND).
- `didSplit` — kỳ này đã thực hiện split jackpot xuống tier cố định.
- `isSplitCycleAtSettle` — snapshot flag split lúc settle.

## Luồng tổng quát

1. Staff **sửa kết quả** qua `publish-result` (kỳ đã settled → `republishResultAfterSettled`, **giữ `settledAt`**).
2. Gọi `/resettle-preflight` với kết quả đề xuất.
3. Trigger `/resettle` (TYPE_B1/B2 cần `dbaConfirmed: true`).
4. Resettle SFN: PrepareResettle → EnqueueReversals → nested Settle SFN.

## Quy trình API

### Pre-flight

```
POST /api/lotto535/draws/{drawId}/resettle-preflight
{
  "proposedWinningMain": ["05", "12", "23", "34", "35"],
  "proposedWinningSpecial": "07"
}
```

**Response**: `{ scenario, message, hasNewJpWinner, hadOldJpWinner, newWouldSplit, hadOldSplit, chainLength, chainDrawIds }`

### Publish kết quả mới

```
POST /api/lotto535/draws/{drawId}/publish-result
{
  "winningMain": ["05", "12", "23", "34", "35"],
  "winningSpecial": "07"
}
```

### Trigger resettle

```
POST /api/lotto535/draws/{drawId}/resettle
{ "dbaConfirmed": true }
```

Pipeline tự động:

1. **PrepareResettle** — clear reversal → snapshot → reset entries. KHÔNG wipe lines: `upsertLines` hybrid `$set` overwrite matchResult theo kết quả mới.
2. **EnqueueReversals** — debit hoàn payout cũ.
3. **Settle SFN** — re-settle với `resettleContext` (override `opening`, tính lại `isSplitCycle`).

## Xem thêm

- [Type A](./type-a.md)
- [Type B1](./type-b1.md)
- [Type B2](./type-b2.md)
- [Cycle Ledger](./cycle-ledger.md)
- [Troubleshooting](./troubleshooting.md)

