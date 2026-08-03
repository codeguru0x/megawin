# p0-04 — Alert framework: `max3d_pro_ops_alerts` + evaluator (pair_liability 2 chiều) + list/ack API

> **Nguồn:** analysis §3.5, bảng delta §2.4 · **Phase:** P0 · **Phụ thuộc:** p0-02, p0-03 + Max 3D p0-04 done · **Blocks:** p0-05.
> **Plan mẫu:** `../max3d-ops-risk-control/p0-04-ops-alerts.plan.md` — CHỈ ghi delta.

## Delta so với Max 3D p0-04

1. Entity/collection: `Max3dproOpsAlertDoc` + `Max3dproCollections.OpsAlerts: "max3d_pro_ops_alerts"` + 2 index vào `MAX3DPRO_INDEXES`.
2. **`pair_liability` — liability tính 2 CHIỀU** (từ `computeProPairLiabilities` p0-02): `units(t1>t2) × special + units(t2>t1) × specialSub`; **dedupeKey theo CẶP KHÔNG THỨ TỰ** `"pair_liability:{min(t1,t2)},{max(t1,t2)}"` — vì 2 chiều của cùng 1 cặp là CÙNG một rủi ro kết quả (special=[t1,t2] trả cả 2 chiều), bắn 2 alert riêng sẽ nhiễu; payload ghi rõ breakdown units/liability từng chiều + tổng.
3. `combo_concentration`: accounts distinct đếm GỘP 2 chiều của cặp (cùng lý do) — merge từ 2 key topPairs; dedupeKey như trên.
4. `exposure_threshold`: so `computeMax3dproExposure().worstCaseTotal` với `exposureWarnAmount`; payload breakdown pair ĐB + đuôi (nhãn exact/proxy).
5. `large_bet`: y hệt (ngưỡng 10tr từ config Pro).

## Không làm / Verify / Review sau triển khai / Done

Y hệt Max 3D p0-04, THÊM verify: cược 2 chiều 1 cặp ở 2 entry khác nhau → 1 alert duy nhất (dedupe unordered) với breakdown 2 chiều đúng; review audit không chỗ nào đảo/sort nhầm khi build payload chiều. Cập nhật `00-overview.md`.
