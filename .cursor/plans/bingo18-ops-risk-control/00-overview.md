# Bingo 18 Operations & Risk Control — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/bingo18-operations-risk-control.analysis.md` (status `approved (P0)`, user chốt toàn bộ câu hỏi mở 30/07/2026)
> **Feature slug:** `bingo18-ops-risk-control` · tuân `.cursor/plans/README.md`.
> **Bản mẫu triển khai:** feature Keno `keno-ops-risk-control` (ĐÃ chạy production) — mọi plan ở đây copy pattern từ code Keno thật, KHÔNG sáng tác.

Biến trang Vận hành Bingo 18 từ "7 timer on-demand aggregation" thành hệ thống **alert-driven đọc pre-aggregated**: worker cập nhật stats/alert async (không đụng hot path place-bet), backoffice đọc findOne O(1) + exposure tính CHÍNH XÁC per-outcome (216 trường hợp — nâng cấp so với proxy của Keno).

## Bảng trạng thái

| Plan | Phase | Status | Phụ thuộc | Ghi chú |
|---|---|---|---|---|
| p0-01-entry-indexes-fix | P0 | ✅ done | — | 3 index `drawDate`→`financialDate` + thêm `idx_draw_id`. Review 30/07: check-types pass, grep `drawDate` còn lại chỉ trên `bingo18_draws`/`draw_counters` (Doc có field thật — hợp lệ). Migration Atlas: DBA drop 3 + create 4 (ghi PR). |
| p0-02-draw-betting-stats | P0 | ✅ done | 01 | Entity 38 bucket + `computeBingo18Exposure` 216 (unit test 84 pass, gồm exposure) + repo/mapper/accumulator + worker `stats-sync` + handler/yml/serverless. Review 30/07: checklist 10 rủi ro tick đủ; potentialWin exact 216 (test case board loại trừ nhau pass). |
| p0-03-ops-config | P0 | ✅ done | — | game-core tách `OpsStatsConfigBase` (Keno check-types pass — 0 regression); `GlobalConfigDoc.ops` + defaults chốt (1tr/300%+50tr/70%/5tr/tick10) + merge/audit + Zod + tab "Vận hành" (AlertToggleRow 4 alert, tooltip 4 phần, KHÔNG topCombosK). Player DTO allowlist xác nhận không lộ `ops`. |
| p0-04-ops-alerts | P0 | ✅ done | 02, 03 | `bingo18_ops_alerts` + evaluator 4 rule (exposure dùng max(sàn,%revenue); bucket_concentration theo `BINGO18_HIGH_MULTIPLIER_BUCKETS`) + list/ack API (trả cả ack — UI v6). Dedupe idempotent qua `bulkUpsertByDedupe`. |
| p0-05-operations-page | P0 | ✅ done | 02, 03, 04 | Snapshot ETag/304 (7→2 timer) + 2 tab + exposure card (worst/expected/top5 outcome) + DiceBoard 6 ô thuần hiển thị + SumTotalBar 16 cột + SideBetCard 3 hướng + RiskCluster + LiveFeed 2 cột lệch + TenantPanel thích ứng + AlertsPanel (ack disclosure UI v6) + fix draw selector sort ASC. Dead-code cleanup: 5 route + 5 use-case + 2 DTO + helpers + 5 repo aggregation + `OpsSummary` type + 5 query key — grep toàn repo 0 consumer (match còn lại thuộc game khác chưa migrate). check-types + lint + 84 test pass. |
| p2-01-stats-worker-scale-hardening | P2 | ⏳ pending | 02, 04 | Scale-hardening worker (verify R1–R11 01/08). BỊ: R3 recompute full-RAM · R5 drift `topAccounts` · R9 no try/catch per-draw · R11 void-after-final không reset. Nhẹ: R4/R7. Tránh R1/R2/R6-nặng (doc 38 bucket ~2–3KB). Hướng §3.5 Keno: `$inc` path + xoá recompute + `final` điều kiện thoát. Fix rẻ trước: F1 resetFinal · F3 try/catch · F2 extendLock trong vòng (tầng base). |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

## Thứ tự thực thi

```
p0-01 (độc lập, làm ngay)
p0-01 ──► p0-02 ─┐
p0-03 ───────────┼──► p0-04 ──► p0-05
     (02 ∥ 03)   ┘
```

- **p0-01** không phụ thuộc gì — merge sớm nhất (index `idx_draw_id` là điều kiện tiên quyết cho watermark query của 02).
- **p0-03** nên xong trước phần evaluator của 04 (đọc ngưỡng từ `ops`); phần stats aggregation của 02 chạy tạm bằng hằng default nếu 03 chưa merge, gắn config ở 03.
- **p0-05** là tầng UI cuối, cần API/data của 02/03/04.

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

Bắt buộc tuân **§9 Kỷ luật triển khai** của analysis Keno + §6 analysis Bingo18:

1. **KHÔNG tự sinh kiến trúc/pattern mới** — mỗi plan có mục **"Pattern tham chiếu"** trỏ file Keno production; copy pattern, đổi shape theo luật chơi Bingo 18.
2. **Checklist 10 rủi ro worker** (Keno analysis §11 + overview Keno §"Review rủi ro"): watermark per-draw · index `{drawId,_id}` trước khi code · recompute mọi status hậu-chốt chưa final (cursor, không skip/limit) · giá trị phi tuyến lưu RAW, biến đổi ở tầng đọc · conditional write (ETag/304) · baseline top-K · không indexed-access §5.4 · const-as-const §5.3, Zod `z.enum(Object.values(...))` · thresholds từ response · `username` + `accountId` (không `accountName`).
3. **Rules bắt buộc theo tầng:** `mongodb.mdc` (docPath, repo class thuần, types tách `repos/types/`), `entity-typesafe-mongodb.mdc` (named interface, dot notation), `code-quality-standards.mdc` (§1–7), `bingo18-game-rules.mdc` (số 1–6 integer KHÔNG zero-padded, unified boards, đọc prize từ GlobalConfig), `game-config-ui.mdc` (§14 nuqs tab, §16 tooltip 4 phần), `operations-page-ui.mdc`, `player-display-username.mdc`.
4. **Skills bắt buộc khi làm UI:** `vercel-react-best-practices` (snapshot 1 query + `select` slice, memo cell, functional setState, no barrel-import nặng), `vercel-composition-patterns` (compound component, không boolean-prop proliferation, React 19 `use()`), `web-design-guidelines` (a11y, `text-xs` min, `tabular-nums`), `shadcn` (thiếu primitive → lấy từ registry, không tự chế).
5. **2 guideline layout bắt buộc:** `../keno-ops-risk-control/operations-page-layout.guideline.md` (trang Vận hành) + `ops-config-page-layout.guideline.md` (tab "Vận hành" trang Config — AlertToggleRow, KHÔNG list phẳng).
6. **Không đụng hot path place-bet** — mọi thống kê qua worker async.
7. **MongoDB type-safe** — `docPath<TDoc>()`, entity `_id: unknown` + `{Name}Entity extends Omit<Doc,"_id">`, index khai trong `BINGO18_INDEXES`.
8. **Verify mỗi plan:** `pnpm --filter <package> check-types` + lint trước khi coi là done.

## Bước Review BẮT BUỘC sau khi implement xong MỖI plan

> Yêu cầu user 30/07/2026: "Phải có bước review lại logic và code mỗi khi plan triển khai xong."
> Mỗi plan có mục "Review sau triển khai" riêng; đây là khung chung — KHÔNG được bỏ qua:

1. **Review logic:** đối chiếu từng công thức với analysis §3 (bucket accumulate, exposure 216, ngưỡng alert) và với luật chơi (`bingo18-game-rules.mdc`, `match-result.ts`, `settle-entries.ts`) — số liệu stats phải khớp settle pipeline trên cùng data.
2. **Review code:** grep checklist — `^import |^export .* from` giữa file (§6); indexed-access `["..."]` (§5.4); string literal trần cho tập đóng (§5.3); mapper nằm ngoài `infras/mappers/` (bài học Keno #1); `validateInput` duplicate Zod (§7).
3. **Review dead code** (riêng p0-05 — checklist Keno §9.3): grep tên use-case/route/method cũ TOÀN REPO, 0 consumer mới được xoá; xoá theo thứ tự route → query key → use-case → DTO → repo method.
4. **Review UI** (plan có UI): đối chiếu checklist cuối 2 guideline layout; thresholds không hardcode; username qua `PlayerName`.
5. Ghi kết quả review (đã phát hiện/sửa gì) vào chính plan file + cập nhật bảng trạng thái ở đây. Điểm không chắc chắn → hỏi user, KHÔNG tự quyết.

## Định nghĩa "Done" toàn feature P0

- Trang Vận hành đọc từ stats doc (findOne) — không còn aggregation on-demand cho summary/dice/playtype/tenant/combos; đúng 2 timer (snapshot + live-feed), 304 khi stats chưa đổi, tắt poll khi settled.
- Exposure card hiển thị worst-case CHÍNH XÁC (outcome đạt max) + expected payout; bảng 6 ô xúc xắc thuần hiển thị (Dòng tiền + lượt, KHÔNG per-number liability, KHÔNG chọn số); bar phân bổ sumTotal 16 cột; side bet card 3 hướng.
- Staff nhận alert (badge + panel ack, formatter theo type): `large_bet` / `exposure_threshold` / `sidebet_skew` / `bucket_concentration`. **Hành vi Ack theo UI v6 Keno 30/07 (guideline §4):** ack không xoá khỏi UI (giữ audit trail, ack ≠ hết rủi ro), thu gọn per-group dưới disclosure "Xem N đã xử lý ▾", badge chỉ đếm `new`, nhóm toàn ack tự đóng.
- Tab "Vận hành" trang config sửa được ngưỡng + tickSeconds + top-K (CHỈ field Bingo 18 dùng — `OpsStatsConfigBase`); mọi field tooltip 4 phần; toggle alert theo khuôn `AlertToggleRow`; player DTO KHÔNG lộ `ops`.
- `BINGO18_INDEXES` hết index `drawDate` sai; có `idx_draw_id`; draw selector sort active ASC.
