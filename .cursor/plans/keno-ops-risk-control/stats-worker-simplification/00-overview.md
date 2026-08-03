# Keno Stats Worker Simplification — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/keno-stats-worker-simplification.analysis.md` (status `discussing`, mọi câu hỏi mở ĐÃ CHỐT 02/08/2026).
> **Scope chốt:** 02/08/2026 — user duyệt §5.1–§5.6 + Phương án A (UI reconcile) + quyết định đóng sổ tối giản (§5.3).
> **Quan hệ:** kế thừa `../p2-01-stats-worker-scale-hardening.plan.md` (ĐÃ done cho Keno) — plan này KHÔNG mở lại
> bất kỳ quyết định K1–K8 nào của p2-01 (analysis §3). Đây là refactor **cấu trúc**, không phải sửa correctness.

Feature này tách worker stats Keno thành 2 vai rõ ràng (ghi delta / đánh giá alert), nâng vòng lặp tick lên
`worker-core` dùng chung 4 game, tối giản `ensureDocs` + chuyển default sang phía đọc (mapper), dọn code quality,
và hợp nhất KPI với số chính thức từ settle. Keno là bản chuẩn; file p2-01 trong thư mục này là **hướng dẫn port**
cho bingo18 / max3d / max3dpro.

## Bảng trạng thái

Tách 2 cột trạng thái độc lập: **Code** (implement theo mô tả plan, trừ mục "Review & rủi ro") và
**Review & rủi ro** (chạy checklist rủi ro + verify của từng plan — thực hiện ở task riêng SAU KHI code xong).

| Plan | Phase | Code | Review & rủi ro | Phụ thuộc | Ghi chú |
|---|---|---|---|---|---|
| p0-01-worker-core-tick-loop | P0 | ✅ done | ✅ done | — | `TickLoopWorker` trong worker-core + refactor `SyncBettingStatsUseCase` dùng base mới. Hạ tầng thuần, KHÔNG chạm nghiệp vụ. |
| p0-02-keno-split-ops-alerts-worker | P0 | ✅ done | ✅ done | p0-01 | Worker mới `keno:ops-alerts` (cursor `updatedAt`) + index `{updatedAt:1}` + dọn alert code khỏi sync worker. |
| p0-03-keno-minimal-docs-read-defaults | P0 | ✅ done | ✅ done | p0-01 (phần enroll) | `ensureDocs` còn 2 field + mapper normalize phía đọc + enroll 1 lần/invocation. |
| p1-01-keno-stats-code-quality | P1 | ✅ done | ✅ done | p0-02 (Q1 rà JSDoc sau tách) | Q1 comment stale · Q2 cast lỗ type · Q3 xoá field `entries` khỏi `KenoPlayTypeStat` · ~~Q4 alert `worker_stuck`~~ **SUPERSEDED 03/08 → `.cursor/plans/system-worker-health/`** · **Q5** rename `boards` → `sets` (4 game + FE) + migration. |
| p1-02-keno-ops-kpi-official-financial | P1 | ✅ done | ✅ done | — (độc lập backend) | Phương án A: adapter `toKpi` ưu tiên `DrawDoc.financial`/`stats` khi kỳ Settled. Chỉ chạm UI backoffice. |
| p2-01-port-guide-bingo18-max3d-max3dpro | P2 | ⏳ pending | ⏳ pending | toàn bộ P0+P1 Keno chạy ổn ~1 tuần | KHÔNG phải plan thực thi — là HƯỚNG DẪN nghiên cứu → lập plan → review cho 3 game. |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.
Cột **Review & rủi ro** chỉ chuyển sang ✅ sau khi chạy đủ mục "Đánh giá & verify" + "Review code & rủi ro" của
plan đó (task riêng, không làm cùng lúc với code).

### Kết quả review 5 plan P0+P1 (02/08)

Chi tiết từng rủi ro nằm ở mục "Kết quả review" cuối mỗi plan file. Tổng hợp defect ĐÃ SỬA:

| # | Mức | Plan | Defect | Fix |
|---|---|---|---|---|
| 1 | 🔴 | p0-01 | `try/catch` per-draw trong `runTick` **nuốt luôn** error mất-lock từ `extendLock()` → worker ghi song song với owner mới (đúng cái lock sinh ra để chặn) | Thêm `LockTakenOverError` + re-throw trước khi đếm `failed` |
| 2 | 🟠 | p0-02 | `recordStuckAndMaybeAlert` throw sẽ vọt qua `break`, bỏ luôn `setCursor` → mất tiến độ các doc đã đánh giá | Bọc `try/catch` riêng cho ghi alert (việc PHỤ), chỉ `logError`. **HẬU KIỂM 03/08:** gốc là "đường tín hiệu có I/O". `system-worker-health/p0-02` xoá cả method + try/catch — API mới (`recordItemFailure`) không có I/O nên **không thể throw** |
| 3 | 🟠 | p0-01 | `recordFailAndMaybeAlert` lỗi kéo chết các kỳ chưa xử lý trong tick | Bọc `try/catch` riêng như trên. **HẬU KIỂM 03/08:** xoá cùng #2 |
| 4 | 🟠 | p1-01 | `lastError: error.message` trần → payload alert phình vô hạn (message Mongo kèm doc dump) | Dùng `truncateErrorMessage` (500 ký tự), nhất quán với `lastError` của lock doc. Nguyên tắc này **giữ lại** ở `WorkerStalledItem.lastError` |
| 5 | 🟡 | p1-01 | `enabled[worker_stuck]` tồn tại nhưng không worker nào đọc → dễ tưởng tắt được | ~~JSDoc member `WorkerStuck` + comment default config~~ → **CHỮA NGỌN.** Phải viết JSDoc 8 dòng bào chữa cho member không tuân luật của enum chứa nó = member đó không thuộc enum đó. **Giải gốc 03/08:** xoá hẳn `worker_stuck` khỏi `ops_alerts`, sức khoẻ worker về `worker-core` — `.cursor/plans/system-worker-health/` |
| 6 | 🟡 | p0-03/p1-01 | Comment stale: `stats-accumulator.ts` còn ghi factory dùng chung với "repo seed doc" (repo không seed từ p0-03) | Sửa thành "mapper normalize phía đọc" |
| 7 | 🔴 | p1-01 (Q5) | Field counter tên `boards` nhưng giá trị là `Σ(board.betCount)` — trùng tên `entrySummary.boards[]` (đại lượng KHÁC); FE gọi cùng thứ đó là `selections`, nhãn "lượt" → 3 tên 1 đại lượng, đọc sai đơn vị | Rename `sets` toàn tuyến 4 game + FE; giữ 4 field `boards` ĐÚNG nghĩa của Max3D/Max3DPro kèm JSDoc phân biệt |
| 8 | ➖ | p1-01 (Q5) | ~~Doc counter kỳ đang mở lúc deploy mang cả 2 path~~ — HUỶ 02/08 (lần 2 review): dự án chưa deploy, không có doc cũ mang `boards` để phòng. Tiền đề sai | Xoá lớp tương thích `readSetsCounter`/`WithLegacySets` (`game-core/utils/legacy-stats-fields.ts`) + script migration; mapper Keno + `seed()` 3 accumulator đọc thẳng `sets` |
| 9 | 🟠 | p2-01 (đón đầu) | `DrawBettingStatsBase.topAccounts` để ở BASE dù đã `@deprecated` → game MỚI `extends` base là **tự động thừa hưởng kiến trúc drift** (top-K trên metric tích luỹ), `@deprecated` không chặn được kế thừa | Dời field xuống 3 game chưa port tự khai (bingo18/max3d/max3dpro) kèm JSDoc cách đúng; base sạch; Keno bỏ được `Omit<..., "topAccounts">`. Thuần type — 0 đổi hành vi/dữ liệu |
| 10 | 🟠 | p2-01 (D2) | `resetFinal()` sót lại từ mô hình `$set` full snapshot: 0 caller, và **no-op** trong kiến trúc `$inc` (flip `final` nhưng `lastEntryId` vẫn cao nhất → 0 entry → `stampFinal` lại). Nguy hiểm ở bước "sửa" kế tiếp: reset luôn watermark ⇒ **cộng đôi cả kỳ**, sai âm thầm | Xoá method; JSDoc `stampFinal` ghi rõ "KHÔNG thêm lại + vì sao"; analysis §5.3.1 (điều kiện recompute đúng: zero counter + reset watermark CÙNG 1 update + xoá 3 collection phụ ⇒ phải là use-case riêng có audit); p2-01 §D2 + overview keno-ops sửa lại; port guide §7 thêm bảng "API phải XOÁ khi đổi mô hình ghi" |
| 11 | 🟠 | p1-01 (Q4) | **Alert `worker_stuck` đặt sai tầng**: sức khoẻ worker (trạng thái hạ tầng, tự hết khi hồi phục, không thuộc kỳ nào) nằm trong `ops_alerts` (sự kiện nghiệp vụ của 1 kỳ, `drawId` bắt buộc, cần staff ack). 4 hệ quả: (a) `OpsAlertStatus.Resolved` **không nơi nào set** ⇒ badge đỏ tới khi staff ack sự cố đã tự khỏi ⇒ mòn giá trị badge của alert thật; (b) badge đếm **global** vs panel lọc **per-draw** ⇒ đỏ mà panel trống (worker kẹt ở kỳ cũ nhất, staff xem kỳ đang chạy); (c) defect #5 ở trên; (d) streak reset mỗi invocation ⇒ không phân biệt lỗi thoáng qua với kẹt 6 tiếng. Thêm nữa: 2 bản cài LỆCH NHAU trong cùng 1 game, port sang 3 game → 6–8 bản | **Dời xuống `worker-core`**: `worker_locks.stalledItems` + `recordItemFailure`/`clearItemFailure` ở `SingleRunWorker`, flush ghép vào `finalizeAndRelease` (**0 DB call thêm**), streak persist qua invocation, tự rỗng khi hồi phục; trang BO `/system/workers` cho **cả 9 worker app** (trả nợ `lastError`/`lastSuccessAt`/kill-switch hiện chỉ xem được bằng mongo shell). Analysis: `.cursor/analysis/system-worker-health.analysis.md`; plans: `.cursor/plans/system-worker-health/`. Keno xoá ≈75 dòng, 3 game chưa port **không** phải khai alert type nào |

**Nợ vận hành (KHÔNG phải defect code) — bắt buộc làm TRƯỚC khi deploy:**

- Tạo index `{ updatedAt: 1 }` (`idx_updatedAt`) trên `keno_draw_betting_stats` **thủ công trên Atlas** rồi
  mới deploy function `ops-alerts`. Repo khai index trong `packages/game-keno/src/indexes/index.ts` nhưng
  KHÔNG có runner. Deploy trước khi tạo index ⇒ COLLSCAN mỗi tick (p0-02 rủi ro #1).
- Rename `boards` → `sets` (p1-01 §Q5): rename trực tiếp, KHÔNG cần lớp tương thích/migration — dự án
  chưa deploy nên không có dữ liệu Mongo thật mang tên cũ (xem defect #8: đã huỷ lớp tương thích ban đầu).
- `topAccounts` (defect #9) mới chỉ **dời chỗ khai**, chưa bỏ: bingo18/max3d/max3dpro vẫn ghi mảng top-K
  vào doc và vẫn drift như cũ. Xoá thật khi port từng game sang `*_draw_account_stats` theo
  `p2-01-port-guide-bingo18-max3d-max3dpro.md` §3.5 — lúc đó xoá dòng khai trong entity của game đó.
- **Alert `worker_stuck` (defect #11) đã ship và ĐANG CHỜ HOÀN NGUYÊN.** Cho tới khi
  `.cursor/plans/system-worker-health/p0-02` merge, code Keno vẫn bắn alert này ⇒ vẫn có badge đỏ không
  tự tắt. Nếu deploy trong khoảng giữa: dặn staff bỏ qua alert `type: "worker_stuck"`, và sau khi p0-02
  merge thì chạy `db.keno_ops_alerts.deleteMany({type: "worker_stuck"})` để dọn badge. **Không port
  `worker_stuck` sang game nào** trong lúc chờ.

**Verify chưa chạy được ở bước review code** (cần môi trường dev/staging + dữ liệu thật): p0-01 §4.5 smoke
test, p0-02 §6.3–6.5 (hành vi cursor, explain trên Atlas, so sánh 24h), p0-03 §5.3–5.5 (luồng dọc + UI +
enroll latency), p1-01 §4–5 (UI + test data bẩn; §6 grep `.boards` + UI 4 game sau rename Q5),
p1-02 §4.2–4.3 (ma trận 6 ô + đếm request). Đây là danh
sách phải chạy ở stage deploy, không phải mục bị bỏ qua.

## Thứ tự phụ thuộc

```
p0-01 (worker-core, gate cho mọi thứ dùng tick loop)
  ├──► p0-02 (alert worker mới extends TickLoopWorker)
  └──► p0-03 (enroll 1 lần/invocation cần hook beforeLoop của base)

p1-01 sau p0-02 (Q1 rà JSDoc cả 2 use case sau khi tách; Q4 → SUPERSEDED, xem thư mục system-worker-health)
p1-02 độc lập — có thể làm song song bất kỳ lúc nào (chỉ chạm FE backoffice)

p2-01 (guide) — chỉ bắt đầu port khi Keno chạy production ổn ~1 tuần
```

Khuyến nghị thứ tự merge: **p0-01 → p0-02 → p0-03 → p1-01 → p1-02** (p1-02 chen ngang được).
MỖI plan là 1 PR riêng — analysis §8 rủi ro #1: refactor phải diff-review được từng phần.

**Thư mục liên quan — `.cursor/plans/system-worker-health/`:** hoàn nguyên Q4 (defect #11) và trả nợ UI
`worker_locks` cho cả 9 worker app. Nên merge **trước khi port game nào** để 3 game chưa port không kế
thừa `worker_stuck`.

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

1. **KHÔNG mở lại K1–K8** (analysis §3): delta-only accumulator, watermark per-doc, hàng đợi `final:false`,
   loại void tại nguồn, `$set` tuyệt đối cho counter phái sinh, 1 thuật toán duy nhất, trần + extendLock trong
   vòng đọc, projection thin. Mọi "đơn giản hoá" phá 1 trong 8 điểm = quay lại bug p2-01 đã trả giá.
2. **KHÔNG thêm cơ chế kiểm/đối chiếu khi đóng sổ** (chốt §5.3): drained + terminal → `final`. Không count-check,
   không rebuild, không alert mismatch. Rủi ro tồn dư watermark đã CHẤP NHẬN CÓ CHỦ ĐÍCH — ghi trong analysis
   §5.3, không ai "phát hiện lại".
3. **Đường ghi không đổi hành vi** — p0-01/p0-02 chỉ DI CHUYỂN code; mọi diff trên `syncDraw`/`writeBatch`/
   accumulator ngoài phạm vi plan tương ứng là red flag khi review.
4. Tuân `mongodb.mdc` (docPath, repo-only query, §8 checklist), `code-quality-standards.mdc` (JSDoc, §5.3
   const-as-const, §6 curly, §7 import đầu file), plans README (không xoá plan, cập nhật bảng trạng thái).
5. **Verify tối thiểu mỗi plan:** `pnpm --filter <package> check-types` cho MỌI package chạm tới + grep dead
   code/import sót + mục "Review & rủi ro" của chính plan đó thực hiện đủ.

## Định nghĩa "Done" cho toàn bộ thư mục (Keno)

- `sync-betting-stats.ts` chỉ còn 1 câu chuyện: *lấy hàng đợi → hút delta → đóng dấu final* (~250 dòng,
  không còn `evaluateDrawAlerts`/`AlertContext`).
- Worker `keno:ops-alerts` chạy độc lập, alert xuất hiện ≤ ~20s sau cược (2 tick), lỗi evaluator không ảnh
  hưởng nhịp sync và ngược lại.
- `ensureDocs` chỉ seed `{final, updatedAt}`; mọi reader nhận entity full-shape qua mapper normalize; thêm
  field mới vào stats doc = sửa entity + 1 dòng default mapper, KHÔNG migration.
- Vòng lặp tick sống ở `worker-core` (1 bản), Keno có 2 subclass chỉ chứa `runTick`.
- `KenoPlayTypeStat` không còn field `entries`; không còn comment stale nhắc `recomputeFull`.
- KPI strip kỳ `Settled` hiển thị số chính thức từ `DrawDoc.financial` theo ma trận nguồn số (analysis §5.3);
  kỳ Void/live giữ nguồn ops.
- Index mới `{updatedAt:1}` trên `keno_draw_betting_stats` đã tạo trên Atlas TRƯỚC khi deploy worker alert.

## Sau khi hoàn thành

- Cập nhật bảng "Plans phái sinh" trong analysis nguồn (đổi status).
- Cập nhật `../00-overview.md` (feature keno-ops-risk-control) — thêm dòng trỏ tới thư mục này.
- Chạy ổn ~1 tuần → mở p2-01 guide để port bingo18 → max3d → max3dpro.
