---
name: ""
overview: ""
todos: []
isProject: false
---

# Fix: Power 6/55 — Lỗ hổng idempotency khi chia Jackpot (mẫu số từ lines chưa-patch)

> **Status**: `done` (triển khai + verify 06/08/2026 — 95 test pass, check-types 3 package pass)
> **Scope**: settle pipeline Power 6/55 — `patch-jackpot-prize.ts` + `line-repo.ts` + `entry-repo.ts`. Áp dụng cho CẢ 2 jackpot (JP1 + JP2) và cả đường resettle (resettle re-build lines rồi replay Settle SFN → đi qua cùng use case).
> **Bối cảnh**: Power 6/55 ĐÃ xử lý đúng 3 lỗi chia jackpot multi-board của Mega 6/45 (group + cộng dồn betCount, line dùng betCount riêng, `unitAmount = jackpotPerUnit`). Nhưng plan Mega 6/45 §5 ghi nhận rủi ro NGƯỢC LẠI cho Power 6/55: **mẫu số `totalBetUnits` tính từ lines CHƯA-patch → crash giữa chừng làm retry ra kết quả sai hoặc bỏ sót entry vĩnh viễn**. Review 06/08 xác nhận rủi ro CÓ THẬT — plan này fix.

---

## 1. Vấn đề là gì — 4 lỗi liên đới trong `PatchJackpotPrizeUseCase` (Power 6/55)

### Tiền đề (đã xác minh 06/08)

`patchJackpotTier` (use case, dòng 197–259) lấy lines qua `getJackpotWinningLines` — method này filter `"matchResult.winAmount": 0` (chỉ lines CHƯA patch):

```117:138:packages/game-power655-application/src/infras/repos/line-repo.ts
  async getJackpotWinningLines(
    drawId: string,
    jackpotTier: string,
  ): Promise<Array<{ lineId: string; entryId: string; betCount: number }>> {
    const col = await this.getCollection();
    const docs = await col
      .find(
        {
          drawId,
          "matchResult.tier": jackpotTier,
          "matchResult.winAmount": 0,
        },
        { projection: { _id: 1, entryId: 1, betCount: 1 } },
      )
      .toArray();
    // ...
  }
```

Từ kết quả đó use case tính `totalBetUnits` (mẫu số), `jackpotPerUnit`, `perEntryAmounts`, rồi `Promise.all` patch entries + lines **song song** (dòng 253–256). Handler chạy trong Step Function `PatchJackpotPrize` với `Retry MaxAttempts: 3` (`apps/worker-power655/src/step-functions/settle.ts` dòng 197–205) — crash giữa chừng → Lambda chạy LẠI TOÀN BỘ use case.

Vấn đề gốc: **mẫu số và danh sách winner phụ thuộc vào trạng thái patch của lines** — không deterministic qua retry. Mega 6/45 (bản sau fix) đọc TẤT CẢ line JP nên không dính; Power 6/55 là bản có lỗ hổng.

### Lỗi 1 — Crash sau khi lines đã patch, entries chưa → entries MẤT TIỀN JP vĩnh viễn

`Promise.all([patchJackpotPrizePerEntry, patchJackpotLinesPerUnit])` chạy song song. Kịch bản: lines patch xong (bulkWrite thành công), entries patch FAIL (network/timeout) → Lambda throw → SFN retry. Lần chạy lại:

- `getJackpotWinningLines` trả `[]` (mọi line JP đã có `winAmount > 0`) → early-return dòng 216–218 với `patchedCount: 0`, `perEntryAmounts` RỖNG.
- Entries trúng JP giữ `tiers[jackpotN].amount = 0` **vĩnh viễn** — player thắng Jackpot nhưng `payout.winAmount` thiếu toàn bộ tiền JP, `payoutTx` dispatch số tiền sai.
- `winners = []` → `FinalizeSettle` ghi `JackpotCycleDoc` (cycle close / `jackpot2Resets[].winners`) KHÔNG có winner nào dù pool đã reset về seed.

### Lỗi 2 — Crash giữa bulkWrite lines (patch một phần) → retry chia perUnit PHÌNH TO

`bulkWrite(ops, { ordered: false })` fail giữa chừng → một phần lines đã `winAmount > 0`. Retry: `getJackpotWinningLines` chỉ trả lines còn lại → `totalBetUnits` NHỎ hơn thật → `jackpotPerUnit = floor(totalPool / totalBetUnits)` LỚN hơn đúng → lines còn lại + TẤT CẢ entries chưa patch nhận per-unit sai (trả THỪA — lỗ quỹ thật, khác Lỗi 1 của Mega 6/45 chỉ sai phân phối). Thêm nữa: entry có line đã patch ở lần 1 nhưng entry chưa patch → entryId KHÔNG có trong `perEntryAmounts` mới → `prizeInfo ?? 0` (entry-repo dòng 498–499) ghi `unitAmount: 0, amount: 0` — entry bị "patch" thành 0 đồng dù trúng JP.

### Lỗi 3 — `settleSummary` + `winners` gate theo `modifiedCount` → retry bỏ sót vĩnh viễn

Use case dòng 152/161: `if (jpNEntriesPatched > 0 && hasJackpotNWinner)` mới push `jackpotPatches` cho `patchSettleSummaryJackpot`. `jpNEntriesPatched` = `modifiedCount` của bulkWrite — kịch bản: entries + lines patch XONG, crash TRƯỚC `patchSettleSummaryJackpot`/`setTotalPayout` → retry: `patchedCount = 0` → `jackpotPatches` rỗng → `settleSummary.prizes[jackpotN].prizeAmount` KHÔNG BAO GIỜ được ghi. Tương tự `winners` build từ `perEntryAmounts` (rỗng khi retry) → cycle record sai như Lỗi 1.

### Lỗi 4 (dead code, dọn cùng lúc) — cặp method per-winner thế hệ cũ

- `entry-repo.ts` dòng 380–453: `patchJackpotPrize(drawId, jackpotTier, jackpotPerWinner)` — chia đều per winner, đã `@deprecated`, **0 caller** (grep toàn repo 06/08 — các match còn lại thuộc mega645/lotto535 là method riêng của game đó).
- `line-repo.ts` dòng 86–109: `patchJackpotLineWinAmount(drawId, jackpotTier, jackpotPerWinner)` — set uniform winAmount không nhân betCount, **0 caller**. Xoá cả hai.

### Ảnh hưởng dây chuyền

- `winners: JackpotWinnerInfo[]` → `FinalizeSettle` (`finalize-settle.ts` dòng 299–317, 360–376) ghi `jackpot2Resets[].winners` + `cycle.winners` từ output use case, KHÔNG tự tính lại → retry sau crash làm mất lịch sử winner trong cycle record.
- Xác suất kích hoạt thấp (cần crash đúng cửa sổ giữa 2 patch trong kỳ CÓ jackpot winner) nhưng hậu quả là **sai tiền thật, không tự hồi phục** — mọi retry sau đó đều đi vào early-return.
- Resettle: `upsertLines` `$set` đè `matchResult` (winAmount JP về 0) + `PrepareResettle` `$unset` payout entries → sau resettle trạng thái sạch, use case đã fix chạy đúng cho cả 2 đường.

---

## 2. Thay đổi như thế nào — mẫu số deterministic, filter chỉ khi PATCH

### Nguyên tắc

Port ngược đúng 1 điểm tốt của bản Mega 6/45 sau fix: **`totalBetUnits` + grouping + winners tính từ TẤT CẢ line JP** (không filter `winAmount: 0`) → deterministic qua mọi retry. Filter `winAmount: 0` / `amount: 0` CHỈ giữ ở thao tác PATCH (idempotency ghi, không phải idempotency đọc). Thuật toán chia (group entryId, cộng dồn betCount, `unitAmount = jackpotPerUnit`) giữ NGUYÊN — đã đúng.

Bất biến sau fix: chạy `execute` N lần, crash ở bất kỳ điểm nào giữa các lần → `jackpotPerUnit`, `perEntryAmounts`, `winners` luôn ra CÙNG giá trị; mọi entry/line chưa patch cuối cùng đều được patch đúng số.

### File 1 — `packages/game-power655-application/src/infras/repos/line-repo.ts`

1. **THÊM** `getAllJackpotLines(drawId, jackpotTier)` — copy `getJackpotWinningLines` nhưng BỎ điều kiện `"matchResult.winAmount": 0`. JSDoc ghi rõ: "Nguồn tính mẫu số `totalBetUnits` + winners — PHẢI đọc tất cả line JP (kể cả đã patch) để deterministic qua retry sau crash giữa chừng. JP line hợp lệ luôn được settle-entries ghi `winAmount = 0` ban đầu nên tập này = tập winner thật." (Mirror `findJackpotLinesByDrawId` của Mega 6/45.)
2. **GIỮ** `getJackpotWinningLines` (filter `winAmount: 0`) — chỉ còn `patchJackpotLinesPerUnit` dùng nội bộ để tránh re-patch. Sửa JSDoc nói rõ vai trò "chỉ phục vụ patch, KHÔNG được dùng tính mẫu số".
3. **XOÁ** `patchJackpotLineWinAmount` (dòng 86–109, dead code per-winner).
4. `patchJackpotLinesPerUnit` giữ nguyên logic (đọc lines chưa patch → `winAmount = jackpotPerUnit × line.betCount`, bulk filter `winAmount: 0`) — vì `jackpotPerUnit` giờ deterministic, lines patch ở retry khác nhau vẫn cùng đơn giá.

### File 2 — `packages/game-power655-application/src/use-cases/settle/patch-jackpot-prize.ts`

`patchJackpotTier` sửa Bước 1–2 + comment:

```ts
// ── Bước 1: Lấy TẤT CẢ lines trúng JP (kể cả đã patch) ────────────
// PHẢI đọc tất cả — không filter winAmount — để mẫu số + winners
// deterministic khi SFN retry sau crash giữa chừng (lines đã patch,
// entries chưa). Filter winAmount:0 chỉ nằm ở thao tác PATCH.
const jackpotLines = await this.lineRepo.getAllJackpotLines(drawId, jackpotTier);

if (jackpotLines.length === 0) {
  return { patchedCount: 0, totalPrizeDistributed: 0, perEntryAmounts };
}

// Bước 2–4 giữ nguyên công thức, chỉ đổi nguồn dữ liệu:
// totalBetUnits = Σ(betCount của MỌI line JP toàn kỳ) — bất biến qua retry.
```

Bước 5 (patch song song) giữ nguyên. Đồng thời sửa header comment PIPELINE/IDEMPOTENT (rule code-quality §4): thêm mệnh đề "mẫu số đọc từ TẤT CẢ line JP → retry-safe; filter chưa-patch chỉ áp ở bước ghi".

Sửa Lỗi 3 trong `execute`: gate `jackpotPatches` + `winners` theo **`result.perEntryAmounts.size > 0`** (deterministic) thay vì `jpNEntriesPatched > 0`:

```ts
if (hasJackpot1Winner && jp1PerEntryAmounts.size > 0) {
  jackpotPatches.push({ tier: PrizeTier.Jackpot1, prizeAmount: totalJp1 });
}
```

(`patchSettleSummaryJackpot` là `$set` idempotent — ghi lại khi retry vô hại; `jpNEntriesPatched` giữ trong output làm metric log, không còn là điều kiện nghiệp vụ.)

### File 3 — `packages/game-power655-application/src/infras/repos/entry-repo.ts`

1. `patchJackpotPrizePerEntry`: đổi fallback nguy hiểm `prizeInfo ?? 0` → **SKIP** entry không có trong `perEntryAmounts` (không đưa vào `ops`), kèm `console.warn` — tránh ghi `unitAmount: 0, amount: 0` đè lên entry trúng JP (Lỗi 2). Sau fix File 1–2 map luôn đủ key nên nhánh này là defensive-only; comment ghi rõ.
2. **XOÁ** `patchJackpotPrize` (dòng 380–453, dead code `@deprecated`, 0 caller).

### KHÔNG đổi

- `findJackpotWinners` / `findJackpot1Winners` / `findJackpot2Winners` — filter `$elemMatch hitCount > 0` không phụ thuộc trạng thái patch.
- Vòng `getEntryById` per winner trong `execute` — N+1 nhưng số winner JP thực tế rất nhỏ (1–3), không đáng đổi trong plan này.
- `setTotalPayout` (re-aggregate từ entries rồi `$set`) — đã idempotent.
- Step Function ASL / handler signature — không đổi.
- Mega 6/45 / Lotto 5/35 — ngoài scope. Mega đã có plan riêng (`mega645-fix-jackpot-betcount.plan.md`). Lotto 5/35 ĐÃ xác minh 06/08 KHÔNG dính lỗ hổng này: `getJackpotLinesForDraw` (line-repo dòng 117–127) đọc TẤT CẢ line JP không filter `winAmount: 0` → mẫu số deterministic sẵn.

---

## 3. Cách review

1. Đối chiếu hunk Bước 1 với chuẩn Mega 6/45 sau fix (`mega645-fix-jackpot-betcount.plan.md` §2 File 1): nguồn mẫu số = TẤT CẢ line JP. Khác biệt cho phép: Power 6/55 có 2 tier (`jackpot1`/`jackpot2`) nên method nhận param `jackpotTier`.
2. Kiểm tra bất biến: `Σ perEntryAmounts.prizeAmount = jackpotPerUnit × totalBetUnits ≤ totalPool` (floor); `Σ line.winAmount (per entry, per tier) = entry.payout.tiers[jackpotN].amount`; chạy `patchJackpotTier` 2 lần → cùng `jackpotPerUnit` + cùng `perEntryAmounts`.
3. Grep sau khi xoá dead code: `patchJackpotPrize\(` và `patchJackpotLineWinAmount\(` trong `game-power655-application` = 0 match (match ở mega645/lotto535 là method của game khác, không đụng).
4. `getJackpotWinningLines` chỉ còn đúng 1 caller: `patchJackpotLinesPerUnit`.
5. Gate `jackpotPatches`/`winners` không còn tham chiếu `modifiedCount`; header comment use case đã cập nhật mệnh đề idempotency mẫu số.
6. `check-types` + không caller nào khác vỡ (mỗi method sửa/xoá chỉ có 1/0 caller — đã grep 06/08).

## 4. Cách test

Thêm `packages/game-power655-application/test/use-cases/patch-jackpot-prize.test.ts` — integration test theo pattern `stats-repos-idempotency.test.ts` (DB thật + `setup-db-guard.ts` + `TEST_DRAW_ID` riêng có prefix test, cleanup `beforeAll`/`afterAll` CHỈ theo drawId test — tuyệt đối không `deleteMany({})`):

1. **Case chuẩn (regression)**: 2 entry × 1 line JP1, betCount 3 và 1 → `totalBetUnits = 4`; entry A nhận `perUnit × 3`; `Σ line.winAmount = entry.amount`; `unitAmount = perUnit`.
2. **Case multi-line (bao)**: 1 entry có 2 line JP1 (betCount 2 + 5) + 1 entry 1 line (betCount 1) → `totalBetUnits = 8`; entry 1 nhận `perUnit × 7`; line-level = `perUnit × 2` và `perUnit × 5`. (Khẳng định thuật toán hiện tại đã đúng — regression cho phần KHÔNG đổi.)
3. **Crash-simulation (test chính của plan)**: seed entries + lines JP → tự patch TRƯỚC toàn bộ lines (giả lập "lines xong, entries chưa" bằng cách gọi thẳng `patchJackpotLinesPerUnit` với perUnit đúng) → chạy `execute` → entries PHẢI được patch đúng số, `winners` PHẢI đầy đủ, `perEntryAmounts.size > 0`. Trước fix: test này FAIL (early-return).
4. **Crash-simulation partial lines**: patch tay 1 trong 3 lines rồi chạy `execute` → `jackpotPerUnit` phải tính trên CẢ 3 lines (mẫu số không co lại); line chưa patch nhận đúng `perUnit × betCount`; không entry nào bị ghi `amount = 0`.
5. **Idempotency thuần**: chạy `execute` 2 lần liên tiếp → lần 2 `modifiedCount = 0` nhưng `winners`/`perEntryAmounts` giống hệt lần 1; `settleSummary` gate vẫn push (deterministic).
6. **JP1 + JP2 cùng kỳ**: 2 tier độc lập, mẫu số tính riêng per tier.

Chạy: `pnpm --filter @megawin/game-power655-application test` + `check-types`.

## 5. Rủi ro & cách test rủi ro

| Rủi ro | Mức | Cách xử lý / test |
|---|---|---|
| Kỳ JP đã settle TRƯỚC fix có dính crash-window không (data sai tồn đọng) | Thấp | Fix chỉ ảnh hưởng settle MỚI. Kiểm tra tồn đọng bằng query đối chiếu: entry có `tiers[jackpotN] {hitCount>0, amount:0}` trên draw đã `Settled` = dấu hiệu Lỗi 1 đã xảy ra → nếu có, resettle kỳ đó (pipeline dùng use case đã fix) |
| `getAllJackpotLines` đọc rộng hơn làm chậm | Rất thấp | Số line JP per kỳ cực nhỏ (winner đếm trên đầu ngón tay); cùng index `{drawId, matchResult.tier}` với query cũ |
| Đổi gate `settleSummary` sang `perEntryAmounts.size` làm ghi lại khi retry | — | `patchSettleSummaryJackpot` là `$set` giá trị tuyệt đối → ghi lại vô hại; test 5 cover |
| Xoá 2 dead method làm vỡ caller ẩn | Rất thấp | Grep 0 caller (06/08); `check-types` toàn package là chốt chặn |
| Lotto 5/35 nghi ngờ dính cùng lỗ hổng | ĐÃ LOẠI TRỪ | Đã review 06/08: `getJackpotLinesForDraw` không filter `winAmount: 0` → mẫu số + `betUnitsByEntry` deterministic sẵn. Không cần plan riêng |
| Test integration chạy trên DB thật | Trung bình | `setup-db-guard.ts` đã chặn URI non-local; test CHỈ cleanup theo `TEST_DRAW_ID` prefix riêng, không `deleteMany({})` (bài học sự cố tenant config 06/08) |
