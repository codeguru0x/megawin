# p0-05 — Trang Vận hành Max 3D: snapshot (7→2 timer) + 2 tab + exposure/pair panels + dead-code cleanup

> **Nguồn:** `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` §4, §7 Q4 (search box — đã chốt), verdict #7.
> **Phase:** P0 · **Phụ thuộc:** p0-02, p0-03, p0-04 · **Blocks:** —.
> **Guideline BẮT BUỘC:** `../keno-ops-risk-control/operations-page-layout.guideline.md` (checklist §7 — mục "bảng số" thay bằng histogram chữ số, xem Khác biệt).

## Mục tiêu

Chuyển `/games/max3d/operations` từ 7 timer on-demand về **2 timer** đọc pre-aggregated; 2 tab; exposure card (worst-case + cặp nguy hiểm nhất); histogram chữ số 3×10 + top triplets + top cặp; search box tra cứu; xoá dead code. Draw selector ĐÃ đúng — không đụng.

## Pattern tham chiếu

Y hệt `../bingo18-ops-risk-control/p0-05-operations-page.plan.md` (khung Keno: snapshot route ETag/304, hooks `select` slice, 2 tab nuqs, alerts-panel formatter, `PlayerName` chung, dead-code checklist §9.3). Dưới đây CHỈ ghi khác biệt Max 3D.

## Việc cần làm (khác biệt so với Bingo18 p0-05)

### 1. Snapshot endpoint

`GET /api/max3d/operations/snapshot?drawId=` → `{ drawStatus, updatedAt, stats (doc trọn — byPlayType/tripletStakes/topPairs/topPotential/base), exposure: Max3dExposureResult (computeMax3dExposure — tính tại use-case, KHÔNG lưu doc), alertCounts, thresholds { exposureWarnAmount; pairLiabilityWarnAmount; comboAccountsWarn; largeBetAmount }, tickSeconds }`. ETag = `updatedAt` → 304.

- ⚠️ `tripletStakes` sparse tối đa ~1000 key (~80KB) — chấp nhận trong response (kỳ 3 lần/tuần, 304 hầu hết thời gian); FE dựng histogram/top-list qua adapter memoized, KHÔNG loop 1000 key trong render body mỗi lần.

### 2. Hooks 7→2 timer

`useOpsSnapshot(drawId, isSettled)` — `refetchInterval` = `tickSeconds`×1000 từ response (**default fallback 30s** — chốt Q3), tắt khi settled. Xoá hooks/keys cũ: summary/tenants/triplet-frequency/playtype-distribution/top-combos. GIỮ live-entries + winning-entries + draw detail + mutations. Draw selector: giữ nguyên use-case (đã sort đúng), bỏ timer riêng → invalidate theo `drawStatus` từ snapshot.

### 3. UI 2 tab

**Tab Giám sát:** Draw command center → Alerts panel (formatter 4 type theo `MAX3D_OPS_ALERT_TYPE_LABELS`; `pair_liability`/`combo_concentration` render **2 triplet badge** + units + accounts list `PlayerOutstandingLink`; `large_bet` như Keno) → KPI strip + **Exposure card**:

- **Hành vi Ack (UI v6 Keno 30/07 — guideline §4, BẮT BUỘC):** ack KHÔNG xoá khỏi UI (audit trail; ack ≠ hết rủi ro — payload vẫn cập nhật mỗi tick), thu gọn **per-group** dưới disclosure "Xem N đã xử lý ▾"; badge `AccordionTrigger` chỉ đếm `new`; nhóm còn `new` mở sẵn, nhóm toàn ack đóng + dòng "Đã xử lý hết cảnh báo mới của nhóm này." **Đặc biệt quan trọng với Max 3D:** `pair_liability`/`combo_concentration` dedupe **per-pair** → nhiều cặp vượt ngưỡng = nhiều alert riêng biệt trong 1 nhóm, kỳ bán nhiều ngày tích luỹ — không có disclosure thì panel dài không quét được.

- `worstCaseTotal` (đỏ) + breakdown [basic (nhãn "chính xác") | cặp ĐB | đuôi plus (nhãn "ước tính")] — nhãn exact/proxy theo `Max3dExposureResult.note`, KHÔNG trộn lẫn.
- **"Cặp nguy hiểm nhất"**: 2 triplet badge + liabilityĐB + units + accounts — click → tab Phân tích cuộn tới Top cặp.
- Gauge `worstCaseTotal / exposureWarnAmount` (thresholds từ response — Risk #9).

**Tab Phân tích cược** (analysis §4.3):

1. Phân bổ playType — card compact 4 nhóm (straight/combo3/combo6/plus) từ `byPlayType`.
2. **Histogram chữ số 3×10** (mới — KHÔNG grid 1000 ô): 3 hàng (trăm/chục/đơn vị) × 10 cột (0–9), mỗi ô Dòng tiền + lượt, heat theo tiền — adapter dựng từ `tripletStakes` (memoized). Thuần hiển thị.
3. **Top triplets** — list top-N theo amount (3 chữ số badge + amount + units tách straight/combo).
4. **Cụm rủi ro 3 cột** [Top người chơi (emerald) | Top phải trả (đỏ nền, nhãn "Phải trả (ước tính)" — topPotential là proxy) | **Top cặp**]: Top cặp mỗi dòng = 2 triplet badge + units + accounts + amount + **liabilityĐB đỏ**; footer ghi "Top {topCombosK} cặp — cặp ngoài danh sách có liability nhỏ".
5. **Search box tra cứu** (chốt Q4 — KHÔNG dialog/collection riêng): input 3 hoặc 6 chữ số → filter client-side `tripletStakes` (1 triplet) / `topPairs` (cặp — normalize sort trước khi so); không thấy trong topPairs → hiện "không nằm trong top K". Đặt trong header cụm rủi ro.
6. Live feed 2 cột lệch: **Basic `1.7fr` | Plus `1fr`**, cuộn độc lập, cược lớn (≥ `thresholds.largeBetAmount`) tô đỏ. Đại lý card hẹp thích ứng.
7. KHÔNG side-bet card (không có side bet).

Thứ tự macro: rủi ro TRƯỚC → monitoring SAU (guideline §5).

### 4. Performance & code

Y hệt Bingo18 p0-05 §5: adapter thuần `_lib/adapters.ts` (digitHistogram, topTriplets, pairRows — memoized theo `updatedAt`), cell memo props primitives, `tabular-nums`, thresholds fallback-only.

### 5. Dead-code cleanup (checklist Keno §9.3 — thứ tự ngược dependency)

1. Routes: `api/max3d/operations/{summary,tenants,triplet-frequency,playtype-distribution,top-combos}/route.ts` + rmdir.
2. Hooks + query keys cũ.
3. Use-cases: `get-ops-summary` / `get-tenant-breakdown` / `get-triplet-frequency` / `get-playtype-distribution` / `get-top-combos` + DTO + barrel.
4. Repo methods: `aggregateOpsSummary` / `aggregateTenantBreakdown` / `aggregateTripletFrequency` / `aggregatePlayTypeDistribution` / `aggregateTopSingleCombos` / `aggregateTopPlusCombos` (entry-repo — sâu nhất, dễ sót).
5. Zod schemas `_lib/schema.ts` không còn dùng. GIỮ: live-entries, winning-entries, draw-selector, `helpers.ts` (grep consumer trước).
6. Grep TOÀN REPO từng tên trước khi xoá; xoá xong `check-types` + lint (xoá `.next/` nếu module ma).

## Không làm

KHÔNG grid 1000 ô; KHÔNG per-triplet liability trên histogram chữ số (chữ số ≠ đơn vị trả thưởng — cùng bài học per-number Keno §3.7); KHÔNG dialog tra cứu; KHÔNG sửa draw selector (đã đúng); KHÔNG timer thứ 3; KHÔNG copy `PlayerName`.

## Verify

`check-types` + lint backoffice + application. Dev: 2 timer + 304 + 0 request khi settled; số liệu khớp trang cũ (so song song trước khi xoá); exposure card khớp unit test fixture p0-02; search box tra "096" và "096,389" đúng; alert flow ack.

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] **Logic:** adapter đối chiếu shape doc p0-02; nhãn exact/proxy đúng từng phần exposure; liability hiển thị = `computePairLiabilities` (không tự nhân ở FE).
- [ ] **Dead code:** grep lại 5 use-case + 5 route + 6 repo method TOÀN REPO — 0 kết quả ngoài plans/analysis.
- [ ] **UI checklist** guideline §7 (mục bảng số thay bằng histogram — ghi chú lệch có chủ đích) + **hành vi Ack guideline §4 (UI v6): disclosure per-group, badge đếm `new`, nhóm toàn ack tự đóng — test với ≥3 alert `pair_liability` cùng nhóm** + web-design-guidelines + re-render khi 304.
- [ ] Ghi kết quả review + cập nhật `00-overview.md`.

## Định nghĩa Done

Trang 2 timer đọc 100% snapshot, exposure/pair/histogram/search đúng thiết kế, dead code sạch (grep chứng minh), review xong, overview cập nhật.
