# p1-01 — Minh bạch chia jackpot cho player (combo popularity, ownership-gated)

> **Nguồn:** `.cursor/analysis/power655-operations-risk-control.analysis.md` §3.10 (đã chốt 05/08 sau kiểm tra luật settle)
> **Phase:** P1 · **Thứ tự:** 01 · **Phụ thuộc:** p0-02 (combo-stats data đầy), p0-03 (P0 chạy ổn).
> **Package đích:** `packages/game-power655-application` + `apps/api-player` + `packages/player-sdk`.

## Mục tiêu

Player tự kiểm tra "bộ số tôi đã cược có bao nhiêu bộ cùng cược" — **CHỈ bộ số account thực sự có entry trong kỳ** (ownership-gate nghiêm ngặt). Lý do (kết quả kiểm tra settle §3.10): JP1/JP2 **chia theo betCount trên toàn bộ line trúng** (`jackpotPerUnit = floor(pool / totalBetUnits)` — `patch-jackpot-prize.ts`) → khi jackpot bị chia, player cần con số kiểm chứng được để không thắc mắc. Giải cố định tier1/2/3 KHÔNG cap/chia — không cần minh bạch.

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File Keno production |
|---|---|
| Plan mẫu | `../keno-ops-risk-control/p1-01-combo-transparency.plan.md` (gồm mục "Cập nhật sau review" — bài học bỏ `players`) |
| Player use-case | `packages/game-keno-application/src/use-cases/player/get-combo-popularity.ts` (ownership-gate + `NOT_FOUND` đồng nhất) |
| Ownership repo method | `EntryRepository.getBoardsByAccountDraw` (Keno `entry-repo.ts` dòng ~166 — projection 2 field, loại `Void`) |
| Player handler | `apps/api-player/src/handlers/keno/get-combo-popularity.ts` (Zod CSV numbers, `withPlayerAuth`) |
| player-sdk | `packages/player-sdk/src/keno/types.ts` (`KenoComboPopularityParams/Response`), `apis/keno.ts` (method + JSDoc ownership-gate), `endpoints.ts` — theo Release Checklist rule `player-sdk-jsdoc.mdc` |

## Khác Keno — PHẢI giữ đúng (analysis §3.10)

1. Keno: cap 8/9/10 chia **per-combo** → `sets` cùng combo là mẫu số CHÍNH XÁC. Power 6/55: jackpot chia **per-draw across mọi line trúng** (kể cả line trong board Bao chứa bộ trúng) → `sets` cùng comboKey chỉ là **tín hiệu tham khảo**. JSDoc SDK phải nói rõ điều này — không hứa "đây là mẫu số chia".
2. Thêm field **`jackpotUnits`** khi combo tra là **6 số standard**: tổng betCount của MỌI board chắc chắn có line trúng nếu bộ S này trúng JP1. Điều kiện phủ theo playType KHÁC NHAU (analysis §3.10(3) — sửa 05/08 sau review, lỗi ban đầu dùng 1 query `$all` bỏ sót bao5):
   - `standard`: `mainNumbers = S` → **1 exact lookup** comboKey.
   - `bao5`: `mainNumbers (5 số) ⊂ S` → **6 exact lookup** các key `"bao5:<tập con 5 của S>"` (C(6,5) = 6).
   - `bao7–bao18`: `mainNumbers ⊇ S` → **1 query** `{drawId, playType: {$in: [bao7..bao18]}, mainNumbers: {$all: S}}` trên index `{drawId, playType, mainNumbers}` (p0-01) — bound theo playType, CHỈ quét doc Bao cao (hiếm tự nhiên, giá board 70k–185tr).
   - Mỗi nguồn: `betCount = sets / expandedLines[playType]` (BAO_COMBINATIONS — luôn nguyên). **Performance với kỳ trăm ngàn entries: an toàn** — mọi query chạy trên combo_stats (1 doc/bộ distinct), 7 exact key O(1) + 1 IXSCAN bound theo playType; endpoint on-demand ownership-gated, không timer.
   - Board Bao tra cứu (7–18 số) → chỉ trả `sets` (mẫu số phụ thuộc 6 số được quay — không xác định trước).
3. Mọi playType đều tra được (Keno chỉ pick8/9/10) — vì jackpot áp cho mọi board. Validate: 5–18 số distinct `"01".."55"`, độ dài phải khớp 1 playType hợp lệ (6 = standard, 5 = bao5, 7–15 = baoN, 18 = bao18).

## Xác minh công thức toán (review 05/08 — đối chiếu code production, KHÔNG được diverge khi implement)

Chứng minh `jackpotUnits(S)` đúng bằng mẫu số chia JP1 khi bộ 6 số S trúng:

1. **Mẫu số thật khi settle** (`patch-jackpot-prize.ts` dòng 214–227): lines trúng JP1 = lines có 6 số == 6 số quay; `totalBetUnits = Σ(line.betCount)`; `jackpotPerUnit = floor(totalPool / totalBetUnits)`; entry nhận `jackpotPerUnit × entryBetUnits`. **Phần lẻ do floor giữ lại quỹ** — JSDoc SDK phải nói "phần của bạn = floor(pool / jackpotUnits) × betCount".
2. **Mỗi board phủ S đóng góp ĐÚNG 1 line == S** (lines trong 1 board là các bộ 6 distinct):
   - `standard` (mainNumbers = S): chính nó — 1 line.
   - `bao5` (`play-types.ts` dòng 63–73: 5 số chọn + ghép LẦN LƯỢT 50 số còn lại, KHÔNG phải C(5,6)): có line == S ⟺ 5 số chọn ⊂ S, line = 5 số + phần tử còn lại của S — đúng 1.
   - `bao7–18` (C(N,6) tổ hợp): có line == S ⟺ mainNumbers ⊇ S — đúng 1 (chọn đúng tập con S).
   - → đóng góp của board = `betCount × 1` → `jackpotUnits(S) = Σ betCount các board phủ S = totalBetUnits` khi S trúng. ✓
3. **Suy `Σ betCount` từ combo doc**: `sets` của combo = `Σ(expandedLines × betCount)` các board cùng key (p0-02 mục accumulator, khớp `betUnitsPerDraw` trong `place-bet.ts` dòng 107); `expandedLines` là hằng theo playType → `sets / BAO_COMBINATIONS[playType]` luôn nguyên = `Σ betCount`. Bảng `BAO_COMBINATIONS` (types.ts 197–210) đã đối chiếu khớp `PLAY_TYPE_CONFIGS` (bao5 = 50 = 55−5 ghép bổ sung; bao7 = C(7,6) = 7; bao18 = C(18,6) = 18564). ✓
4. **Giá 1 board (giá player phải trả)** — `place-bet.ts` dòng 143–146: `amount = unitPrice × Σ(expandedLines × betCount) × drawCount`, `unitPrice` snapshot từ config (mặc định 10.000đ). Giá 1 board betCount=1/kỳ: standard 10k · bao5 500k · bao7 70k · bao8 280k · bao9 840k · bao10 2,1tr · bao11 4,62tr · bao12 9,24tr · bao13 17,16tr · bao14 30,03tr · bao15 50,05tr · bao18 185,64tr. **Response combo-popularity của cả player lẫn BO combo-lookup dialog hiển thị kèm giá này** (`unitPrice × BAO_COMBINATIONS[playType]` — đọc unitPrice từ game config hiện hành, ghi chú "giá hiện tại, entry cũ có thể snapshot giá khác") để player/staff đối chiếu đúng bộ số đã tra tốn bao nhiêu tiền 1 lần cược.
5. **Giới hạn ngữ nghĩa**: `jackpotUnits` là con số TẠI THỜI ĐIỂM TRA (bán vé còn tiếp tục → chỉ tăng, không giảm trừ khi void); áp cho **JP1** (6/6). JP2 (5/6+bonus) KHÔNG suy được trước giờ quay từ bộ 6 số (phụ thuộc bonus) → JSDoc ghi rõ chỉ JP1.

## File & thay đổi

### 1. `packages/game-power655-application`

- SỬA `src/infras/repos/entry-repo.ts` — thêm `getBoardsByAccountDraw(accountId, drawId)`: filter `{accountId, drawId, status: {$ne: Void}}`, projection CHỈ `entrySummary.boards.playType` + `entrySummary.boards.mainNumbers` (copy Keno, đổi tên field theo entity Power655). Chạy trên index `{drawId, accountId}` (p0-01). JSDoc ghi mục đích ownership-gate + index hint.
- SỬA `src/infras/repos/combo-stats-repo.ts` — thêm `sumJackpotUnitsForStandardSet(drawId, numbers6)`: hiện thực 3 nhánh mục "Khác Keno" (2): batch exact lookup 7 comboKey (standard + 6 tập bao5) qua `find({drawId, comboKey: {$in: keys}})` + query `$all` nhóm bao7–18 trên index `{drawId, playType, mainNumbers}`; chia app-side `sets / BAO_COMBINATIONS[playType]` (KHÔNG đổi schema combo doc). JSDoc ghi công thức 3 nhánh + vì sao `sets/expandedLines = Σ betCount` (nguyên, vì expandedLines hằng theo playType) + index hint.
- TẠO `src/use-cases/player/get-combo-popularity.ts` — `GetComboPopularityPlayerUseCase extends ApiGatewayUseCase`, copy khung Keno nguyên vẹn:
  - Validate: độ dài numbers khớp playType hợp lệ, distinct — sai → 400 (lỗi client rõ ràng, không lộ data).
  - Ownership-gate: build tập comboKey từ boards account sở hữu (`buildComboKey` — helper p0-02, TÁI DÙNG không viết lại); combo không thuộc account → trả `NOT_FOUND = {found: false}` **đồng nhất** (JSDoc class copy khối giải thích chống dò của Keno).
  - Sở hữu → đọc combo doc → `{found: true, sets, boardPrice}`; nếu combo 6 số standard → tính thêm `jackpotUnits` qua `sumJackpotUnitsForStandardSet`. `boardPrice = unitPrice hiện hành (game config) × BAO_COMBINATIONS[playType]` — giá phải trả chính xác cho 1 lần cược (betCount = 1, 1 kỳ) bộ số này (user yêu cầu 05/08); JSDoc ghi chú "giá theo config hiện tại — entry mua trước đó snapshot `unitPrice` riêng, có thể khác". KHÔNG trả `amount`/`accountId`/`username`.
- SỬA `dto/player.dto.ts` + barrel `use-cases/player/index.ts`.

### 2. `apps/api-player`

- TẠO `src/handlers/power655/get-combo-popularity.ts` — copy handler Keno: `GET /games/power655/draws/{drawId}/combo-popularity`, `withPlayerAuth`, Zod path `drawId` (DRAW_ID_REGEX) + query `numbers` CSV zero-padded qua schema số Power655 (`"01".."55"`), min 5 max 18. Đăng ký route theo cơ chế routing hiện hành của app (đối chiếu file routing/serverless của api-player lúc implement).

### 3. `packages/player-sdk` (theo Release Checklist `player-sdk-jsdoc.mdc` — JSDoc đầy đủ BẮT BUỘC)

1. `src/power655/types.ts` — thêm `Power655ComboPopularityParams {drawId; numbers}` + `Power655ComboPopularityResponse {found; sets?; boardPrice?; jackpotUnits?}`. JSDoc từng field: format `YYYY-MM-DD.NNN`, numbers 5–18 số `"01".."55"` zero-padded; `found=false` = "chưa cược bộ này HOẶC bộ chưa ai chơi — cố ý không phân biệt"; `sets` = tín hiệu tham khảo (giải thích jackpot chia per-draw); `boardPrice` = giá 1 lần cược bộ này (VND) theo config hiện tại; `jackpotUnits` CHỈ có khi tra bộ 6 số standard + giải thích ý nghĩa và công thức `floor(pool / jackpotUnits) × betCount`. `@example` cho cả 2 type.
2. `src/endpoints.ts` — `getComboPopularity: (drawId) => \`/games/power655/draws/${drawId}/combo-popularity\` as const` trong key `power655`.
3. `src/apis/power655.ts` — method `getComboPopularity(params)` trong `Power655Api`: JSDoc summary + `**Endpoint:**` + `@param`/`@returns`/`@throws {@link ApiClientError}` (`UNAUTHORIZED`) + `@example` hoàn chỉnh + **đoạn giải thích ownership-gate** (combo lạ luôn `found:false`, không phải bug) + đoạn giải thích khác biệt `sets` vs `jackpotUnits`.
4. `src/index.ts` — re-export 2 type mới từ `./power655`.
5. `CHANGELOG.md` — **ghi TIẾP vào entry `[1.1.0] - 2026-07-28`** (chứa `getComboPopularity` Keno), thêm khối `### Added — client.power655.getComboPopularity` ngay dưới khối Keno. **KHÔNG tạo entry version mới, KHÔNG bump** — version 1.1.0 CHƯA release (`package.json` vẫn `1.0.18`, user chốt 05/08 — analysis §3.10(6)). Quy tắc chung khi các game khác bổ sung SDK trước lúc 1.1.0 release: gộp chung entry, không hỏi lại. Lời văn theo chuẩn rule `player-sdk-jsdoc.mdc`.
6. `pnpm --filter @megawin/player-sdk docs:build` — TypeDoc render sạch.

### 4. UI player (web player app)

Sau khi cược, màn hình vé hiển thị `sets` (+ `jackpotUnits` nếu standard) của bộ số mình, refresh đến giờ đóng bán, chỉ hiện khi `found: true` — copy pattern hiển thị/poll hiện có của player app (xác nhận app + component mẫu lúc làm; nếu player app do tenant tự xây thì mục này chỉ là SDK + doc).

## Không làm

- KHÔNG cho tra combo chưa cược (chống probing). KHÔNG 403/404 phân biệt — `{found:false}` đồng nhất. KHÔNG trả amount/accountId/username. KHÔNG expand lines Bao để tính mẫu số cho board Bao (không xác định trước giờ quay — trả `sets` là đủ). KHÔNG tái dùng use-case staff `combo-lookup` cho player (Keno p0-07 §112: minh bạch player PHẢI tách use-case).

## Cách review (sau khi implement)

1. Diff đối chiếu use-case với Keno `get-combo-popularity.ts` — logic gate/NOT_FOUND giống hệt; khác biệt CHỈ ở validate playType + `jackpotUnits`.
2. Kiểm response: grep DTO player — KHÔNG có field `amount|accountId|username` trong output.
3. Kiểm công thức `jackpotUnits` đối chiếu `patch-jackpot-prize.ts`: mẫu số công thức chia là `totalBetUnits` (Σ betCount line trúng) — xác nhận tổng 3 nhánh (standard exact + bao5 6 tập con + bao7–18 `$all`) đúng bằng con số đó khi 6 số này trúng (viết chứng minh ngắn trong JSDoc). Đặc biệt kiểm nhánh **bao5** — lỗi thiết kế ban đầu 05/08 đã bỏ sót (phủ theo `⊂`, không bắt được bằng `$all` superset).
4. SDK: checklist `player-sdk-jsdoc.mdc` từng mục (types → endpoints → apis → index → CHANGELOG → docs:build); JSDoc có đoạn ownership-gate; CHANGELOG ghi TIẾP entry `[1.1.0]`, không entry mới.
5. `explain()` nhánh `$all` → IXSCAN trên `{drawId, playType, mainNumbers}` với bound theo playType (docsExamined chỉ gồm doc bao7–18), không COLLSCAN, không quét combo standard.

## Cách test

```bash
pnpm --filter @megawin/game-power655-application check-types && pnpm --filter @megawin/game-power655-application test
pnpm --filter @megawin/api-player check-types
pnpm --filter @megawin/player-sdk check-types && pnpm --filter @megawin/player-sdk docs:build
```

Unit tests viết mới (`test/use-cases/get-combo-popularity.test.ts`, mongodb-memory):

1. Account cược standard 6 số → tra đúng bộ: `{found:true, sets, boardPrice: 10000, jackpotUnits}` — seed thêm 1 board **bao7 chứa đủ 6 số** + 1 board **bao5 có 5 số ⊂ bộ 6** từ account khác → `jackpotUnits` cộng đủ cả 3 nguồn (standard + bao5 + bao7, mỗi nguồn đúng betCount). Seed thêm 1 board bao5 có 5 số KHÔNG ⊂ bộ 6 → KHÔNG được tính.
2. Tra bộ số CHƯA cược (nhưng có người khác chơi) → `{found:false}` — response byte-giống case bộ không tồn tại.
3. Tra bộ không tồn tại → `{found:false}`.
4. Account cược bao9 → tra đúng 9 số của mình: `{found:true, sets, boardPrice: 840000}` KHÔNG có `jackpotUnits`.
5. Numbers sai (4 số / 16–17 số / trùng số / ngoài "01".."55") → 400.
6. Entry đã Void → không tính là sở hữu → `{found:false}`.
7. Combo doc chưa kịp có (worker lag) dù sở hữu → `{found:false}` (đồng nhất, không throw).

## Rủi ro & cách test rủi ro

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | **Oracle dò bộ số hệ thống** (phân biệt được "có người chơi" vs "không tồn tại") | Test 2 vs 3: response giống hệt nhau (deep-equal cả shape lẫn status code). Review: không có nhánh code nào trả khác nhau giữa 2 case. |
| R2 | **`jackpotUnits` sai công thức** → player kiện ngược khi settle chia khác con số đã xem | Test 1 mô phỏng đủ các nguồn: standard cùng bộ, standard bộ KHÁC (không tính), **bao5 ⊂ bộ** (tính — nhánh dễ sót nhất), bao5 không ⊂ (không tính), bao7 ⊇ bộ (tính) — đối chiếu tay với `jackpotPerUnit` của `patch-jackpot-prize.ts` trên cùng data. JSDoc SDK ghi rõ "units tại thời điểm tra — có thể tăng đến giờ đóng bán". |
| R3 | Ownership-gate query chậm (account nhiều entry kỳ 3 ngày) | Index `{drawId, accountId}` (p0-01) + projection 2 field; `explain` IXSCAN. Account trần thực tế vài chục entry/kỳ — vài doc. |
| R4 | `sets/expandedLines` lệch khi combo doc gộp nhiều betCount | Bản chất: `sets` của combo = Σ(expandedLines × betCount) các board cùng key → chia expandedLines (hằng theo playType) luôn nguyên = Σ betCount. Test với 2 board cùng key betCount 3 và 5 → units = 8. |
| R5 | SDK breaking change vô tình (đổi type có sẵn) | Chỉ THÊM type/method mới — ghi tiếp `Added` trong entry `[1.1.0]` chưa release; `docs:build` pass; không đụng type hiện hữu. |
| R6 | Player app poll endpoint này quá dày | SDK doc khuyến nghị nhịp poll ≥ 10s; server đã có auth + đọc theo exact key/index bound — chấp nhận. Nếu thành vấn đề thật → cache LRU ngắn tầng handler (ghi chú, không làm trước). |
| R7 | Nhánh `$all` quét rộng khi kỳ lớn (trăm ngàn entries) | Đã chặn từ thiết kế: query trên combo_stats (không phải entries), index prefix `playType` → chỉ quét doc bao7–18 (hiếm — giá board 70k–185tr). Test rủi ro: seed 50k combo standard + 20 combo bao → `explain` docsExamined ≈ 20, không phụ thuộc số combo standard. |

## Định nghĩa Done

Player xem được độ đông bộ số **đã cược** (+ `jackpotUnits` nếu standard), combo lạ luôn `{found:false}` đồng nhất, SDK JSDoc + CHANGELOG đầy đủ (TypeDoc sạch), không rò dữ liệu, unit test 7 case pass. Cập nhật `00-overview.md`.
