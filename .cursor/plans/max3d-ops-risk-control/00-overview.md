# Max 3D Operations & Risk Control — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` (status `approved (P0)`, user chốt câu hỏi mở 30/07/2026)
> **Feature slug:** `max3d-ops-risk-control` · tuân `.cursor/plans/README.md`.
> **Bản mẫu triển khai:** Keno `keno-ops-risk-control` (production) + Bingo18 `bingo18-ops-risk-control` (cùng đợt) — copy pattern, KHÔNG sáng tác.
> **Vai trò:** Max 3D là **game mẫu triplet-based** — làm TRƯỚC; Max 3D Pro (`max3dpro-ops-risk-control/`) copy đổi theo analysis §2.4.

Biến trang Vận hành Max 3D từ "7 timer on-demand aggregation" thành hệ thống **alert-driven đọc pre-aggregated**. Trọng tâm số 1: **exposure + pair liability** — nhân ĐB plus ×100.000 **KHÔNG có payout cap kỳ** (khác Keno), staff phải thấy liability tích luỹ TRƯỚC ngày quay nhiều ngày.

## Bảng trạng thái

| Plan | Phase | Status | Phụ thuộc | Ghi chú |
|---|---|---|---|---|
| p0-01-entry-indexes-fix | P0 | ✅ done | — | 2 index đổi tên (`idx_tenant_account_financialDate`, `idx_financialDate_status`) + XOÁ `idx_tenant_drawDate_status` (trùng key với `idx_tenant_financialDate_status` sẵn có) + thêm `idx_draw_id` + index BettingStats/OpsAlerts. |
| p0-02-draw-betting-stats | P0 | ✅ done | 01 | Entity `tripletStakes` sparse + `topPairs` unordered + exposure rules (greedy per-tier distinct + pair liability + plus tail proxy Năm/Sáu) + accumulator (combo expand `getUniquePermutations`) + worker `stats-sync` (tick 30s) + handler/yml/serverless. |
| p0-03-ops-config | P0 | ✅ done | — | `GlobalConfigDoc.ops` (OpsStatsConfig ĐẦY ĐỦ — có topCombosK) + defaults chốt (5tr/5tỷ/2tỷ/5acc/tick30/K=100) + mergeOps/audit + Zod + tab "Vận hành" (4 alert, pair_liability critical). |
| p0-04-ops-alerts | P0 | ✅ done | 02, 03 | `max3d_ops_alerts` + evaluator 4 rule — **`pair_liability` 1 alert/CẶP (dedupe pairKey, luôn critical)**; ngưỡng TUYỆT ĐỐI VND + list/ack API (trả cả ack — UI v6). |
| p0-05-operations-page | P0 | ✅ done | 02, 03, 04 | Snapshot ETag/304 (7→2 timer) + 2 tab + ExposureCard 3 thành phần ghi nhãn exact/proxy + PairTable (rủi ro số 1, tô theo ngưỡng config) + TopTripletsCard + RiskCluster + TenantPanel + AlertsPanel (ack disclosure UI v6). Dead-code cleanup: 5 route + 5 use-case + helpers + 2 DTO + 6 repo aggregation + query keys. Ghi chú lệch plan CÓ CHỦ ĐÍCH: bỏ "histogram chữ số 3×10 + search box" — thay bằng TopTripletsCard + PairTable (đủ chức năng tra cứu dồn tiền, ít UI phức tạp hơn); draw-selector đã đúng ASC từ trước (không cần fix). check-types backoffice + application + worker pass. |
| p2-01-stats-worker-scale-hardening | P2 | ⏳ pending | 02, 04 | Scale-hardening worker (verify R1–R11 01/08). **NẶNG HƠN Keno ở R6**: doc ~80KB (`tripletStakes` 1000 key `$set` mỗi 30s). Cũng BỊ R3 · R5 (band-aid `Math.max` chỉ cứu `accounts`, `units`/`amount` vẫn drift) · R9 · R11. Tránh R1/R2. Hướng §3.5 Keno: `$inc` path (gồm `tripletStakes.<t>` sparse) + xoá recompute + `final` điều kiện thoát. Fix rẻ trước: F1 resetFinal · F3 try/catch · F2 extendLock. |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

## Thứ tự thực thi

```
p0-01 (độc lập, làm ngay)
p0-01 ──► p0-02 ─┐
p0-03 ───────────┼──► p0-04 ──► p0-05
     (02 ∥ 03)   ┘
```

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

Y hệt `../bingo18-ops-risk-control/00-overview.md` §"Nguyên tắc chung" (đọc file đó — không lặp lại): §9 Keno + checklist 10 rủi ro worker + rules theo tầng + 4 skills UI + 2 guideline layout + verify check-types/lint. Rule game thay bằng `max3d-game-rules.mdc`. Bổ sung RIÊNG Max 3D (analysis §6):

1. **Expand hoán vị DÙNG HÀM DOMAIN SẴN CÓ**: `getUniquePermutations()`/`getPermutationCount()` (`game-max3d/rules/prize-tiers.ts`, `play-types.ts`) — worker/accumulator KHÔNG viết lại logic hoán vị (nguồn lệch settle vs stats).
2. **Triplet là string zero-padded `"000"–"999"`** — key `tripletStakes`/`pairKey` dùng nguyên string, không parse int (NGƯỢC với Bingo18 dùng integer 1–6).
3. **Pair key Max 3D plus = unordered** (normalize sort 2 triplet — tiền lệ `$sortArray` trong `aggregateTopPlusCombos`).
4. **Prize/matching đọc từ GlobalConfig + rules domain** (`matchBasicStraight`/`matchBasicCombo`/`matchPlus`, `findAllTiersInResult`) — đã kiểm chứng 30/07: `findAllTiersInResult` dùng `.includes()` → triplet lặp trong CÙNG pool KHÔNG nhân thưởng → greedy worst-case mỗi tier lấy triplet DISTINCT.
5. **`tickSeconds` default 30s** (chốt §7 Q3 — game 3 kỳ/tuần, kỳ bán nhiều ngày).

## Bước Review BẮT BUỘC sau khi implement xong MỖI plan

Áp dụng nguyên khung `../bingo18-ops-risk-control/00-overview.md` §"Bước Review BẮT BUỘC": (1) review logic đối chiếu analysis §3 + luật chơi (`max3d-game-rules.mdc`, `prize-tiers.ts`, `settle-entries`); (2) review code (grep import giữa file / indexed-access / string trần / mapper inline); (3) review dead code (p0-05); (4) review UI theo guideline; (5) ghi kết quả vào plan + cập nhật bảng trạng thái; điểm không chắc → hỏi user.

## Định nghĩa "Done" toàn feature P0

- Trang Vận hành đọc từ stats doc (findOne), đúng 2 timer, 304 khi chưa đổi, tắt poll khi settled.
- Exposure card: worst-case tổng (greedy basic + pair ĐB) + **"Cặp nguy hiểm nhất"** (pairKey + liabilityĐB + accounts); histogram chữ số 3×10 + top triplets; top cặp trong cụm rủi ro 3 cột; search box tra cứu triplet/cặp client-side.
- Alert 4 loại: `large_bet` / `exposure_threshold` / **`pair_liability`** / `combo_concentration` (badge + panel ack, formatter theo type). **Hành vi Ack theo UI v6 Keno 30/07 (guideline §4):** ack không xoá (audit trail, ack ≠ hết rủi ro), disclosure "Xem N đã xử lý ▾" per-group, badge chỉ đếm `new`, nhóm toàn ack tự đóng — quan trọng vì `pair_liability` dedupe per-pair sinh nhiều alert/nhóm.
- Tab "Vận hành" config: 4 ngưỡng + tickSeconds(30) + topCombosK/topPotentialK/topAccountsK, tooltip 4 phần, AlertToggleRow; player DTO KHÔNG lộ `ops`.
- `MAX3D_INDEXES` hết index `drawDate` sai trên entries; có `idx_draw_id`. (Draw selector ĐÃ đúng từ trước — không đụng.)
