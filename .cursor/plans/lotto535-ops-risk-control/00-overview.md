# Lotto 5/35 Operations & Risk Control — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/lotto535-operations-risk-control.analysis.md` (đã qua 2 vòng review user 05–06/08/2026, Q1–Q7 chốt hết)
> **Feature slug:** `lotto535-ops-risk-control` · tuân `.cursor/plans/README.md`.
> **Bản mẫu triển khai:** feature Power 6/55 `power655-ops-risk-control` (p0-01, p0-02 ĐÃ done — code THẬT trong `packages/game-power655*` + `apps/worker-power655` là pattern copy trực tiếp, gần hơn Keno vì cùng nhóm game jackpot). Tham chiếu phụ: Keno canonical (gốc mọi pattern).

Biến trang Vận hành Lotto 5/35 từ "~7 timer on-demand aggregation" thành hệ thống **alert-driven đọc pre-aggregated**: 2 worker `TickLoopWorker` cập nhật stats/alert async (không đụng hot path place-bet), backoffice đọc snapshot O(1). Đặc thù so với Power 6/55: single JP + Split Cycle (KHÔNG vào exposure, KHÔNG banner/alert), number stats 2 chiều `kind: main/special`, `byPlayType` 13 key dẫn xuất từ `PlayType`, alert mới `special_skew`.

## Bảng trạng thái

| Plan | Phase | Status | Review | Phụ thuộc | Ghi chú |
|---|---|---|---|---|---|
| p0-00-jackpot-betcount-hardening | P0 | ✅ done (code) | ☐ chưa review | — (độc lập, đụng settle pipeline) | Đã sửa comment/JSDoc `patch-jackpot-prize.ts` (per-unit đúng, lý do đọc TẤT CẢ JP lines), winners dùng 1 nguồn số `betUnitsByEntry` (bỏ filter+fallback `hitCount` cũ) + log warn khi entry thiếu betUnits; `entry-repo.ts` 2 method (`patchJackpotPrize`, `applySplitBonusForTier`) đổi param map thành bắt buộc + dọn JSDoc mồ côi; tạo `test/use-cases/patch-jackpot-prize.test.ts` 8 case (regression, multi-line, specialCover, idempotency, crash-sim, split, split double-run, orphan-entry). `check-types` pass. Test/Review rủi ro do agent khác thực hiện. |
| p0-01-foundation-entities-config-indexes | P0 | ✅ done (code) | ☐ chưa review | — | Entities 6 collection + `Lotto535StatsPlayKey`/`toStatsPlayKey` + `Lotto535OpsAlertType` (7 member) + `rules/combo-key.ts` + `GlobalConfigDoc.ops` + defaults + `LOTTO535_INDEXES` (thêm mới, xoá 3 index chết `drawDate`) + **setup vitest cho domain package**. `check-types` pass. Test/Review rủi ro do agent khác thực hiện. |
| p0-02-stats-worker | P0 | ✅ done (code) | ☐ chưa review | 01 | Repos + mappers + accumulator + `SyncBettingStatsUseCase` + `EvaluateOpsAlertsUseCase` (5 rule, có `special_skew`) + handlers + `stats.yml` + serverless wiring. `check-types` pass application + worker. Test/Review rủi ro do agent khác thực hiện. |
| p0-03-operations-api-ui | P0 | ✅ done (code) | ☐ chưa review | 01, 02 | Snapshot/alerts/combo-lookup API + get-config merge default + tab config "Vận hành" + UI 1 nhịp chung (KPI/Exposure/Analytics/Alerts/page tabs Giám sát-Phân tích) + heatmap 2 lưới + dead-code cleanup (5 use-case/route cũ + DTO/helpers). `check-types` pass application + backoffice. Test/Review rủi ro do agent khác thực hiện. |
| p1-01-combo-transparency | P1 | ✅ done (code) | ☐ chưa review | 02, 03 | Minh bạch chia jackpot + mô tả cơ chế split (analysis §3.10): `GetComboPopularityPlayerUseCase` (ownership-gate + `jackpotUnits` 4 nhánh coverage + `splitEligibleDraw`) + `EntryRepository.getBoardsByAccountDraw` + `ComboStatsRepository.sumJackpotUnitsForStandardSet` + `inferPlayType` (domain rule) + handler `api-player` `get-combo-popularity.ts` (Zod CSV numbers/specials, distinct-refine) + player-sdk (`Lotto535ComboPopularityParams/Response`, `apis/lotto535.ts`, `endpoints.ts`, `index.ts`, CHANGELOG ghi tiếp entry `[1.1.0]`, `docs:build` sạch). `check-types` pass 4 package (application/domain/api-player/player-sdk). Test/Review rủi ro do agent khác thực hiện. |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.
Review: ☐ chưa review · 🔍 đang review · ☑ đã review — cột dành cho **agent review ĐỘC LẬP** (khác agent implement): chỉ tick ☑ sau khi chạy đủ 5 bước "Bước Review BẮT BUỘC" bên dưới và ghi bằng chứng vào cột Ghi chú. Agent implement KHÔNG tự tick cột này.

## Thứ tự thực thi

```
p0-00 (độc lập — settle hardening)
p0-01 ──► p0-02 ──► p0-03 ──► p1-01
```

- **p0-00** độc lập hoàn toàn với chuỗi ops (chỉ đụng settle pipeline) — merge lúc nào cũng được, khuyến nghị TRƯỚC p1-01 (regression test JP betCount là nền tin cậy cho `jackpotUnits` của combo transparency).
- **p0-01** độc lập, merge sớm nhất — entities/index/combo-key là điều kiện tiên quyết cho worker (02) và API (03); gồm cả 2 index phục vụ p1-01 (`{drawId, accountId}` entries + `{drawId, playType, mainNumbers}` combo_stats).
- **p0-02** cần entities/index từ 01; worker đọc config `ops` qua đường get-config có merge-default (01 khai `DEFAULT_LOTTO535_CONFIG.ops`) → KHÔNG cần migration backfill.
- **p0-03** là tầng API/UI cuối của P0, cần data của 02.
- **p1-01** cần combo-stats data (02) đầy và P0 chạy ổn.

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

Bắt buộc tuân **§7 Kỷ luật triển khai** của analysis nguồn:

1. **KHÔNG tự sinh kiến trúc/pattern mới** — mỗi plan có mục **"Pattern tham chiếu"** trỏ file Power 6/55 (ưu tiên) hoặc Keno production; copy pattern, đổi shape theo luật Lotto 5/35 (`rules/` + JSDoc entities lotto535).
2. **Checklist rủi ro worker**: watermark per-doc (`DeltaAccumulatedDoc`), `$inc` + `$set lastEntryId` cùng 1 lệnh, `bulkWrite {ordered:false}` coi lỗi 11000 là no-op, KHÔNG lưu top-K theo metric tích luỹ trong doc, giá trị RAW lưu thẳng — biến đổi ở tầng đọc, thresholds trả từ server.
3. **Rules bắt buộc theo tầng:** `mongodb.mdc` (docPath type-safe, repo class thuần, types tách `repos/types/`, index khai thủ công trong `LOTTO535_INDEXES`), `code-quality-standards.mdc` (§1 JSDoc, §5.3 const-as-const, §5.4 không indexed-access, §6 curly, §7 import đầu file, §8 không duplicate Zod), `operations-page-ui.mdc`, `game-config-ui.mdc`.
4. **Skills bắt buộc khi làm UI:** `shadcn`, `next-best-practices`, `vercel-react-best-practices` (1 snapshot query + `select` slice, functional setState, explicit conditional rendering), `vercel-composition-patterns`, `frontend-design`/`web-design-guidelines`.
5. **2 guideline layout:** `../keno-ops-risk-control/operations-page-layout.guideline.md` + `../keno-ops-risk-control/ops-config-page-layout.guideline.md`.
6. **Không đụng hot path place-bet** — mọi thống kê qua worker async đọc insert-stream.
7. **MongoDB best practice khi viết query:** mọi filter/sort có index hậu thuẫn (khai trước ở p0-01); projection mỏng cho query hàng đợi; counter vô hướng thay `$size`/`$expr`; upsert `$setOnInsert` tách khỏi `$inc`; TTL index cho retention; KHÔNG aggregation pipeline trong hot read path BO.
8. **Mẫu số nhất quán BET UNITS** (analysis §7.7): mọi metric `sets` = `Σ(expandedLines × betCount)` — khớp `betUnitCount` của place-bet/settle/split. KHÔNG dùng `lineCount` làm mẫu số ở bất kỳ đâu.
9. **Divergence thiết kế mới phát sinh** trong lúc implement → thêm dòng vào bảng §6 analysis nguồn.
10. **Verify mỗi plan:** `pnpm --filter <package> check-types` + lint + unit test trước khi coi là done; cập nhật bảng trạng thái file này.

## QUY TẮC TEST TRÊN DB STAGING CHUNG (user chốt 06/08 — BẮT BUỘC mọi plan)

Test integration của `game-lotto535-application` kết nối **DB staging DÙNG CHUNG** (env qua `loadEnv` trong `vitest.config.ts`) — KHÔNG phải DB ephemeral. Vì vậy:

1. **TUYỆT ĐỐI KHÔNG gọi hàm xoá data** trong test: cấm `deleteMany`, `deleteOne`, `drop`, `dropCollection`, `dropDatabase`, và mọi helper "cleanup"/"teardown" xoá doc. Review grep các từ khoá này trong `test/` = 0 match mới.
2. **Cách li bằng KEY NGẪU NHIÊN thay vì xoá**: mỗi test run sinh `drawId` giả duy nhất theo format hợp lệ nhưng không đụng kỳ thật — dùng ngày quá khứ xa + suffix random được chấp nhận bởi regex drawId, hoặc tối thiểu `accountId`/`tenantId`/`comboKey` random (`crypto.randomUUID()`). Mỗi test CHỈ assert trên doc mình vừa seed (find theo unique key vừa sinh) — KHÔNG assert count/tồn tại toàn collection.
3. **Idempotency test so DELTA, không so tuyệt đối**: đọc giá trị doc sau lần ghi 1 → ghi lần 2 → đọc lại → khẳng định KHÔNG ĐỔI. Không giả định collection rỗng ban đầu.
4. **Dọn rác tự nhiên bằng TTL**: các collection stats/alerts có TTL index (90d/180d — p0-01) → doc test tự bay, không cần xoá tay. Doc seed nên có `createdAt` thật để TTL hoạt động.
5. Test PURE (accumulator, evaluate-alerts, combo-key, mapper) không đụng DB — ưu tiên tối đa logic vào nhóm này.

## Hạ tầng test hiện có (khảo sát 06/08)

| Package | Vitest? | Việc cần làm |
|---|---|---|
| `packages/game-lotto535-application` | ✅ CÓ (`vitest.config.ts` + `test/global-setup.ts` build deps + 4 test file sẵn) | Dùng nguyên — viết thêm test file mới vào `test/` |
| `packages/game-lotto535` (domain) | ❌ CHƯA | **p0-01 setup**: thêm `vitest.config.ts` (dùng `@megawin/vitest-config`, KHÔNG cần globalSetup/DB — test pure), devDeps `vitest` + `@megawin/vitest-config`, scripts `test`/`test:watch` |
| `apps/backoffice` | ❌ KHÔNG có test runner | KHÔNG setup trong feature này (theo quyết định Power 6/55 p0-03) — Zod schema verify qua test global-config application + test thủ công form |
| `apps/worker-lotto535` | ❌ | Chỉ `check-types` + smoke test handler local |

## Bước Review BẮT BUỘC sau khi implement xong MỖI plan

1. Đọc lại DIFF toàn bộ, đối chiếu từng mục "File & thay đổi" trong plan — không thừa, không thiếu.
2. Chạy checklist "Rủi ro & cách test rủi ro" ở cuối plan — từng dòng phải có bằng chứng (test pass / grep 0 kết quả / output cụ thể).
3. Grep từ khoá cấm: `upsertFull|recomputeFull|resetFinal` (0 match), indexed-access `Doc\["` trên type mới (0 match), string literal trần thay enum member (spot-check), **`deleteMany|dropCollection|dropDatabase` trong `test/` (0 match mới — quy tắc staging DB)**.
4. So sánh với file Power 6/55 tương ứng (mục "Pattern tham chiếu") — khác biệt phải nằm trong bảng verdict §6 analysis, không có diverge "lậu".
5. Ghi kết quả review vào cột Ghi chú của bảng trạng thái.
