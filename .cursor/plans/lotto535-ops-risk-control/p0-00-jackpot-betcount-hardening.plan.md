# p0-00 — Hardening: Jackpot/Split betCount — sửa comment sai + fallback + regression test

> **Nguồn:** review chéo `.cursor/plans/mega645-ops-risk-control/mega645-fix-jackpot-betcount.plan.md` (06/08/2026) đối chiếu code settle Lotto 5/35.
> **Phase:** P0 · **Thứ tự:** 00 — ĐỘC LẬP với chuỗi ops-risk-control, merge được sớm nhất (chỉ đụng settle pipeline).
> **Package đích:** `packages/game-lotto535-application` (settle use-cases + repos).

## Kết luận review chéo — Lotto 5/35 KHÔNG dính 4 lỗi tiền của Mega 6/45

Đối chiếu từng lỗi (bằng chứng đọc code 06/08/2026):

| Lỗi Mega 6/45 | Lotto 5/35 | Bằng chứng |
|---|---|---|
| Lỗi 1 — `Map.set()` ghi đè betCount → `totalBetUnits` thiếu, chia sai tỷ lệ | **KHÔNG dính** | `patch-jackpot-prize.ts` dòng 106: `totalBetUnits = jpLinesData.reduce((sum, l) => sum + l.betCount, 0)` trên TẤT CẢ JP lines; dòng 117–122: `betUnitsByEntry` CỘNG DỒN (`(get ?? 0) + line.betCount`) |
| Lỗi 2 — patch line dùng betCount cấp ENTRY → Σ line ≠ entry | **KHÔNG dính** | `line-repo.ts` `patchJackpotLineWinAmount` dòng 153–156: mỗi line dùng `line.betCount` của CHÍNH nó |
| Lỗi 3 — `unitAmount` ghi bằng TỔNG tiền entry | **KHÔNG dính** | `entry-repo.ts` dòng 1296: `unitAmount: jackpotPerUnit`, `amount: prizeAmount` — đúng chuẩn Power 6/55 |
| Lỗi 4 — dead code `patchJackpotPrize` per-winner cũ | **KHÔNG dính** | entry-repo chỉ có 2 method jackpot (`findJackpotWinners`, `patchJackpotPrize` per-unit) — đều có caller |
| (Rủi ro phụ Mega 6/45 §5) Power 6/55 idempotency: mẫu số từ lines chưa-patch → retry sau crash ra 0 | **KHÔNG dính** | `getJackpotLinesForDraw` load TẤT CẢ JP lines (KHÔNG filter `winAmount: 0`) → mẫu số deterministic khi retry ✓ |

**Split Cycle (cơ chế riêng của game) cũng đúng:** `calculate-financials.ts` dòng 121–125 mẫu số = `settleSummary.tierBetUnitCounts` (Σ betCount per tier); `apply-split-bonuses.ts` dòng 95–103 build `betUnitsByEntry` cộng dồn per-line; `applySplitBonusForTier` patch `bonusPerUnit × betUnits`.

## NHƯNG tồn tại 4 rủi ro cấp thấp hơn — đúng loại "mầm bệnh" đã sinh ra bug Mega 6/45

### V1 — Comment/JSDoc mô tả SAI logic (nghiêm trọng nhất — vi phạm code-quality §4)

Code đã đúng per-unit nhưng comment vẫn kể chuyện per-winner cũ. Người sửa code sau đọc comment sẽ "sửa cho khớp comment" → tái sinh đúng Lỗi 1 của Mega 6/45:

1. `patch-jackpot-prize.ts` **header dòng 16–22**: ghi `jackpotPerWinner = floor(totalJackpotPrize / winnerCount)` + "Nhiều winner → chia đều" — SAI, code chia per-unit theo betCount.
2. `patch-jackpot-prize.ts` **Bước 2 dòng 86–104**: khối comment dài chứa mệnh đề SAI "Vì 1 entry chỉ có 1 JP line" (chính là giả định sai của Mega 6/45 — 1 entry multi-board CÓ THỂ nhiều JP line) + đoạn "xấp xỉ đúng khi hitCount = 1" mô tả approach CŨ đã bỏ.
3. `entry-repo.ts` **dòng 1134–1140**: JSDoc MỒ CÔI (2 khối JSDoc chồng nhau trước `applySplitBonusForTier`) — khối đầu ghi "fallback = 1 (backward compat)" mâu thuẫn code thật (fallback `betUnitCount ?? hitCount`).
4. Header IDEMPOTENT dòng 44 nhắc `patchJackpotPrize: chỉ update entries có tiers[jackpot].amount = 0` — đúng, giữ; nhưng dòng 16–22 phải viết lại theo per-unit.

### V2 — Fallback chain im lặng trong 2 repo method

`entry-repo.ts` dòng 1289 (`patchJackpotPrize`) và dòng 1188 (`applySplitBonusForTier`): `betUnitsByEntry?.get(entryId) ?? tier.betUnitCount ?? hitCount` với param map **optional**. Rủi ro: (a) caller mới quên truyền map → rơi xuống fallback không cảnh báo; (b) key mismatch (entryId string hoá khác nhau) → silently fallback → tiền LỆCH so với mẫu số `totalBetUnits` đã tính từ lines. Fallback cuối `hitCount` chỉ đúng khi mọi line betCount = 1.

### V3 — `winners[].prizeAmount` fallback lệch với tiền entry thực nhận

`patch-jackpot-prize.ts` dòng 141–148: `prizeAmount = jackpotPerUnit × (entryBetUnits || hitCount)` — fallback `hitCount` KHÁC fallback của entry-repo (`betUnitCount ?? hitCount`). Edge case lines thiếu → `JackpotCycleDoc.winners` ghi số tiền khác số entry được patch (FinalizeSettle nhận winners từ output này).

### V4 — Chưa có regression test multi-board multi-line JP + split

Không có `test/use-cases/patch-jackpot-prize.test.ts` — đúng case đã phát hiện bug Mega 6/45 (2 board cùng phủ bộ trúng, betCount khác nhau). Code đúng hôm nay nhưng không có lưới bảo vệ khi refactor.

## File & thay đổi

### 1. SỬA `src/use-cases/settle/patch-jackpot-prize.ts` — CHỈ comment, KHÔNG đổi logic

- Header LOGIC (dòng 14–22): viết lại Bước 2 theo per-unit: `totalBetUnits = Σ(line.betCount) mọi JP line toàn kỳ; jackpotPerUnit = floor(totalJackpotPrize / totalBetUnits); entry nhận jackpotPerUnit × Σ betCount các JP line của entry`. Thêm dòng: "Mỗi BOARD phủ bộ trúng sinh 1 JP line với betCount riêng — entry multi-board CÓ THỂ có nhiều JP line (bài học bug Mega 6/45, plan `mega645-fix-jackpot-betcount`)."
- Khối comment Bước 2 (dòng 86–104): XOÁ toàn bộ đoạn kể approach cũ ("Vì 1 entry chỉ có 1 JP line…", "xấp xỉ đúng…", "99%+ cases…") — thay bằng 4–5 dòng mô tả đúng code hiện tại: đọc TẤT CẢ JP lines (không filter `winAmount: 0` → mẫu số deterministic khi retry sau crash — điểm Lotto 5/35 đúng hơn Power 6/55, ghi rõ để không ai "đồng bộ ngược" filter vào).
- Bước 3 (dòng 115–122): comment map cộng dồn ghi rõ "CỘNG DỒN — entry multi-board nhiều JP line, KHÔNG `set()` ghi đè".

### 2. SỬA `src/use-cases/settle/patch-jackpot-prize.ts` — thống nhất nguồn số cho `winners` (V3)

Dòng 137–152: build `winners[].prizeAmount` từ **CHÍNH `betUnitsByEntry`** đã dùng để patch entry (`jackpotPerUnit × (betUnitsByEntry.get(e.id) ?? 0)`) thay vì filter lại `jpLinesData` + fallback `|| hitCount`. Một nguồn số duy nhất → winners luôn khớp tiền entry được patch. (Tiện thể bỏ vòng `filter` O(entries × lines).) Nếu `betUnitsByEntry.get(e.id)` là 0/undefined với 1 winner → đây là bất thường dữ liệu (entry có jp tier nhưng không có JP line) — log warn qua logger hiện hành của use-case, KHÔNG im lặng.

### 3. SỬA `src/infras/repos/entry-repo.ts` — siết fallback + dọn JSDoc (V2 + V1.3)

- `patchJackpotPrize` (dòng 1252): đổi param `betUnitsByEntry?` → **BẮT BUỘC** (bỏ `?`) — caller duy nhất là use-case đã luôn truyền. Fallback thu về 1 tầng: `betUnitsByEntry.get(entryId) ?? jpTier?.betUnitCount ?? hitCount` giữ nguyên NHƯNG thêm comment giải thích thứ tự nguồn (map từ lines = chính xác nhất; `betUnitCount` tier doc = snapshot lúc settle, đúng tương đương; `hitCount` = tương thích doc cổ trước khi có `betUnitCount`) — hoặc nếu grep xác nhận mọi entry settle sau khi field `betUnitCount` ra đời thì bỏ hẳn fallback `hitCount` (quyết định lúc implement, ghi lại vào plan).
- `applySplitBonusForTier` (dòng 1154): tương tự — param map bắt buộc, comment thứ tự fallback.
- XOÁ khối JSDoc mồ côi dòng 1134–1140 (2 JSDoc chồng nhau — giữ khối đúng, khối sai "fallback = 1" xoá).

### 4. TẠO `test/use-cases/patch-jackpot-prize.test.ts` (V4 — regression, mirror test plan Mega 6/45)

Theo pattern test hiện có của package (`settle-entries.test.ts`). **Tuân quy tắc DB staging chung của `00-overview.md`**: KHÔNG `deleteMany`/`drop*`; drawId/entryId/accountId ngẫu nhiên (drawId ngày quá khứ xa); assert chỉ trên docs vừa seed; TTL không áp cho collection settle → dùng key random là đủ cách li.

**Case đúng logic:**

1. **Chuẩn (regression)**: 2 entry, mỗi entry 1 board standard trúng, betCount 3 và 1 → `totalBetUnits = 4`; entry A nhận `perUnit × 3`; line khớp entry; `unitAmount = perUnit`.
2. **Multi-board multi-line JP (case bug Mega 6/45)**: 1 entry có board A standard = (M, s) betCount 2 + board B mainCover7 ⊇ M cùng s betCount 5 (2 JP line); 1 entry khác standard betCount 1 → `totalBetUnits = 8`; entry 1 nhận `perUnit × 7`; line A = `perUnit × 2`, line B = `perUnit × 5`; **Σ line winAmount = entry.payout.tiers[jackpot].amount**; `winners[0].prizeAmount = perUnit × 7` (khớp mục 2).
3. **specialCover sinh JP line**: board specialCover 5 chính = M, specials chứa s, betCount 4 → JP line betCount 4 tính vào mẫu số.
4. **Split path** (`apply-split-bonuses`): 1 entry trúng tier1 qua 2 board (2 line tier1, betCount 2+3) → bonus = `bonusPerUnit × 5`; tier push có `isSplitBonus: true`, `unitAmount = bonusPerUnit`.

**Case logic ngược/sai:**

5. **Idempotency/retry**: chạy `execute` 2 lần → mọi số KHÔNG đổi; giả lập crash giữa chừng (patch lines xong, entry chưa) → chạy lại vẫn patch entry đủ tiền (mẫu số deterministic — điểm thiết kế đúng cần khoá bằng test).
6. Split chạy 2 lần → không push tier `isSplitBonus` trùng, `winAmount` không double (`$nor` guard).
7. `totalBetUnits` hụt giả lập (map thiếu 1 entryId) → hành vi theo mục 2 (log warn, prizeAmount 0 cho winner đó — không NaN/undefined).

## Cách review (sau khi implement)

1. Diff logic: mục 1 + 3 (JSDoc) KHÔNG được đổi hành vi — chỉ comment/signature; mục 2 là đổi hành vi DUY NHẤT (nguồn số winners) — đối chiếu output trước/sau trên test case 2.
2. Đối chiếu chuẩn Power 6/55 `patchJackpotTier` + plan Mega 6/45 §2: sau plan này 3 game per-unit đồng nhất; khác biệt CHO PHÉP duy nhất của Lotto 5/35 = đọc TẤT CẢ JP lines cho mẫu số (có comment lý do idempotency).
3. Grep hết mệnh đề sai: `rg "1 JP line|chia đều|jackpotPerWinner|xấp xỉ" packages/game-lotto535-application/src/use-cases/settle/patch-jackpot-prize.ts` = 0 match (trừ dòng ghi chú bài học nếu có, viết khác từ khoá).
4. Kiểm bất biến trên test: `Σ perEntry prizeAmount = jackpotPerUnit × totalBetUnits ≤ totalJackpotPrize`; `Σ line.winAmount per entry = entry jp tier amount`; `winners[].prizeAmount` khớp entry patch.
5. Test file: grep `deleteMany|drop` = 0 match (quy tắc staging DB).

## Rủi ro & cách test rủi ro (review đề phòng)

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | "Sửa comment" nhưng lỡ tay đổi logic Bước 2 | Test case 1–4 viết TRƯỚC khi sửa (pass trên code hiện tại) → sửa xong vẫn pass y nguyên. |
| R2 | Đổi param map thành bắt buộc làm vỡ caller khác | Grep caller từng method (hiện mỗi method 1 caller trong settle use-case); `check-types` toàn package là chốt chặn. |
| R3 | Đổi nguồn số winners (mục 2) làm lệch `JackpotCycleDoc.winners` với data cũ | Chỉ ảnh hưởng settle MỚI; test case 2 khẳng định winners = entry patch. Data quá khứ không đụng (không migration). |
| R4 | Bỏ nhầm fallback `hitCount` khi vẫn còn entry cổ thiếu `betUnitCount` | Quyết định bỏ/giữ PHẢI kèm bằng chứng grep + query staging (đếm entry có jp tier thiếu `betUnitCount`); nghi ngờ → GIỮ fallback + comment. |
| R5 | Test seed đè kỳ thật trên staging | drawId ngày quá khứ xa + random suffix; review test 0 drawId "hôm nay". |

## Định nghĩa Done

Test 7 case pass (case 2 là lưới regression chống tái sinh bug Mega 6/45), comment/JSDoc hết mệnh đề per-winner/1-line-per-entry, winners dùng 1 nguồn số với entry patch, `check-types` + test toàn package pass, cập nhật bảng trạng thái `00-overview.md`.
