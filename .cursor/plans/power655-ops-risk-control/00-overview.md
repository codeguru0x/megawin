# Power 6/55 Operations & Risk Control — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/power655-operations-risk-control.analysis.md` (status `approved`, user chốt toàn bộ câu hỏi mở Q1–Q6 ngày 05/08/2026)
> **Feature slug:** `power655-ops-risk-control` · tuân `.cursor/plans/README.md`.
> **Bản mẫu triển khai:** feature Keno `keno-ops-risk-control` (ĐÃ chạy production, đã hấp thụ p2-01 scale-hardening) — mọi plan copy pattern từ code Keno THẬT, KHÔNG sáng tác. Tham chiếu phụ: Bingo18 (biến thể không combo), Max3D (pairStats).

Biến trang Vận hành Power 6/55 từ "~7 timer on-demand aggregation" thành hệ thống **alert-driven đọc pre-aggregated**: 2 worker `TickLoopWorker` cập nhật stats/alert async (không đụng hot path place-bet), backoffice đọc snapshot O(1). Điểm mới so với Keno (chuẩn cho nhóm game jackpot): number stats tách collection riêng, exposure 2 phần (fixed + jackpot pool-bounded), alert `bao_high_stake`, 1 nhịp timer chung.

## Bảng trạng thái

| Plan | Phase | Status | Review | Phụ thuộc | Ghi chú |
|---|---|---|---|---|---|
| p0-01-foundation-entities-config-indexes | P0 | ✅ done | ☐ chưa review | — | Entities 5 collection + `Power655OpsAlertType` + `GlobalConfigDoc.ops` + defaults + `POWER655_INDEXES` (thêm mới, xoá 3 index chết `drawDate`) |
| p0-02-stats-worker | P0 | ✅ done | ☐ chưa review | 01 | Repos + mappers + accumulator + `SyncBettingStatsUseCase` + `EvaluateOpsAlertsUseCase` + handlers + `stats.yml` + serverless wiring. Test: 79 passed (7 files) — accumulator, evaluate-alerts, mapper, integration idempotency (R1/R5) |
| p0-03-operations-api-ui | P0 | ✅ done | ☐ chưa review | 01, 02 | Snapshot/alerts/combo-lookup API + get-config merge default + tab config "Vận hành" + UI 1 nhịp chung + dead-code cleanup — đã xác nhận code thật khớp plan (09/08) |
| p1-01-combo-transparency | P1 | ✅ done | ☐ chưa review | 02, 03 | Minh bạch chia jackpot cho player (analysis §3.10): endpoint `combo-popularity` ownership-gated + player-sdk `getComboPopularity` + `jackpotUnits` cho bộ 6 số standard. Unit test 7 case đã viết (`get-combo-popularity.test.ts`) — check-types + lint pass; chưa chạy được integration thật trong sandbox (test-guard chặn MONGODB_URI dev-cluster, cần `ALLOW_DB_TESTS=true` cục bộ) |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.
Review: ☐ chưa review · 🔍 đang review · ☑ đã review — cột dành cho **agent review ĐỘC LẬP** (khác agent implement): chỉ tick ☑ sau khi chạy đủ 5 bước "Bước Review BẮT BUỘC" bên dưới và ghi bằng chứng vào cột Ghi chú. Agent implement KHÔNG tự tick cột này.

## Thứ tự thực thi

```
p0-01 ──► p0-02 ──► p0-03 ──► p1-01
```

- **p0-01** độc lập, merge sớm nhất — index và entities là điều kiện tiên quyết cho worker (02) và API (03); gồm cả 2 index phục vụ p1-01 (`{drawId, accountId}` entries + `{drawId, playType, mainNumbers}` combo_stats).
- **p0-02** cần entities/index từ 01; worker đọc config `ops` qua get-config có default (01 khai `DEFAULT_POWER655_CONFIG.ops`) nên KHÔNG cần migration backfill.
- **p0-03** là tầng API/UI cuối của P0, cần data của 02.
- **p1-01** cần combo-stats data (02) đầy và P0 chạy ổn — mirror trình tự Keno (p1-01 sau p0-07).

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

Bắt buộc tuân **§7 Kỷ luật triển khai** của analysis nguồn + §9/§11 analysis Keno:

1. **KHÔNG tự sinh kiến trúc/pattern mới** — mỗi plan có mục **"Pattern tham chiếu"** trỏ file Keno production; copy pattern, đổi shape theo luật Power 6/55 (`power655-game-rules.mdc`).
2. **Checklist rủi ro worker** (Keno §11 + p2-01): watermark per-doc (`DeltaAccumulatedDoc`), `$inc` + `$set lastEntryId` cùng 1 lệnh, `bulkWrite {ordered:false}` coi lỗi 11000 là no-op, KHÔNG lưu top-K theo metric tích luỹ trong doc, index `{drawId, _id}`-tương-đương trước khi code query watermark, giá trị RAW lưu thẳng — biến đổi ở tầng đọc, thresholds trả từ server.
3. **Rules bắt buộc theo tầng:** `mongodb.mdc` (docPath type-safe, repo class thuần, types tách `repos/types/`, index khai thủ công trong `POWER655_INDEXES`), `code-quality-standards.mdc` (§1 JSDoc cho class/method/field, §5.3 const-as-const, §5.4 không indexed-access, §6 curly braces, §7 import đầu file, §8 không duplicate Zod validation), `power655-game-rules.mdc`, `operations-page-ui.mdc`, `game-config-ui.mdc`.
4. **Skills bắt buộc khi làm UI (user chốt 05/08):** `shadcn` (primitive từ registry, không tự chế), `next-best-practices` (RSC boundary), `vercel-react-best-practices` (1 snapshot query + `select` slice, functional setState, explicit conditional rendering), `vercel-composition-patterns` (compound components), `frontend-design`/`web-design-guidelines`.
5. **2 guideline layout:** `../keno-ops-risk-control/operations-page-layout.guideline.md` + `../keno-ops-risk-control/ops-config-page-layout.guideline.md`.
6. **Không đụng hot path place-bet** — mọi thống kê qua worker async đọc insert-stream.
7. **MongoDB best practice khi viết query** (user yêu cầu 05/08): mọi filter/sort phải có index hậu thuẫn (khai trước trong p0-01); projection mỏng cho query hàng đợi (`findNotFinal` chỉ lấy `{drawId, lastEntryId}`); counter vô hướng thay `$size`/`$expr` (không sargable); upsert `$setOnInsert` tách khỏi `$inc`; TTL index cho retention thay batch cleanup; KHÔNG aggregation pipeline trong hot read path (snapshot = `findOne`/`find` + limit).
8. **Divergence thiết kế mới phát sinh** trong lúc implement → thêm dòng vào bảng §6.1 analysis nguồn (đồng bộ ngược Keno sau).
9. **Verify mỗi plan:** `pnpm --filter <package> check-types` + lint + unit test (nếu có) trước khi coi là done; cập nhật bảng trạng thái file này.

## Bước Review BẮT BUỘC sau khi implement xong MỖI plan

1. Đọc lại DIFF toàn bộ, đối chiếu từng mục "File & thay đổi" trong plan — không thừa, không thiếu.
2. Chạy checklist "Rủi ro & cách test rủi ro" ở cuối plan — từng dòng phải có bằng chứng (test pass / grep 0 kết quả / output cụ thể).
3. Grep từ khoá cấm: `upsertFull|recomputeFull|resetFinal` (0 match), indexed-access `Doc\["` trên type mới (0 match), string literal trần thay cho enum member (spot-check).
4. So sánh với file Keno tương ứng (mục "Pattern tham chiếu") — khác biệt phải nằm trong danh sách diverge của analysis §6, không có diverge "lậu".
5. Ghi kết quả review vào cột Ghi chú của bảng trạng thái.
