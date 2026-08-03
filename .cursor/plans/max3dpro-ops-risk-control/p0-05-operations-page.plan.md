# p0-05 — Trang Vận hành Max 3D Pro: snapshot + 2 tab + pair ordered UI + dead-code cleanup

> **Nguồn:** analysis §4, bảng delta §2.4, §7 Q4 · **Phase:** P0 · **Phụ thuộc:** p0-02, p0-03, p0-04 + Max 3D p0-05 done · **Blocks:** —.
> **Plan mẫu:** `../max3d-ops-risk-control/p0-05-operations-page.plan.md` — khung y hệt (snapshot ETag/304, 2 timer, 2 tab, histogram chữ số 3×10, top triplets, cụm rủi ro 3 cột, search box, dead-code checklist); CHỈ ghi delta Pro.

## Delta so với Max 3D p0-05

1. **Snapshot** `/api/max3dpro/operations/snapshot`: `exposure = computeMax3dproExposure` (KHÔNG có breakdown basic — chỉ pair + đuôi proxy); `thresholds` từ config Pro.
2. **Exposure card**: `worstCaseTotal` + "Cặp nguy hiểm nhất" hiển thị **CẶP ORDERED — badge `t1 → t2`** (mũi tên, guideline §6 analysis: thứ tự là bản chất ĐB/phụ ĐB) + **dòng phụ ĐB**: breakdown "đúng chiều X unit × 2 tỷ · chiều ngược Y unit × 400tr".
3. **Top cặp** (cụm rủi ro): mỗi dòng `t1 → t2` + units + accounts + liability 2 chiều gộp (từ `computeProPairLiabilities` — KHÔNG tự nhân ở FE). Search box tra cặp: nhập 6 chữ số → hiện CẢ 2 chiều (2 dòng nếu cả 2 có cược) — KHÔNG normalize input.
4. **Phân bổ playType**: 2 nhóm `multiNumber` / `multiDigit` (không phải 4).
5. **Live feed 2 cột lệch**: **MultiNumber `1.7fr` (rộng — nhiều triplet badge, tối đa 20) | MultiDigit `1fr` (hẹp — hiển thị frontDigits/backDigits + số cặp)**. Cược lớn ≥ 10tr (thresholds) tô đỏ.
6. **Alerts panel**: formatter `pair_liability` render cặp + breakdown 2 chiều (payload p0-04); nhãn `MAX3DPRO_OPS_ALERT_TYPE_LABELS`. **Hành vi Ack UI v6 (guideline §4)** kế thừa nguyên từ Max 3D p0-05: ack không xoá, disclosure "Xem N đã xử lý ▾" per-group, badge đếm `new`, nhóm toàn ack tự đóng.
7. **Dead-code cleanup**: cùng danh sách 5 use-case / 5 route / repo methods (`aggregateOpsSummary`/`aggregateTenantBreakdown`/`aggregateTripletFrequency`/`aggregatePlayTypeDistribution`/`aggregateTopSingleCombos`/`aggregateTopPlusCombos`) trong `game-max3dpro-application` + `api/max3dpro/operations/` — grep TOÀN REPO trước khi xoá. GIỮ live-entries/winning-entries/draw-selector (selector Pro ĐÃ sort đúng — không đụng).

## Không làm

Như Max 3D p0-05, THÊM: KHÔNG normalize/sort pair ở BẤT KỲ tầng UI nào (adapter/search/badge) — hiển thị đúng chiều dữ liệu.

## Verify / Review sau triển khai / Done

Y hệt Max 3D p0-05 (2 timer + 304 + số khớp trang cũ + dead-code grep). Review THÊM: audit toàn bộ chỗ render pair — mũi tên đúng chiều với data; search 2 chiều ra 2 dòng riêng. Cập nhật `00-overview.md`.
