# p1-01 — Minh bạch chia jackpot cho player (combo popularity, ownership-gated)

> **Nguồn:** `.cursor/analysis/mega645-operations-risk-control.analysis.md` §3.10 (đã chốt 06/08 sau kiểm tra luật settle)
> **Phase:** P1 · **Thứ tự:** 01 · **Phụ thuộc:** **`mega645-fix-jackpot-betcount.plan.md` ĐÃ MERGE** (Q3 — prerequisite cứng), p0-02 (combo-stats data đầy), p0-03 (P0 chạy ổn).
> **Package đích:** `packages/game-mega645-application` + `apps/api-player` + `packages/player-sdk`.

## Mục tiêu

Player tự kiểm tra "bộ số tôi đã cược có bao nhiêu bộ cùng cược" — **CHỈ bộ số account thực sự có entry trong kỳ** (ownership-gate nghiêm ngặt). Lý do (kiểm tra settle §3.10): jackpot Mega 6/45 **chia theo betCount trên toàn bộ line trúng** (`jackpotPerUnit = floor(pool / totalBetUnits)` — `patch-jackpot-prize.ts`) → khi jackpot bị chia, player cần con số kiểm chứng được. Giải cố định tier1/2/3 KHÔNG cap/chia — không cần minh bạch. Không có Split Cycle (đã xác minh §3.10) — response KHÔNG mô tả split.

**Prerequisite cứng:** bug chia jackpot multi-board (Q3) PHẢI được fix trước — sau fix, `jackpotUnits` từ combo_stats mới khớp chính xác `totalBetUnits` của công thức chia; response minh bạch KHÔNG tự "bù" theo bug (analysis §3.10-3).

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File mẫu |
|---|---|
| Plan mẫu | `../power655-ops-risk-control/p1-01-combo-transparency.plan.md` (gồm mục "Xác minh công thức toán") + `../keno-ops-risk-control/p1-01-combo-transparency.plan.md` (bài học bỏ `players`) |
| Player use-case | `packages/game-power655-application/src/use-cases/player/get-combo-popularity.ts` (nếu Power 6/55 p1-01 đã xong — ưu tiên; chưa xong thì Keno `get-combo-popularity.ts`) |
| Ownership repo method | `EntryRepository.getBoardsByAccountDraw` (Keno `entry-repo.ts` ~166 — projection 2 field, loại `Void`) |
| Player handler | `apps/api-player/src/handlers/keno/get-combo-popularity.ts` (Zod CSV numbers, `withPlayerAuth`) |
| player-sdk | `packages/player-sdk/src/{keno,power655}/types.ts` + `apis/` + `endpoints.ts` — theo Release Checklist rule `player-sdk-jsdoc.mdc` |

## Khác Power 6/55 — chỉ 3 điểm adapt (analysis §6 verdict: keep toàn bộ thiết kế)

1. **Single jackpot**: `jackpotUnits` áp cho jackpot DUY NHẤT (không cần ghi chú "chỉ JP1, không suy được JP2" như Power 6/55 — Mega 6/45 không có JP2/bonus). JSDoc SDK đơn giản hơn tương ứng.
2. **bao5 ghép 40 số** (45−5): giá board bao5 = 400k (Power 6/55: 50 số, 500k). Số exact lookup tập con bao5 KHÔNG đổi: C(6,5) = 6.
3. **Field số tên `numbers`** (không phải `mainNumbers`) — theo entity Mega 6/45.

Giữ nguyên từ Power 6/55: `sets` cùng comboKey chỉ là **tín hiệu tham khảo** (jackpot chia per-draw across mọi line trúng, khác Keno cap per-combo) — JSDoc SDK phải nói rõ, không hứa "đây là mẫu số chia"; mọi playType đều tra được; validate độ dài khớp playType (5 = bao5, 6 = standard, 7–15 = baoN, 18 = bao18), distinct, `"01".."45"`.

## Xác minh công thức toán (KHÔNG được diverge khi implement)

Chứng minh `jackpotUnits(S)` = mẫu số chia jackpot khi bộ 6 số S trúng (điều kiện: fix Q3 đã merge):

1. **Mẫu số thật khi settle** (`patch-jackpot-prize.ts` SAU FIX): lines trúng JP = lines có 6 số == 6 số quay; `totalBetUnits = Σ(line.betCount)` — cộng dồn per entry qua mọi line (pattern `patchJackpotTier` Power 6/55); `jackpotPerUnit = floor(totalPool / totalBetUnits)`; entry nhận `jackpotPerUnit × entryBetUnits`. **Phần lẻ do floor giữ lại quỹ** — JSDoc SDK ghi "phần của bạn = floor(pool / jackpotUnits) × betCount".
2. **Mỗi board phủ S đóng góp ĐÚNG 1 line == S**:
   - `standard` (numbers = S): chính nó — 1 line.
   - `bao5` (5 số chọn + ghép LẦN LƯỢT 40 số còn lại — `expandBao5`, KHÔNG phải C(N,6)): có line == S ⟺ 5 số chọn ⊂ S, line = 5 số + phần tử còn lại của S — đúng 1.
   - `bao7–18` (C(N,6) tổ hợp): có line == S ⟺ numbers ⊇ S — đúng 1 (chọn đúng tập con S).
   - → `jackpotUnits(S) = Σ betCount các board phủ S = totalBetUnits` khi S trúng. ✓
3. **Suy `Σ betCount` từ combo doc**: `sets` của combo = `Σ(expandedLines × betCount)` các board cùng key (p0-02 accumulator); `expandedLines` là hằng theo playType (standard 1, bao5 **40**, baoN C(N,6), bao18 18564) → `sets / expandedLines` luôn nguyên = `Σ betCount`. Đối chiếu `BAO_COMBINATIONS` (`entities/types.ts`) khớp `PLAY_TYPE_CONFIGS` lúc implement. ✓
4. **Giá 1 board** (`boardPrice`): `unitPrice × expandedLines[playType]` — unitPrice đọc từ game config hiện hành (mặc định 10k), ghi chú "giá hiện tại, entry cũ có thể snapshot giá khác". Bảng giá betCount=1/kỳ: standard 10k · **bao5 400k** · bao7 70k · bao8 280k · bao9 840k · bao10 2,1tr · bao11 4,62tr · bao12 9,24tr · bao13 17,16tr · bao14 30,03tr · bao15 50,05tr · bao18 185,64tr. Response player lẫn BO combo-lookup dialog đều kèm giá này.
5. **Giới hạn ngữ nghĩa**: `jackpotUnits` là con số TẠI THỜI ĐIỂM TRA (bán vé tiếp tục → chỉ tăng, không giảm trừ khi void). Board Bao tra cứu (5, 7–18 số) → chỉ trả `sets` (mẫu số phụ thuộc 6 số được quay — không xác định trước).

## File & thay đổi

### 1. `packages/game-mega645-application`

- SỬA `src/infras/repos/entry-repo.ts` — thêm `getBoardsByAccountDraw(accountId, drawId)`: filter `{accountId, drawId, status: {$ne: Void}}`, projection CHỈ `entrySummary.boards.playType` + `entrySummary.boards.numbers`. Chạy trên index `{drawId, accountId}` (p0-01). JSDoc ghi mục đích ownership-gate + index hint.
- SỬA `src/infras/repos/combo-stats-repo.ts` — thêm `sumJackpotUnitsForStandardSet(drawId, numbers6)`: 3 nhánh (analysis §3.10-3):
  - standard: 1 exact lookup `comboKey = "standard:S"`;
  - bao5: 6 exact lookup các key `"bao5:<tập con 5 của S>"` (batch `find({drawId, comboKey: {$in: keys}})` chung với nhánh standard — 7 key);
  - bao7–18: 1 query `{drawId, playType: {$in: [bao7..bao18]}, numbers: {$all: S}}` trên index `{drawId, playType, numbers}` (p0-01) — bound theo playType, KHÔNG quét biển combo standard.
  - Mỗi nguồn: chia app-side `sets / BAO_COMBINATIONS[playType]` (KHÔNG đổi schema combo doc). JSDoc ghi công thức 3 nhánh + vì sao thương luôn nguyên + index hint.
- TẠO `src/use-cases/player/get-combo-popularity.ts` — `GetComboPopularityPlayerUseCase`, copy khung Power 6/55/Keno nguyên vẹn:
  - Validate: độ dài numbers khớp playType hợp lệ (5/6/7–15/18), distinct, `"01".."45"` — sai → 400 (lỗi client rõ ràng, không lộ data).
  - Ownership-gate: build tập comboKey từ boards account sở hữu qua `buildComboKey` (domain rule p0-01 mục 5 — TÁI DÙNG, không viết lại); combo không thuộc account → trả `NOT_FOUND = {found: false}` **đồng nhất** (JSDoc class copy khối giải thích chống dò).
  - Sở hữu → đọc combo doc → `{found: true, sets, boardPrice}`; nếu combo 6 số standard → tính thêm `jackpotUnits` qua `sumJackpotUnitsForStandardSet`. KHÔNG trả `amount`/`accountId`/`username`.
- SỬA `dto/player.dto.ts` + barrel `use-cases/player/index.ts`.

### 2. `apps/api-player`

- TẠO `src/handlers/mega645/get-combo-popularity.ts` — copy handler Keno: `GET /games/mega645/draws/{drawId}/combo-popularity`, `withPlayerAuth`, Zod path `drawId` (DRAW_ID_REGEX) + query `numbers` CSV zero-padded schema số Mega 6/45 (`"01".."45"`), min 5 max 18. Đăng ký route theo cơ chế routing hiện hành của app.

### 3. `packages/player-sdk` (theo Release Checklist `player-sdk-jsdoc.mdc` — JSDoc đầy đủ BẮT BUỘC)

1. `src/mega645/types.ts` — thêm `Mega645ComboPopularityParams {drawId; numbers}` + `Mega645ComboPopularityResponse {found; sets?; boardPrice?; jackpotUnits?}`. JSDoc từng field: format `YYYY-MM-DD.NNN`, numbers 5–18 số `"01".."45"` zero-padded; `found=false` = "chưa cược bộ này HOẶC bộ chưa ai chơi — cố ý không phân biệt"; `sets` = tín hiệu tham khảo (giải thích jackpot chia per-draw); `boardPrice` (VND) theo config hiện tại; `jackpotUnits` CHỈ có khi tra bộ 6 số standard + công thức `floor(pool / jackpotUnits) × betCount`. `@example` cho cả 2 type.
2. `src/endpoints.ts` — `getComboPopularity: (drawId) => \`/games/mega645/draws/${drawId}/combo-popularity\` as const` trong key `mega645`.
3. `src/apis/mega645.ts` — method `getComboPopularity(params)` trong `Mega645Api`: JSDoc summary + `**Endpoint:**` + `@param`/`@returns`/`@throws {@link ApiClientError}` (`UNAUTHORIZED`) + `@example` hoàn chỉnh + **đoạn ownership-gate** (combo lạ luôn `found:false`, không phải bug) + đoạn khác biệt `sets` vs `jackpotUnits`.
4. `src/index.ts` — re-export 2 type mới từ `./mega645`.
5. `CHANGELOG.md` — **ghi TIẾP vào entry `[1.1.0] - 2026-07-28`** (chứa `getComboPopularity` Keno/Power 6/55), thêm khối `### Added — client.mega645.getComboPopularity`. **KHÔNG tạo entry mới, KHÔNG bump** — 1.1.0 CHƯA release (`package.json` = `1.0.18`, đối chiếu 05/08; quy tắc chung Power 6/55 §3.10-6). Lời văn theo chuẩn rule `player-sdk-jsdoc.mdc`.
6. `pnpm --filter @megawin/player-sdk docs:build` — TypeDoc render sạch.

### 4. UI player (web player app)

Sau khi cược, màn hình vé hiển thị `sets` (+ `jackpotUnits` nếu standard) của bộ số mình, refresh đến giờ đóng bán, chỉ hiện khi `found: true` — copy pattern hiển thị/poll hiện có (nếu player app do tenant tự xây thì mục này chỉ là SDK + doc).

## Không làm

- KHÔNG cho tra combo chưa cược (chống probing). KHÔNG 403/404 phân biệt — `{found:false}` đồng nhất. KHÔNG trả amount/accountId/username. KHÔNG expand lines Bao để tính mẫu số cho board Bao. KHÔNG tái dùng use-case staff `combo-lookup` cho player (minh bạch player PHẢI tách use-case — Keno p0-07). KHÔNG mô tả split trong response (Mega 6/45 không có split — khác Lotto 5/35 tương lai).

## Cách review (sau khi implement)

1. **Xác nhận prerequisite:** fix Q3 đã merge (`patch-jackpot-prize.ts` cộng dồn betCount per entry) — đọc code settle TRƯỚC khi review công thức.
2. Diff đối chiếu use-case với bản Power 6/55/Keno — logic gate/NOT_FOUND giống hệt; khác biệt CHỈ ở {range 45, bao5 40 lines, field `numbers`, single jackpot}.
3. Kiểm response: grep DTO player — KHÔNG có field `amount|accountId|username` trong output.
4. Kiểm công thức `jackpotUnits` đối chiếu `patch-jackpot-prize.ts` SAU FIX: tổng 3 nhánh (standard exact + bao5 6 tập con + bao7–18 `$all`) = `totalBetUnits` khi 6 số này trúng (viết chứng minh ngắn trong JSDoc). Đặc biệt kiểm nhánh **bao5** (phủ theo `⊂`, không bắt được bằng `$all` superset — lỗi thiết kế Power 6/55 từng mắc 05/08).
5. SDK: checklist `player-sdk-jsdoc.mdc` từng mục (types → endpoints → apis → index → CHANGELOG → docs:build); CHANGELOG ghi TIẾP entry `[1.1.0]`, không entry mới.
6. `explain()` nhánh `$all` → IXSCAN trên `{drawId, playType, numbers}` bound theo playType (docsExamined chỉ gồm doc bao7–18), không COLLSCAN.

## Cách test

```bash
pnpm --filter @megawin/game-mega645-application check-types && pnpm --filter @megawin/game-mega645-application test
pnpm --filter @megawin/api-player check-types
pnpm --filter @megawin/player-sdk check-types && pnpm --filter @megawin/player-sdk docs:build
```

Unit tests viết mới (`test/use-cases/get-combo-popularity.test.ts` — staging DB, key duy nhất per-run, **KHÔNG deleteMany** theo 00-overview):

1. **Đúng logic:** Account cược standard 6 số → tra đúng bộ: `{found:true, sets, boardPrice: 10000, jackpotUnits}` — seed thêm 1 board **bao7 chứa đủ 6 số** + 1 board **bao5 có 5 số ⊂ bộ 6** từ account khác → `jackpotUnits` cộng đủ cả 3 nguồn (mỗi nguồn đúng betCount). Seed thêm 1 board bao5 có 5 số KHÔNG ⊂ bộ 6 → KHÔNG được tính.
2. **Logic ngược:** Tra bộ số CHƯA cược (nhưng có người khác chơi) → `{found:false}` — response byte-giống case 3.
3. Tra bộ không tồn tại → `{found:false}`.
4. Account cược bao9 → tra đúng 9 số của mình: `{found:true, sets, boardPrice: 840000}` KHÔNG có `jackpotUnits`.
5. Numbers sai (4 số / 16–17 số / trùng số / ngoài "01".."45") → 400.
6. Entry đã Void → không tính là sở hữu → `{found:false}`.
7. Combo doc chưa kịp có (worker lag) dù sở hữu → `{found:false}` (đồng nhất, không throw).
8. **Đối chiếu chéo với settle (mạnh nhất):** cùng data seed test 1, chạy logic chia của `patch-jackpot-prize` (sau fix) trên bộ line tương ứng → `totalBetUnits` == `jackpotUnits` trả về.

## Rủi ro & cách test rủi ro

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | **Oracle dò bộ số hệ thống** (phân biệt "có người chơi" vs "không tồn tại") | Test 2 vs 3: response giống hệt nhau (deep-equal cả shape lẫn status code). Review: không nhánh code nào trả khác nhau giữa 2 case. |
| R2 | **`jackpotUnits` sai công thức** → player kiện ngược khi settle chia khác con số đã xem | Test 1 + test 8 (đối chiếu chéo settle). JSDoc SDK ghi rõ "units tại thời điểm tra — có thể tăng đến giờ đóng bán". |
| R3 | **Ship trước khi fix Q3 merge** → `jackpotUnits` đúng toán nhưng settle chia SAI → mâu thuẫn công khai | Review mục 1: chặn merge p1-01 nếu fix chưa vào main. Bảng trạng thái 00-overview thể hiện phụ thuộc. |
| R4 | Ownership-gate query chậm (account nhiều entry) | Index `{drawId, accountId}` (p0-01) + projection 2 field; `explain` IXSCAN. |
| R5 | `sets/expandedLines` lệch khi combo doc gộp nhiều betCount | Thương luôn nguyên (expandedLines hằng theo playType). Test 2 board cùng key betCount 3 và 5 → units = 8. |
| R6 | SDK breaking change vô tình | Chỉ THÊM type/method mới — ghi tiếp `Added` trong `[1.1.0]` chưa release; `docs:build` pass; không đụng type hiện hữu. |
| R7 | Copy nhầm hằng Power 6/55 (bao5 50 lines/500k, range 55) | Test 5 (ngoài "01".."45" → 400) + test 1 (bao5 units chia cho 40) + review mục 2. |
| R8 | Nhánh `$all` quét rộng khi kỳ lớn | Query trên combo_stats (không phải entries), index prefix `playType` → chỉ quét doc bao7–18 (hiếm — giá 70k–185tr). Test: seed nhiều combo standard + vài combo bao (drawId test riêng) → `explain` docsExamined ≈ số doc bao. |

## Định nghĩa Done

Player xem được độ đông bộ số **đã cược** (+ `jackpotUnits` nếu standard, khớp công thức chia SAU fix Q3), combo lạ luôn `{found:false}` đồng nhất, SDK JSDoc + CHANGELOG đầy đủ (TypeDoc sạch), không rò dữ liệu, unit test 8 case pass. Cập nhật `00-overview.md`.
