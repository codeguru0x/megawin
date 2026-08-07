# Mega 6/45 Operations & Risk Control — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/mega645-operations-risk-control.analysis.md` (status `reviewed`, user chốt Q1–Q4 ngày 06/08/2026)
> **Feature slug:** `mega645-ops-risk-control` · tuân `.cursor/plans/README.md`.
> **Bản mẫu triển khai:** feature Power 6/55 `power655-ops-risk-control` (p0-01/p0-02 ĐÃ done — cùng nhóm game jackpot, cùng bảng giá Bao) — mọi plan copy pattern từ code Power 6/55 THẬT trước, đối chiếu ngược Keno production khi Power 6/55 chưa cover. KHÔNG sáng tác pattern mới.

Biến trang Vận hành Mega 6/45 từ "~7 timer on-demand aggregation" thành hệ thống **alert-driven đọc pre-aggregated**: 2 worker `TickLoopWorker` cập nhật stats/alert async (không đụng hot path place-bet), backoffice đọc snapshot O(1). Khác Power 6/55: single jackpot (không JP2/bonus/overflow), 45 số, tier1 = 10tr (ngưỡng exposure scale ¼), boards A–F, field số tên `numbers`.

## Bảng trạng thái

| Plan | Phase | Status | Review | Phụ thuộc | Ghi chú |
|---|---|---|---|---|---|
| fix-jackpot-betcount | FIX | ✅ done | ☐ chưa review | — (độc lập, làm được NGAY) | Sửa bug chia jackpot multi-board (analysis §3.10-3, Q3) — PREREQUISITE của p1-01. File plan: `mega645-fix-jackpot-betcount.plan.md` (cùng thư mục) |
| p0-01-foundation-entities-config-indexes | P0 | ✅ done | ☐ chưa review | — | Entities 6 collection + `Mega645OpsAlertType` + `GlobalConfigDoc.ops` + defaults (chốt Q1) + `MEGA645_INDEXES` (thêm mới, xoá 2 index chết `drawDate`) + **xoá di sản split** (Q2) |
| p0-02-stats-worker | P0 | ✅ done | ☐ chưa review | 01 | Repos + mappers + accumulator + `SyncBettingStatsUseCase` + `EvaluateOpsAlertsUseCase` + handlers + `stats.yml` + serverless wiring |
| p0-03-operations-api-ui | P0 | ✅ done | ☐ chưa review | 01, 02 | Snapshot/alerts/combo-lookup API + get-config merge default + tab config "Vận hành" + UI 1 nhịp chung + dead-code cleanup |
| p1-01-combo-transparency | P1 | ✅ done | ☐ chưa review | fix, 02, 03 | Minh bạch chia jackpot cho player (analysis §3.10): endpoint `combo-popularity` ownership-gated + player-sdk `getComboPopularity` + `jackpotUnits` cho bộ 6 số standard |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.
Review: ☐ chưa review · 🔍 đang review · ☑ đã review — cột dành cho **agent review ĐỘC LẬP** (khác agent implement): chỉ tick ☑ sau khi chạy đủ 5 bước "Bước Review BẮT BUỘC" bên dưới và ghi bằng chứng vào cột Ghi chú. Agent implement KHÔNG tự tick cột này.

## Thứ tự thực thi

```
fix-jackpot-betcount ─────────────────┐
                                      ▼
p0-01 ──► p0-02 ──► p0-03 ──► p1-01 (cần cả fix lẫn P0)
```

- **fix-jackpot-betcount** độc lập hoàn toàn với chuỗi P0 (chỉ đụng settle pipeline) — làm sớm nhất; PHẢI merge trước p1-01 (`jackpotUnits` chỉ khớp công thức chia sau fix).
- **p0-01** độc lập, merge sớm nhất trong chuỗi ops — index và entities là điều kiện tiên quyết cho worker (02) và API (03); gồm cả 2 index phục vụ p1-01 (`{drawId, accountId}` entries + `{drawId, playType, numbers}` combo_stats).
- **p0-02** cần entities/index từ 01; worker đọc config `ops` qua đường có merge-default (01 khai `DEFAULT_MEGA645_CONFIG.ops`) — KHÔNG cần migration backfill.
- **p0-03** là tầng API/UI cuối của P0, cần data của 02.
- **p1-01** cần combo-stats data (02) đầy + P0 chạy ổn + fix-jackpot-betcount đã merge.
- **Thời điểm bắt đầu chuỗi P0** (analysis §7.7): sau khi Power 6/55 P0 chạy ổn — copy code đã qua thực chiến, gần như đổi prefix + PrizeContext.

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

Bắt buộc tuân **§7 Kỷ luật triển khai** của analysis nguồn:

1. **KHÔNG tự sinh kiến trúc/pattern mới** — mỗi plan có mục **"Pattern tham chiếu"** trỏ file Power 6/55 (ưu tiên) / Keno production; copy pattern, đổi shape theo luật Mega 6/45 (`mega645-game-rules.mdc`).
2. **Checklist rủi ro worker** (Keno §11 + p2-01, kế thừa qua Power 6/55): watermark per-doc (`DeltaAccumulatedDoc`), `$inc` + `$set lastEntryId` cùng 1 lệnh, `bulkWrite {ordered:false}` coi lỗi 11000 là no-op, KHÔNG lưu top-K theo metric tích luỹ trong doc, index hậu thuẫn trước khi code query, giá trị RAW lưu thẳng — biến đổi ở tầng đọc, thresholds trả từ server.
3. **Rules bắt buộc theo tầng:** `mongodb.mdc` (docPath type-safe, repo class thuần, types tách `repos/types/`, index khai thủ công trong `MEGA645_INDEXES`), `code-quality-standards.mdc` (§1 JSDoc, §4 cập nhật comment khi sửa code, §5.3 const-as-const, §5.4 không indexed-access, §6 curly braces, §7 import đầu file, §8 không duplicate Zod validation), `mega645-game-rules.mdc`, `operations-page-ui.mdc`, `game-config-ui.mdc`.
4. **Skills bắt buộc khi làm UI:** `shadcn` (primitive từ registry, không tự chế), `next-best-practices` (RSC boundary), `vercel-react-best-practices` (1 snapshot query + `select` slice, functional setState, explicit conditional rendering), `vercel-composition-patterns` (compound components), `frontend-design`/`web-design-guidelines`.
5. **2 guideline layout:** `../keno-ops-risk-control/operations-page-layout.guideline.md` + `../keno-ops-risk-control/ops-config-page-layout.guideline.md`.
6. **Không đụng hot path place-bet** — mọi thống kê qua worker async đọc insert-stream.
7. **MongoDB best practice khi viết query**: mọi filter/sort phải có index hậu thuẫn (khai trước trong p0-01); projection mỏng cho query hàng đợi; counter vô hướng thay `$size`/`$expr`; upsert `$setOnInsert` tách khỏi `$inc`; TTL index cho retention thay batch cleanup; KHÔNG aggregation pipeline trong hot read path (snapshot = `findOne`/`find` + limit).
8. **Divergence thiết kế mới phát sinh** trong lúc implement → thêm dòng vào bảng verdict §6 analysis nguồn (đồng bộ ngược Power 6/55 nếu là lỗi chung).
9. **Verify mỗi plan:** `pnpm --filter <package> check-types` + lint + unit test trước khi coi là done; cập nhật bảng trạng thái file này.

## Quy tắc TEST trên DB staging dùng chung (user chốt 06/08 — áp cho MỌI plan)

Test suite (`packages/game-mega645-application/test/`, vitest ĐÃ setup sẵn: `vitest.config.ts` + `@megawin/vitest-config` + `loadEnv` → **kết nối DB staging dùng chung**) PHẢI tuân:

1. **TUYỆT ĐỐI KHÔNG gọi hàm xoá data** trong test: cấm `deleteMany`/`deleteOne`/`drop*` ở `beforeAll`/`afterAll`/`afterEach` và trong test body. (KHÁC tiền lệ `power655 stats-repos-idempotency.test.ts` vốn dùng `deleteMany` — KHÔNG copy phần đó.)
2. **Cô lập bằng KEY DUY NHẤT per-run thay vì cleanup**: mỗi lần chạy sinh `drawId`/`accountId`/`comboKey` riêng — pattern `const TEST_DRAW_ID = \`9999-01-01.${new ObjectId().toHexString().slice(-6)}\`` (prefix `9999-` không trùng draw thật, suffix ObjectId bảo đảm unique giữa các run). Mọi assert giá trị tuyệt đối chỉ đúng khi key là mới → không cần dọn baseline.
3. **Rác test chấp nhận được**: docs `9999-*` tồn lại staging là chấp nhận (số lượng nhỏ; các collection stats có TTL 90d tự dọn; `draw_betting_stats`/`ops_alerts` không TTL 90d thì lượng rác không đáng kể — DBA dọn tay định kỳ nếu cần, ghi chú trong PR).
4. **KHÔNG ghi đè document config CHUNG**: global config là doc singleton của staging — test liên quan `ops` merge-default ưu tiên test qua **mapper normalize thuần** (truyền doc object thiếu `ops`, không đụng DB); nếu bắt buộc đọc config thật thì CHỈ ĐỌC. `insertDefaultGlobalConfig` (helper sẵn có) chỉ dùng khi doc CHƯA tồn tại — không upsert đè giá trị staff đã chỉnh.
5. Package KHÔNG có vitest (vd domain `game-mega645`): test pure-rule đặt tại `game-mega645-application/test/` (import domain qua workspace) — KHÔNG setup vitest mới cho domain trừ khi thật sự cần test không-import-được-từ-application (nếu cần: copy `vitest.config.ts` + devDeps + scripts từ `game-mega645-application`, thêm `global-setup.ts` build deps).

## Bước Review BẮT BUỘC sau khi implement xong MỖI plan

1. Đọc lại DIFF toàn bộ, đối chiếu từng mục "File & thay đổi" trong plan — không thừa, không thiếu.
2. Chạy checklist "Rủi ro & cách test rủi ro" ở cuối plan — từng dòng phải có bằng chứng (test pass / grep 0 kết quả / output cụ thể).
3. Grep từ khoá cấm: `upsertFull|recomputeFull|resetFinal` (0 match), indexed-access `Doc\["` trên type mới (0 match), string literal trần thay cho enum member (spot-check), **`deleteMany|deleteOne|drop` trong `test/` mới thêm (0 match)**.
4. So sánh với file Power 6/55 tương ứng (mục "Pattern tham chiếu") — khác biệt phải nằm trong bảng verdict analysis §6, không có diverge "lậu".
5. Ghi kết quả review vào cột Ghi chú của bảng trạng thái.
