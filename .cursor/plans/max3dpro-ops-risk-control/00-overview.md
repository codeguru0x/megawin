# Max 3D Pro Operations & Risk Control — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` (status `approved (P0)`; 1 analysis chung 2 game, bảng khác biệt §2.4)
> **Feature slug:** `max3dpro-ops-risk-control` · tuân `.cursor/plans/README.md`.
> **Bản mẫu triển khai:** `../max3d-ops-risk-control/` — **làm SAU Max 3D** (user chốt thứ tự Bingo18 → Max3D → Pro). Mỗi plan Pro = plan Max 3D tương ứng + delta §2.4; KHÔNG copy-paste mù — từng delta phải đối chiếu code domain Pro thật.

## Delta cốt lõi so với Max 3D (analysis §2.4 — bảng bắt buộc đọc trước mọi plan)

| | Max 3D | Max 3D Pro |
|---|---|---|
| Play modes | basic (straight/combo3/combo6) + plus | `multiNumber` (3–20 triplet → **P(n,2) ordered pairs**) + `multiDigit` (perms(front)×perms(back)) — LUÔN là cặp, KHÔNG có basic đơn |
| Hạng giải | 2 enum (Basic 4 + Plus 7) | **1 enum `PrizeTier` 8 hạng** — có `specialSub` (phụ ĐB 400tr, chỉ Pro) |
| ĐB | unordered bipartite, 1 tỷ | **ORDERED**: đúng thứ tự = ĐB 2 tỷ, ngược = phụ ĐB 400tr |
| Duplicate pair | Nhất→Sáu ×2, ĐB không ×2 | Nhất→Sáu ×2, ĐB/phụ ĐB = **special + specialSub** (2,4 tỷ — KHÔNG ×2) |
| Pair key stats | unordered "t1,t2" (sort) | **ORDERED "t1>t2"** — thứ tự là bản chất giải |
| Expansion | — | `expandSelectionToPairs()` (`game-max3dpro/rules/play-types.ts`) — dùng nguyên, KHÔNG viết lại |
| Collections | `max3d_*` | `max3d_pro_*` (`Max3dproCollections`) |
| Lịch | T2/T4/T6 | T3/T5/T7 |
| Ngưỡng default | largeBet 5tr · pairLiability 2 tỷ | largeBet **10tr** (multiNumber 20 bộ = 3,8tr/kỳ) · pairLiability **4 tỷ** |

## Bảng trạng thái

| Plan | Phase | Status | Phụ thuộc | Ghi chú |
|---|---|---|---|---|
| p0-01-entry-indexes-fix | P0 | ✅ done | — | 2 index đổi tên + XOÁ `idx_tenant_drawDate_status` (trùng) + `idx_draw_id` + index BettingStats/OpsAlerts trên `max3dpro_ticket_entries`. |
| p0-02-draw-betting-stats | P0 | ✅ done | 01 + Max3D p0-02 done | Collection `max3dpro_draw_betting_stats` (theo convention `max3dpro_*` sẵn có, KHÔNG `max3d_pro_*`). pairKey ORDERED `"first>second"` (audit grep: 0 sort/normalize); expand bằng `expandSelectionToPairs()` domain; liability = forward×special + reverse×specialSub, duplicate = units×(special+specialSub); tail proxy Năm/Sáu; worker `max3dpro:stats-sync` tick 30s + handler/yml/serverless. |
| p0-03-ops-config | P0 | ✅ done | Max3D p0-03 done | `GlobalConfigDoc.ops` + defaults Pro chốt (largeBet **10tr** / pairLiability **4 tỷ** / exposure 5 tỷ / 5 acc / tick 30 / K 100-50-50) + mergeOps/audit + Zod + tab "Vận hành" (tooltip ghi rõ 2 chiều ĐB/phụ ĐB). |
| p0-04-ops-alerts | P0 | ✅ done | 02, 03 | `max3dpro_ops_alerts` + evaluator 4 rule — `pair_liability` payload gồm `unitsForward/unitsReverse` (cộng cả chiều ngược specialSub), dedupe theo pairKey ordered; list/ack API (trả cả ack — UI v6). |
| p0-05-operations-page | P0 | ✅ done | 02, 03, 04 | Snapshot ETag/304 (7→2 timer) + 2 tab + ExposureCard 2 thành phần (cặp ĐB 2 chiều + đuôi Năm/Sáu proxy) + PairTable mũi tên `first → second` + cột `forward/reverse bộ` + TopTripletsCard + RiskCluster + TenantPanel + AlertsPanel (ack disclosure UI v6) + LiveFeed giữ nguyên (playMode colors inline). Dead-code cleanup: 5 route + 5 use-case + helpers + 2 DTO + repo aggregation block + query keys — grep sạch. check-types backoffice + application + worker + domain pass. |
| p2-01-stats-worker-scale-hardening | P2 | ⏳ pending | 02, 04 | Scale-hardening worker (verify R1–R11 01/08). **NẶNG NHẤT 4 game ở R3/R5**: pair ORDERED key space **10⁶**, 380 pair/board multiNumber, mỗi key kèm `Set<accountId>` RAM. Cũng BỊ R6 (~50–60KB) · R9 · R11. Tránh R1/R2. Hướng §3.5 + **tách collection phụ `max3dpro_draw_pair_stats` (ưu tiên #1)** để hạ RAM 10⁶ + hết drift, giữ ordered tuyệt đối. Fix rẻ trước: F1 resetFinal · F3 try/catch · F2 extendLock. |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

## Thứ tự thực thi

```
(chờ plan Max 3D tương ứng done trước — copy từ code đã review)
p0-01 ──► p0-02 ─┐
p0-03 ───────────┼──► p0-04 ──► p0-05
```

## Nguyên tắc chung + Bước Review BẮT BUỘC

Y hệt `../max3d-ops-risk-control/00-overview.md` (đọc file đó). Nhấn mạnh riêng Pro: **mọi chỗ chạm pair PHẢI giữ thứ tự** — review từng vị trí normalize/sort xem có vô tình đảo thứ tự không (bug nguy hiểm nhất khi copy từ Max 3D: `$sortArray`/sort pairKey của Max 3D là ĐÚNG với plus unordered nhưng SAI với Pro). Rule game: `max3dpro-game-rules.mdc`.

## Định nghĩa "Done" toàn feature P0

Như Max 3D (bao gồm **hành vi Ack UI v6 Keno 30/07** — guideline §4: ack không xoá/audit trail, disclosure per-group, badge đếm `new`), thay: pairKey ordered hiển thị mũi tên `t1 → t2`; exposure card thêm dòng phụ ĐB; liability cặp = `units(đúng chiều) × special + units(chiều ngược) × specialSub`; live feed 2 cột MultiNumber (rộng) | MultiDigit (hẹp); collections/labels `max3d_pro_*`.
