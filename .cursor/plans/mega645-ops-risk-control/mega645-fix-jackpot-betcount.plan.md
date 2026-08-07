---
name: ""
overview: ""
todos: []
isProject: false
---

# Fix: Mega 6/45 — Chia Jackpot sai khi 1 entry có nhiều line trúng JP (multi-board)

> **Status**: `approved` (user chốt 06/08/2026 — Q3 của `mega645-operations-risk-control.analysis.md`)
> **Scope**: settle pipeline Mega 6/45 — `patch-jackpot-prize.ts` + `line-repo.ts` + `entry-repo.ts`. KHÔNG thuộc scope ops-risk-control nhưng là tiền đề cho `jackpotUnits` của combo transparency (P1).
> **Chuẩn đích**: port đúng pattern Power 6/55 `patchJackpotTier` (`packages/game-power655-application/src/use-cases/settle/patch-jackpot-prize.ts` dòng 197–259) — Power 6/55 ĐÃ xử lý đúng bug này, Mega 6/45 là bản cũ chưa được port.

---

## 1. Vấn đề là gì — 3 lỗi liên đới trong `PatchJackpotPrizeUseCase`

### Tiền đề (từ `settle-entries.ts`, đã xác minh 06/08)

Mỗi **board** phủ bộ số trúng S sinh đúng **1 line JP** (C(6,6) = 1) với `betCount` riêng của board đó. Một entry có tối đa 6 boards (A–F) → entry có thể có **nhiều line JP** khi ≥ 2 board cùng phủ S. Ví dụ kích hoạt:

- Board A `standard` = S (betCount 2) + Board B `bao7` ⊇ S (betCount 5) → entry có 2 line JP, betCount 2 và 5.
- Hai board bao chồng lấn cùng chứa S; hoặc 2 board standard trùng số (không có ràng buộc cấm trùng board).

`buildPayoutTiersFromLines` đếm đúng: `payout.tiers[jackpot].hitCount = 2` (số line vật lý). Nhưng `patch-jackpot-prize.ts` giả định sai "mỗi entry chỉ có 1 line JP" (comment dòng 17, 74, 82, 95) — giả định này chỉ đúng **per-board**, không đúng per-entry.

### Lỗi 1 — `Map<entryId, betCount>` bị ghi đè → `totalBetUnits` thiếu → chia sai tỷ lệ

```86:101:packages/game-mega645-application/src/use-cases/settle/patch-jackpot-prize.ts
    // Map entryId → betCount từ line doc
    const betCountByEntry = new Map<string, number>();
    for (const line of jackpotLines) {
      betCountByEntry.set(line.entryId, line.betCount);
    }

    // ── Bước 2: Tính tiền thưởng Jackpot theo tỷ lệ betCount ────────────
    // ...
    const totalBetUnits = jackpotEntries.reduce(
      (sum, e) => sum + (betCountByEntry.get(e.id) ?? 0),
      0,
    );
    const totalJackpotPrize = jackpotOpeningAmount + jackpotContribution;
    const jackpotPerUnit = Math.floor(totalJackpotPrize / totalBetUnits);
```

`map.set()` ghi đè: entry có 2 line JP (betCount 2 + 5 = 7 units thật) chỉ còn 1 giá trị (2 hoặc 5 — tuỳ thứ tự docs trả về, **non-deterministic**). Hệ quả:

- `totalBetUnits` NHỎ hơn thật → `jackpotPerUnit` LỚN hơn đúng.
- Entry multi-board bị trả THIẾU so với giá trị tham gia thật; các entry khác được trả THỪA per-unit. Vi phạm quy tắc Vietlott "chia theo tỷ lệ giá trị tham gia dự thưởng".
- Tổng chi vẫn ≤ pool (mẫu số = tử số của phép nhân lại) nên KHÔNG lỗ quỹ ở cấp entry — nhưng phân phối giữa các winner SAI.

### Lỗi 2 — patch line dùng betCount cấp ENTRY cho TỪNG line → line-level phình tiền, lệch entry

```157:168:packages/game-mega645-application/src/infras/repos/line-repo.ts
    const ops = jpLines.map((line: any) => {
      const entryId =
        typeof line.entryId === "string" ? line.entryId : (line.entryId as ObjectId).toHexString();
      const betCount = betCountByEntry.get(entryId) ?? (line.betCount as number);
      return {
        updateOne: {
          filter: {
            _id: line._id,
            "matchResult.winAmount": 0,
          },
          update: {
            $set: { "matchResult.winAmount": jackpotPerUnit * betCount },
```

`patchJackpotLineWinAmountPerLine` patch **MỌI line JP** với betCount lấy từ map cấp entry (giá trị bị ghi đè) thay vì `line.betCount` của chính line. Entry 2 line JP → CẢ 2 line đều nhận `jackpotPerUnit × bc_cuối` → **Σ(line.winAmount) = 2 × entry.payout.amount** — player gọi `getEntryLines` thấy tổng line lớn hơn tiền thực nhận trên entry. Line và entry lệch nhau vĩnh viễn (draw `totalPayout` re-aggregate từ ENTRIES nên sổ sách draw đúng, chỉ line-level display sai).

### Lỗi 3 — `unitAmount` ghi sai semantic (lệch chuẩn Power 6/55)

`entry-repo.patchJackpotPrizePerEntry` dòng 1522: `{ ...t, unitAmount: jackpotAmount, amount: jackpotAmount }` — `unitAmount` (giá trị 1 đơn vị tham gia) bị ghi bằng TỔNG tiền entry. Power 6/55 ghi đúng: `unitAmount = jackpotPerUnit`, `amount = prizeAmount` (entry-repo Power 6/55 dòng 504–506).

### Lỗi 4 (dead code, dọn cùng lúc) — `entryRepo.patchJackpotPrize` (per-winner cũ)

`entry-repo.ts` dòng 1406–1480: method `patchJackpotPrize(drawId, jackpotPerWinner)` — logic chia đều per winner thế hệ cũ, **0 caller** (đã grep toàn `game-mega645-application` 06/08). Xoá.

### Ảnh hưởng dây chuyền

- `winners: JackpotWinnerInfo[]` (dòng 130–140) → `prizeAmount` thiếu → `FinalizeSettle` ghi cycle record + `JackpotCycleDoc.winners` sai số tiền.
- Combo transparency P1 (`mega645-operations-risk-control.analysis.md` §3.10): `jackpotUnits` tính từ `combo_stats` = Σ betCount ĐÚNG của mọi board phủ S — sẽ KHỚP công thức chia chỉ sau khi fix này merge. Fix này là **prerequisite** của p1-01.
- Resettle: pipeline resettle đi qua cùng use case → fix áp dụng cho cả 2 đường.

---

## 2. Thay đổi như thế nào — port pattern Power 6/55, giữ 1 điểm TỐT hơn

### Nguyên tắc

Copy thuật toán `patchJackpotTier` của Power 6/55 (group lines theo entryId, CỘNG DỒN betCount), nhưng **giữ cách đọc lines của Mega 6/45** (load TẤT CẢ line JP, không filter `winAmount: 0`, để tính `totalBetUnits`): mẫu số phải **deterministic khi retry** — nếu tính từ lines chưa-patch như `getJackpotWinningLines` của Power 6/55 thì crash giữa chừng (line đã patch, entry chưa) làm retry ra mẫu số 0 → early-return, entry không bao giờ được patch. Điểm này Mega 6/45 hiện đúng, Power 6/55 có lỗ hổng idempotency tiềm ẩn (ghi nhận riêng, ngoài scope — xem §5 Rủi ro).

### File 1 — `packages/game-mega645-application/src/use-cases/settle/patch-jackpot-prize.ts`

```ts
// Bước 1b (SỬA): load TẤT CẢ line JP (giữ nguyên findJackpotLinesByDrawId — không filter winAmount)
const jackpotLines = await this.lineRepo.findJackpotLinesByDrawId(drawId);

// Group theo entryId — CỘNG DỒN betCount (entry có thể có nhiều line JP từ multi-board).
const betUnitsByEntry = new Map<string, number>();
for (const line of jackpotLines) {
  betUnitsByEntry.set(line.entryId, (betUnitsByEntry.get(line.entryId) ?? 0) + line.betCount);
}

// Bước 2 (SỬA): totalBetUnits = Σ betCount của MỌI line JP toàn kỳ.
const totalBetUnits = jackpotLines.reduce((sum, l) => sum + l.betCount, 0);
const totalJackpotPrize = jackpotOpeningAmount + jackpotContribution;
const jackpotPerUnit = Math.floor(totalJackpotPrize / totalBetUnits);

// Bước 3 (SỬA): perEntryAmounts theo shape Power 6/55 — kèm jackpotPerUnit cho unitAmount.
const perEntryAmounts = new Map<string, { prizeAmount: number; jackpotPerUnit: number }>();
for (const e of jackpotEntries) {
  const units = betUnitsByEntry.get(e.id) ?? 0;
  perEntryAmounts.set(e.id, { prizeAmount: jackpotPerUnit * units, jackpotPerUnit });
}

await Promise.all([
  this.entryRepo.patchJackpotPrizePerEntry(drawId, perEntryAmounts),        // signature mới
  this.lineRepo.patchJackpotLineWinAmountPerLine(drawId, jackpotPerUnit),   // BỎ param map
  this.drawRepo.patchSettleSummaryJackpotPrize(drawId, totalJackpotPrize),
]);

// winners (SỬA): prizeAmount = jackpotPerUnit × betUnitsByEntry.get(e.id)
```

Cập nhật header comment + comment các Bước (rule code-quality §4 — comment "mỗi entry chỉ có 1 line JP" hiện SAI, phải sửa thành "mỗi BOARD phủ bộ trúng sinh 1 line JP; entry multi-board có thể có nhiều line").

### File 2 — `packages/game-mega645-application/src/infras/repos/line-repo.ts`

`patchJackpotLineWinAmountPerLine(drawId, jackpotPerUnit)` — bỏ param `betCountByEntry`; mỗi line dùng **`line.betCount` của chính nó**: `winAmount = jackpotPerUnit × line.betCount` (mirror `patchJackpotLinesPerUnit` Power 6/55 line-repo dòng 146–170). Giữ filter idempotent `matchResult.winAmount: 0`. Sau fix: Σ(line.winAmount per entry) = entry.payout.tiers[jackpot].amount — bất biến line↔entry được khôi phục.

### File 3 — `packages/game-mega645-application/src/infras/repos/entry-repo.ts`

1. `patchJackpotPrizePerEntry(drawId, perEntryAmounts: Map<string, { prizeAmount: number; jackpotPerUnit: number }>)` — đổi signature theo Power 6/55 (entry-repo dòng 469–530): `unitAmount = jackpotPerUnit`, `amount = prizeAmount`. Giữ filter idempotent `$elemMatch {tier: jackpot, hitCount > 0, amount: 0}` + recompute `winAmount`/`payoutAmount` từ tiers.
2. **XOÁ** `patchJackpotPrize` (dòng 1406–1480, 0 caller — dead code per-winner cũ).

### KHÔNG đổi

- `findJackpotWinners` (entry-repo) — filter `$elemMatch hitCount > 0` đã đúng với multi-line.
- `findJackpotLinesByDrawId` (line-repo) — load tất cả line JP, đúng yêu cầu mẫu số deterministic.
- `buildPayoutTiersFromLines` (settle-entries) — hitCount = số line vật lý, đã đúng.
- Step Function ASL / handlers — signature use case không đổi.

---

## 3. Cách review

1. Đối chiếu từng hunk với bản chuẩn Power 6/55: `patchJackpotTier` (use-case), `patchJackpotPrizePerEntry` (entry-repo dòng 469), `patchJackpotLinesPerUnit` (line-repo dòng 146). Khác biệt CHO PHÉP duy nhất: Mega 6/45 tính `totalBetUnits` từ TẤT CẢ line JP (không filter `winAmount: 0`) — có comment giải thích lý do idempotency.
2. Kiểm tra bất biến sau fix: `Σ perEntryAmounts.prizeAmount = jackpotPerUnit × totalBetUnits ≤ totalJackpotPrize` (floor); `Σ line.winAmount (per entry) = entry.payout.tiers[jackpot].amount`.
3. Grep `patchJackpotPrize\(` toàn repo = 0 match sau khi xoá dead code.
4. Comment header use case đã sửa hết mệnh đề "mỗi entry chỉ có 1 line JP".

## 4. Cách test

Thêm `packages/game-mega645-application/test/use-cases/patch-jackpot-prize.test.ts` (mongodb-memory-server, theo pattern `settle-entries.test.ts`):

1. **Case chuẩn (regression)**: 2 entry, mỗi entry 1 board standard trúng S, betCount 3 và 1 → `totalBetUnits = 4`, entry A nhận `perUnit × 3`, line khớp entry. (Bảo đảm backward compat.)
2. **Case bug (mới)**: 1 entry có board A standard S (betCount 2) + board B bao7 ⊇ S (betCount 5); 1 entry khác standard S (betCount 1) → `totalBetUnits = 8`; entry 1 nhận `perUnit × 7`; line A = `perUnit × 2`, line B = `perUnit × 5`; Σ lines = entry amount. Trước fix: test này FAIL (map ghi đè).
3. **Idempotency/retry**: chạy `execute` 2 lần → kết quả không đổi; giả lập crash giữa chừng (patch lines xong, entry chưa) → chạy lại vẫn patch entry đúng số (mẫu số không đổi vì đọc tất cả line JP).
4. **Winners**: `winners[].prizeAmount` = tổng theo entry (case 2 → `perUnit × 7`).

Chạy: `pnpm --filter @megawin/game-mega645-application test` + `check-types`.

## 5. Rủi ro & cách test rủi ro

| Rủi ro | Mức | Cách xử lý / test |
|---|---|---|
| Dữ liệu đã settle TRƯỚC fix mang số sai | Thấp (chưa có kỳ JP winner multi-board thực tế nào được ghi nhận) | Fix chỉ ảnh hưởng settle MỚI (filter `amount: 0`/`winAmount: 0` không đụng data đã patch). Nếu cần sửa quá khứ → chạy resettle kỳ đó (pipeline resettle dùng use case đã fix) |
| Power 6/55 có lỗ hổng idempotency ngược lại (mẫu số từ lines chưa-patch → retry sau crash giữa chừng có thể early-return bỏ sót entry) | Trung bình — NGOÀI SCOPE plan này | Ghi nhận thành issue riêng cho Power 6/55: đổi `getJackpotWinningLines` sang đọc tất cả line JP khi tính `totalBetUnits`, giữ filter chỉ khi PATCH. Không sửa trong plan này để giữ diff Mega 6/45 nhỏ |
| Đổi signature 2 repo method làm vỡ caller khác | Rất thấp | Grep đã xác nhận mỗi method đúng 1 caller (`patch-jackpot-prize.ts`); `check-types` toàn package là chốt chặn |
| `winners` sai làm lệch `JackpotCycleDoc.winners` | — | Test case 4 cover; FinalizeSettle nhận winners từ output use case, không tự tính lại |