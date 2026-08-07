# p1-01 — Minh bạch chia jackpot + cơ chế split cho player (combo popularity, ownership-gated)

> **Nguồn:** `.cursor/analysis/lotto535-operations-risk-control.analysis.md` §3.10 (đã chốt sau kiểm tra luật settle 05/08 + đánh giá performance 06/08 — Q7)
> **Phase:** P1 · **Thứ tự:** 01 · **Phụ thuộc:** p0-02 (combo-stats data đầy), p0-03 (P0 chạy ổn).
> **Package đích:** `packages/game-lotto535-application` + `apps/api-player` + `packages/player-sdk`.

## Mục tiêu

Player tự kiểm tra "bộ số tôi đã cược có bao nhiêu đơn vị cùng tham gia" — **CHỈ bộ account thực sự có entry trong kỳ** (ownership-gate nghiêm ngặt). Lý do (kiểm tra settle §3.10): (1) JP chia theo betCount trên toàn bộ line trúng (`jackpotPerUnit = floor(pool / totalBetUnits)`); (2) **kỳ SPLIT** chia pool xuống tier1–5 theo `tierBetUnitCounts` toàn kỳ — cơ chế RIÊNG của Lotto 5/35, KHÔNG có mẫu số tính trước → response chỉ MÔ TẢ cơ chế, không trả con số dự tính. Giải cố định kỳ thường không cap/chia — không cần minh bạch.

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File tham chiếu |
|---|---|
| Plan mẫu + chứng minh toán | `../power655-ops-risk-control/p1-01-combo-transparency.plan.md` (mục "Xác minh công thức toán") |
| Player use-case | `packages/game-keno-application/src/use-cases/player/get-combo-popularity.ts` (hoặc bản Power 6/55 nếu đã done — ưu tiên) — ownership-gate + `{found:false}` đồng nhất |
| Ownership repo method | `EntryRepository.getBoardsByAccountDraw` (projection 2 field, loại `Void`) |
| Player handler | `apps/api-player/src/handlers/keno/get-combo-popularity.ts` (Zod CSV numbers, `withPlayerAuth`) |
| player-sdk | `packages/player-sdk/src/keno/types.ts` + `apis/keno.ts` + `endpoints.ts` — theo Release Checklist rule `player-sdk-jsdoc.mdc` |

## Khác Keno/Power 6/55 — PHẢI giữ đúng (analysis §3.10)

1. `sets` cùng comboKey là **tín hiệu tham khảo** (jackpot chia per-draw, không per-combo) — JSDoc SDK không hứa "đây là mẫu số chia".
2. **`jackpotUnits` khi combo tra là bộ CHUẨN (5 chính M + 1 ĐB s)** — 4 nhánh coverage (KHÁC Power 6/55 3 nhánh — có thêm chiều special):
   - `standard`: `mainNumbers = M` AND `specialNumbers = [s]` → **1 exact lookup** comboKey, O(1).
   - `mainCover4`: `mainNumbers (4 số) ⊂ M` AND `specialNumbers = [s]` → **C(5,4) = 5 exact lookup** các key `mainCover4:<tập con 4 của M>|s`. (Bài học Power 6/55: phủ `⊂` KHÔNG bắt được bằng `$all` — enumerate tập con.)
   - `mainCover` (N=6–15): `mainNumbers ⊇ M` AND `specialNumbers = [s]` → **1 query** `{drawId, playType: PlayType.MainCover, mainNumbers: {$all: M}, specialNumbers: [s]}` trên index `{drawId, playType, mainNumbers}` (p0-01) — bound theo playType.
   - `specialCover`: `mainNumbers = M` (exact) AND `s ∈ specialNumbers` (multikey membership) → **1 query** `{drawId, playType: PlayType.SpecialCover, mainNumbers: M, specialNumbers: s}`.
   - Mỗi nguồn: `betCount = sets / expandedLines[playType/N/K]` (nguyên vì expandedLines là hằng); `jackpotUnits = Σ betCount` cả 4 nhánh.
3. **Split KHÔNG có mẫu số tính trước** — response/JSDoc SDK mô tả cơ chế: "kỳ 21h nếu JP ≥ 12 tỷ và không ai trúng JP, toàn bộ pool chia tier1–5 theo đơn vị dự thưởng trúng từng tier (chỉ biết sau khi quay); tiền chia làm tròn xuống 5.000đ". Trả flag mô tả (vd `splitEligibleDraw: boolean` — kỳ 21h, copy điều kiện `drawNo` từ `isSplitCycleDraw`, KHÔNG tự chế điều kiện), KHÔNG con số dự tính.
4. Mọi playType đều tra được. Validate input: `numbers` (main) 4–15 số distinct `"01".."35"` + `specials` 1–12 số distinct `"01".."12"`, tổ hợp phải khớp 1 playType hợp lệ (5+1 standard, 4+1 mainCover4, 6–15+1 mainCoverN, 5+2..12 specialCover) — sai → 400.
5. **Mitigation performance (Q7 — ghi sẵn, bật khi cần):** endpoint on-demand không timer; nếu tải thật thành vấn đề → rate-limit per account trên route + cache ngắn theo `(drawId, comboKey)` 30–60s khi draw còn mở bán. KHÔNG pre-compute coverage collection (C(35,5)×12 ≈ 3,9tr bộ/kỳ — phi kinh tế).

## Xác minh công thức toán (BẮT BUỘC thực hiện lại khi implement — đối chiếu code production, KHÔNG diverge)

Chứng minh `jackpotUnits(M, s)` = mẫu số chia JP khi bộ chuẩn (M, s) trúng:

1. **Mẫu số thật khi settle** (`patch-jackpot-prize.ts` lotto535): lines trúng JP = line có 5 chính == M và ĐB == s; `totalBetUnits = Σ(line.betCount)`; `jackpotPerUnit = floor(pool / totalBetUnits)`. Phần lẻ floor giữ lại quỹ — JSDoc SDK ghi "phần của bạn = floor(pool / jackpotUnits) × betCount".
2. **Mỗi board phủ (M, s) đóng góp ĐÚNG 1 line == (M, s)** (đối chiếu `rules/play-types.ts` cách expand lines từng playType — viết chứng minh ngắn trong JSDoc repo method):
   - `standard`: chính nó — 1 line.
   - `mainCover4` (4 số + ghép lần lượt 31 số còn lại): có line == (M, s) ⟺ 4 số ⊂ M và ĐB = s; line = 4 số + phần tử còn lại của M — đúng 1.
   - `mainCover` N (C(N,5) tổ hợp 5 chính, ĐB cố định): có line ⟺ mainNumbers ⊇ M và ĐB = s — đúng 1 (chọn đúng tập M).
   - `specialCover` (5 chính cố định × K ĐB): có line ⟺ mainNumbers = M và s ∈ specialNumbers — đúng 1 (line với ĐB = s).
   - → `jackpotUnits(M, s) = Σ betCount các board phủ = totalBetUnits` khi (M, s) trúng. ✓
3. **Suy `Σ betCount` từ combo doc**: `sets` = `Σ(expandedLines × betCount)` các board cùng key (accumulator p0-02, khớp `betUnitsPerDraw` place-bet); `expandedLines` là hằng theo (playType, N, K) — với `specialCover` chú ý `expandedLines = K = specialNumbers.length` của CHÍNH combo doc đó (đọc từ doc, không tra bảng tĩnh); `mainCover` → `C(mainNumbers.length, 5)` từ domain rules. `sets / expandedLines` luôn nguyên = `Σ betCount`. ✓
4. **Giá 1 board** (`boardPrice = unitPrice × expandedLines`, betCount=1, 1 kỳ): standard 10k · mainCover4 310k · mainCover6 60k … mainCover15 30,03tr · specialCover K×10k (tối đa 120k). Response player lẫn BO combo-lookup dialog hiển thị kèm giá này, ghi chú "giá theo config hiện tại — entry cũ snapshot unitPrice riêng".
5. **Giới hạn ngữ nghĩa**: `jackpotUnits` tại thời điểm tra (bán tiếp → chỉ tăng; void → có thể giảm trễ theo watermark — nêu trong JSDoc); áp cho JP. Split KHÔNG suy được trước giờ quay (mục 3 trên).

## File & thay đổi

### 1. `packages/game-lotto535-application`

- SỬA `src/infras/repos/entry-repo.ts` — thêm `getBoardsByAccountDraw(accountId, drawId)`: filter `{accountId, drawId, status: {$ne: Void}}`, projection CHỈ `entrySummary.boards.playType` + `.mainNumbers` + `.specialNumbers`. Chạy trên index `{drawId, accountId}` (p0-01). JSDoc: mục đích ownership-gate + index hint.
- SỬA `src/infras/repos/combo-stats-repo.ts` — thêm `sumJackpotUnitsForStandardSet(drawId, main5, special1)`: hiện thực 4 nhánh mục "Khác Keno" (2): batch exact lookup 6 comboKey (1 standard + 5 mainCover4) qua `find({drawId, comboKey: {$in: keys}})` + query `$all` nhánh mainCover + query membership nhánh specialCover; chia app-side `sets / expandedLines` (KHÔNG đổi schema combo doc). JSDoc: công thức 4 nhánh + chứng minh ngắn mục "Xác minh" (2)–(3) + index hint.
- TẠO `src/use-cases/player/get-combo-popularity.ts` — `GetComboPopularityPlayerUseCase`, copy khung Keno/Power 6/55 nguyên vẹn:
  - Validate: tổ hợp (main, special) khớp playType hợp lệ, distinct, đúng range — sai → 400.
  - Ownership-gate: build tập comboKey từ boards account sở hữu qua `buildComboKey` (rule p0-01 — TÁI DÙNG); combo không thuộc account → `{found: false}` **đồng nhất** (JSDoc class copy khối giải thích chống dò).
  - Sở hữu → đọc combo doc → `{found: true, sets, boardPrice, splitEligibleDraw}`; nếu bộ CHUẨN (5+1) → thêm `jackpotUnits` qua `sumJackpotUnitsForStandardSet`. KHÔNG trả `amount`/`accountId`/`username`.
- SỬA `dto/player.dto.ts` + barrel `use-cases/player/index.ts`.

### 2. `apps/api-player`

- TẠO `src/handlers/lotto535/get-combo-popularity.ts` — copy handler Keno: `GET /games/lotto535/draws/{drawId}/combo-popularity`, `withPlayerAuth`, Zod path `drawId` + query `numbers` CSV `"01".."35"` (4–15 số) + `specials` CSV `"01".."12"` (1–12 số). Đăng ký route theo cơ chế routing hiện hành của app.

### 3. `packages/player-sdk` (theo Release Checklist `player-sdk-jsdoc.mdc` — JSDoc đầy đủ BẮT BUỘC)

1. `src/lotto535/types.ts` — thêm `Lotto535ComboPopularityParams {drawId; numbers; specials}` + `Lotto535ComboPopularityResponse {found; sets?; boardPrice?; jackpotUnits?; splitEligibleDraw?}`. JSDoc từng field: drawId `YYYY-MM-DD.NNN`; numbers/specials zero-padded + range; `found=false` = "chưa cược bộ này HOẶC bộ chưa ai chơi — cố ý không phân biệt"; `sets` tín hiệu tham khảo; `boardPrice` (VND) theo config hiện tại; `jackpotUnits` CHỈ khi tra bộ chuẩn 5+1 + công thức `floor(pool / jackpotUnits) × betCount`; `splitEligibleDraw` + **đoạn mô tả cơ chế split** (điều kiện 12 tỷ + kỳ 21h + chia tier1–5 theo đơn vị + rounding 5.000đ — không có con số dự tính). `@example` cho cả 2 type.
2. `src/endpoints.ts` — `getComboPopularity: (drawId) => …/combo-popularity` trong key `lotto535`.
3. `src/apis/lotto535.ts` — method `getComboPopularity(params)` trong `Lotto535Api`: JSDoc summary + `**Endpoint:**` + `@param`/`@returns`/`@throws {@link ApiClientError}` + `@example` hoàn chỉnh + đoạn ownership-gate + đoạn khác biệt `sets` vs `jackpotUnits` vs split.
4. `src/index.ts` — re-export 2 type mới từ `./lotto535`.
5. `CHANGELOG.md` — đối chiếu `package.json` vs entry mới nhất: version chứa `getComboPopularity` (Keno/Power 6/55) CHƯA release → **ghi TIẾP vào entry đó**, KHÔNG entry mới, KHÔNG bump (quy tắc template §3.10(6)). Lời văn theo chuẩn rule.
6. `pnpm --filter @megawin/player-sdk docs:build` — TypeDoc render sạch.

## Không làm

- KHÔNG cho tra combo chưa cược (chống probing). KHÔNG 403/404 phân biệt — `{found:false}` đồng nhất. KHÔNG trả amount/accountId/username. KHÔNG trả con số split dự tính (chỉ mô tả cơ chế). KHÔNG pre-compute coverage collection. KHÔNG tái dùng use-case staff `combo-lookup` cho player. KHÔNG bật rate-limit/cache ngay (ghi chú, bật khi cần — Q7).

## Cách review (sau khi implement)

1. Diff đối chiếu use-case với Keno/Power 6/55 `get-combo-popularity.ts` — logic gate/`{found:false}` giống hệt; khác biệt CHỈ ở validate playType 4 nhánh + `jackpotUnits` 4 nhánh + `splitEligibleDraw`.
2. Kiểm response: grep DTO player — KHÔNG có field `amount|accountId|username` trong output.
3. Kiểm công thức `jackpotUnits` đối chiếu `patch-jackpot-prize.ts` lotto535: mẫu số chia là `totalBetUnits` — xác nhận tổng 4 nhánh đúng bằng con số đó khi (M, s) trúng (chứng minh ngắn trong JSDoc). Đặc biệt kiểm 2 nhánh dễ sai: **mainCover4** (phủ `⊂` — enumerate 5 tập con, không `$all`) và **specialCover** (`expandedLines = K` đọc từ CHÍNH doc, không tra bảng tĩnh).
4. Kiểm điều kiện `splitEligibleDraw` copy đúng từ `isSplitCycleDraw` (`rules/jackpot.ts`) — không tự chế điều kiện; và response KHÔNG chứa con số split dự tính nào.
5. SDK: checklist `player-sdk-jsdoc.mdc` từng mục (types → endpoints → apis → index → CHANGELOG → docs:build); JSDoc có ownership-gate + mô tả split; CHANGELOG ghi TIẾP entry chưa release.
6. `explain()` nhánh `$all` mainCover → IXSCAN trên `{drawId, playType, mainNumbers}` bound theo playType (docsExamined chỉ doc mainCover), không COLLSCAN, không quét combo standard. Tương tự nhánh specialCover.

## Cách test

```bash
pnpm --filter @megawin/game-lotto535-application check-types && pnpm --filter @megawin/game-lotto535-application test
pnpm --filter @megawin/api-player check-types
pnpm --filter @megawin/player-sdk check-types && pnpm --filter @megawin/player-sdk docs:build
```

> **QUY TẮC DB STAGING CHUNG (00-overview):** cấm delete/drop; seed combo/account/draw bằng key ngẫu nhiên (drawId ngày quá khứ xa + random); mỗi test assert trên doc mình seed; TTL tự dọn.

Unit tests viết mới (`test/use-cases/get-combo-popularity.test.ts` — integration staging-safe):

**Đúng logic:**

1. Account cược standard (M, s) → tra đúng bộ: `{found:true, sets, boardPrice: 10000, jackpotUnits}` — seed thêm từ account khác: 1 board **mainCover7 ⊇ M cùng s**, 1 board **mainCover4 có 4 số ⊂ M cùng s**, 1 board **specialCover main = M có s trong specials** → `jackpotUnits` cộng đủ CẢ 4 nguồn, mỗi nguồn đúng betCount.
2. Account cược mainCover9 → tra đúng 9 số + 1 ĐB của mình: `{found:true, sets, boardPrice: C(9,5)×10k = 1.260.000}` KHÔNG có `jackpotUnits` (không phải bộ chuẩn 5+1).
3. Account cược specialCover K=3 → tra đúng 5 chính + 3 ĐB: `{found:true, boardPrice: 30.000}`; `betCount` suy từ `sets/3` đúng.
4. 2 board cùng key betCount 3 và 5 → nguồn đó đóng `units = 8` (R4 chia expandedLines nguyên).

**Logic ngược/sai:**

5. Tra bộ CHƯA cược (nhưng người khác có chơi) → `{found:false}` — response **deep-equal** case bộ không tồn tại (test 6).
6. Tra bộ không ai chơi → `{found:false}`.
7. Seed mainCover7 KHÔNG ⊇ M (thiếu 1 số của M) và mainCover4 có 4 số KHÔNG ⊂ M và specialCover main ≠ M → cả 3 KHÔNG được cộng vào `jackpotUnits`.
8. specialCover có main = M nhưng s ∉ specialNumbers → KHÔNG tính.
9. Input sai: 3 số main / 16 số main / trùng số / main ngoài "01".."35" / special ngoài "01".."12" / 6 main + 2 special (không khớp playType nào) → 400.
10. Entry đã Void → không tính là sở hữu → `{found:false}`.
11. Combo doc chưa kịp có (worker lag) dù sở hữu → `{found:false}` đồng nhất, không throw.

## Rủi ro & cách test rủi ro (review đề phòng)

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | **Oracle dò bộ số hệ thống** (phân biệt "có người chơi" vs "không tồn tại") | Test 5 vs 6: response giống hệt (deep-equal shape + status code). Review: không nhánh code nào trả khác nhau. |
| R2 | **`jackpotUnits` sai công thức** → player kiện ngược khi settle chia khác con số đã xem | Test 1 + 7 + 8 phủ đủ 4 nhánh cả chiều dương lẫn âm — đối chiếu tay với `jackpotPerUnit` của `patch-jackpot-prize.ts` trên cùng data. 2 nhánh nguy hiểm nhất: mainCover4 `⊂` (enumerate) và specialCover membership. JSDoc ghi "units tại thời điểm tra". |
| R3 | Nhầm chiều special khi build key tra cứu (copy Power 6/55 vốn không có special) | Test 8 + test combo-key p0-01. Review: mọi key build qua `buildComboKey` — grep 0 chỗ tự nối chuỗi. |
| R4 | `sets/expandedLines` không nguyên (lệch mẫu) | Bản chất luôn nguyên (expandedLines hằng theo playType/N/K); test 4. Nếu implement gặp số lẻ → BUG accumulate, dừng điều tra, không làm tròn che lỗi. |
| R5 | Ownership-gate query chậm (account nhiều entry) | Index `{drawId, accountId}` (p0-01) + projection 3 field; `explain` IXSCAN. |
| R6 | SDK breaking change vô tình | Chỉ THÊM type/method; CHANGELOG ghi tiếp entry chưa release; `docs:build` pass; không đụng type hiện hữu. |
| R7 | Nhánh `$all`/membership quét rộng kỳ lớn (Q7) | Đã chặn từ thiết kế: query trên combo_stats (không phải entries), index prefix `playType`. Test rủi ro: seed nhiều combo standard (key random) + vài combo mainCover → `explain` docsExamined ≈ số combo mainCover, không phụ thuộc số combo standard. Mitigation rate-limit/cache ghi sẵn mục "Khác Keno" (5) — bật khi cần. |
| R8 | Mô tả split trong SDK SAI điều kiện (tự chế thay vì copy `isSplitCycleDraw`) → player hiểu nhầm cơ chế | Review mục 4: điều kiện trong JSDoc/flag đối chiếu từng vế với `rules/jackpot.ts` (`splitThreshold` 12 tỷ, không ai trúng JP, kỳ 21h, rounding 5.000đ). |

## Định nghĩa Done

Player xem được độ đông bộ số **đã cược** (+ `jackpotUnits` nếu bộ chuẩn 5+1, + mô tả cơ chế split), combo lạ luôn `{found:false}` đồng nhất, SDK JSDoc + CHANGELOG đầy đủ (TypeDoc sạch), không rò dữ liệu, 11 case test pass (staging-safe, không xoá data), cập nhật `00-overview.md`.
