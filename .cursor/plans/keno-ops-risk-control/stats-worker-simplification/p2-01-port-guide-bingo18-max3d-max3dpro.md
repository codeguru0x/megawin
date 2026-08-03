# p2-01 — Hướng dẫn port sang bingo18 / max3d / max3dpro (nghiên cứu → plan → review → kết thúc)

> **Loại file:** GUIDE — KHÔNG phải plan thực thi. Mỗi game sẽ có plan riêng do người port viết
> THEO quy trình trong file này. · **Phase:** P2 · **Điều kiện mở:** toàn bộ P0+P1 Keno đã merge và
> chạy production ổn ~1 tuần (số liệu khớp, không lỗi lặp CloudWatch, `worker_locks.stalledItems` rỗng
> ổn định — xem §6.2). Ngoài ra: `.cursor/plans/system-worker-health/p0-01`+`p0-02` **phải merge trước**
> để không port `worker_stuck` (đã bị bỏ) sang game nào.
> **Thứ tự port đề xuất:** bingo18 → max3d → max3dpro (max3dpro copy gần nguyên max3d — làm cuối để
> hưởng 2 lần bài học).

## 0. Tư duy nền: port là "áp PATTERN", không phải "copy DIFF"

Keno là bản chuẩn nhưng KHÔNG phải bản để copy nguyên văn — 3 game khác Keno ở đúng những chỗ dễ gây
bug nhất. Người port phải trả lời hết checklist nghiên cứu (§1) TRƯỚC khi viết plan. Copy diff Keno
mù = mang giả định Keno (combo collections, capSets, side-bet skew) sang game không có chúng.

**Khác biệt cấu trúc đã biết trước (điểm xuất phát cho nghiên cứu, KHÔNG phải kết luận):**

| | Keno | bingo18 | max3d | max3dpro |
|---|---|---|---|---|
| Collection stats | 4 (betting + combo + combo_accounts + account_stats) | 1 (betting-stats) — xác nhận lại | 1 — xác nhận lại | 1 — xác nhận lại |
| Chu kỳ | 6–8 phút | ~3–5 phút (NHANH hơn — xem §1.3) | ngày/kỳ dài | ngày/kỳ dài |
| Cơ cấu stats | byPlayType 15 slot + numberFreq 80 + capSets | dice/sum/side (histogram) | number buckets/triplet | như max3d + playtype khác |
| Alert đặc thù | combo_concentration, sidebet_skew, cap_sets_near | sum_skew...? (đọc entity) | number_concentration...? | như max3d |
| Jackpot trong financial | không | không | không | không (xác nhận `calculate-financials` từng game) |

## 1. GIAI ĐOẠN NGHIÊN CỨU (bắt buộc, ~½ ngày/game) — đọc gì, trả lời gì

Đầu ra giai đoạn này: 1 file `.cursor/analysis/{game}-stats-worker-port.analysis.md` NGẮN (1–2 trang,
không cần dài như bản Keno) trả lời đủ các câu dưới, status `discussing`, user duyệt rồi mới viết plan.

### 1.1. Đường ghi — đọc 3 file, so với Keno

Đọc: `packages/game-{game}-application/src/use-cases/operations/sync-betting-stats.ts` +
`stats-accumulator.ts` + `infras/repos/betting-stats-repo.ts`.

- [ ] Vòng tick có ĐÚNG shape Keno cũ (budget 55s, `tickMs - elapsed`) không? Lệch chỗ nào → lệch đó
  là CÓ CHỦ ĐÍCH hay drift do copy tay? (git log/blame nếu nghi ngờ). Chỉ port `TickLoopWorker`
  khi xác nhận hành vi tương đương; nếu game có hành vi riêng có lý do → ghi vào analysis, giữ lại.
- [ ] `writeBatch` ghi MẤY collection? Nếu chỉ 1 → phần watermark đơn giản hơn Keno (không có mối lo
  "crash giữa 2 collection") — ĐỪNG bê nguyên máy móc 4-collection của Keno sang.
- [ ] `ensureDocs` seed skeleton gì? Reader nào truy cập thẳng path lồng (grep pattern
  `\.byPlayType\.|\.dice\.|\.sum\.` trong adapters/evaluate-alerts của game)?
- [ ] Accumulator có field kiểu `entries` per-slot không ai đọc (Q3 Keno) không? Lập danh sách field →
  đối chiếu consumer (adapters FE + evaluate-alerts) từng field.
- [ ] **Kiểm kê MỌI method public của `betting-stats-repo.ts` game này → mỗi method trả lời: "còn nghĩa
  gì sau khi đổi sang `$inc` delta?"** Bảng 4 API phải xoá (`upsertFull`, `recomputeFull`, `resetFinal`,
  `accumulator.seed`) ở analysis §7 là ĐIỂM XUẤT PHÁT, không phải danh sách đủ — game có thể có method
  khác cũng chỉ đúng trong mô hình `$set`. Method **không caller** là dấu hiệu; method **còn caller
  nhưng đã đổi nghĩa** mới là cái nguy hiểm. Ghi kết luận từng method vào analysis của game.

### 1.2. Đường alert — đọc `evaluate-alerts.ts` + `entities/ops-alert.ts` của game

- [ ] Alert type nào cần data NGOÀI stats doc? (Keno: combo_concentration cần `findConcentrated` —
  game không có combo collection thì worker alert chỉ đọc stats doc, GỌN HƠN Keno: bỏ hẳn nhánh
  comboRepo trong port, đừng để tham số thừa).
- [ ] `updatedAt` trên stats doc của game có được bump đủ chỗ (applyDelta + stampFinal) không —
  điều kiện sống còn của cursor `findChangedSince`.
- [ ] Config `ops.alerts` game này có key `enabled` dạng `Record<AlertType, boolean>` chưa? Chỉ thêm key
  cho alert **nghiệp vụ**. **TUYỆT ĐỐI KHÔNG thêm `worker_stuck`** — Keno đã ship rồi hoàn nguyên
  (`.cursor/plans/system-worker-health/`). Sức khoẻ worker dùng `recordStalledItem`/`clearStalledItem`
  của `SingleRunWorker`; xem §6.2.

### 1.3. Nhịp & tải — số liệu thật, không đoán

- [ ] Chu kỳ draw thực tế (đọc config/`draw-counter`)? bingo18 quay NHANH hơn Keno → độ trễ alert
  ~2 tick có còn "thừa an toàn" không? Nếu chu kỳ < ~2 phút → cân nhắc tick riêng cho alert worker
  (config `ops.stats.tickSeconds` per-game đã cho phép) — ghi quyết định vào analysis.
- [ ] Số draw `final:false` đồng thời + kích thước stats doc trung bình (Compass/`collection-storage-size`)
  → `MAX_DOCS_PER_TICK` cho worker alert của game (Keno chọn 50 — game doc to hơn thì giảm).

### 1.4. Đường đọc & UI — cho phần p0-03 + p1-02

- [ ] Mapper của game đang spread-as hay tường minh? Liệt kê ĐỦ field entity từ `entities/betting-stats.ts`
  của game (KHÔNG lấy danh sách Keno).
- [ ] Trang Operations game có cặp "KPI ops vs FinancialSummary settle" không? Lập MA TRẬN NGUỒN SỐ
  RIÊNG từ `calculate-financials.ts` của game (p1-02 §7: cấm copy ma trận Keno — field settle mỗi game
  khác nhau; kiểm cả jackpot nếu có).
- [ ] `useOpsSnapshot`/`useDrawDetail` của game có cùng shape wiring Keno không (bingo18/max3d có
  `use-draw-context.tsx` riêng — đối chiếu).

### 1.5. Câu hỏi chốt trước khi viết plan

- [ ] Có gì trong game này khiến 1 trong 8 nguyên tắc K1–K8 hoặc quyết định §5.3 (đóng sổ tối giản)
  KHÔNG áp dụng được? (Mặc định: áp dụng được — nếu thấy không, dừng lại hỏi user, đừng tự chế.)
- [ ] Index hiện có của game (`packages/game-{game}/src/indexes/`) — `{updatedAt:1}` đặt tên gì cho
  nhất quán, có index thừa/thiếu nào lộ ra khi đọc không (ghi nhận, KHÔNG sửa trong port này).

## 2. GIAI ĐOẠN LẬP PLAN — cấu trúc bắt buộc

Tạo `.cursor/plans/{game}-ops-risk-control/stats-worker-simplification/` (mirror thư mục Keno này),
gồm `00-overview.md` + các plan. Số plan CÓ THỂ ít hơn Keno:

| Plan Keno | Port thành | Ghi chú |
|---|---|---|
| p0-01 worker-core tick loop | **KHÔNG port riêng** — base đã có sẵn. Gộp "refactor sync worker extends TickLoopWorker" vào plan p0-02 của game | Diff nhỏ: extends + beforeLoop + counters |
| p0-02 split ops-alerts | p0-01 của game | Bỏ nhánh combo nếu game không có (§1.2). Index + yml + handler theo mẫu Keno |
| p0-03 minimal docs + mapper | p0-02 của game | Danh sách field normalize lấy từ entity GAME (§1.4) |
| p1-01 code quality | p1-01 của game | Q1–Q4; Q3 chỉ nếu game có field chết tương tự (kết quả §1.1) |
| p1-02 KPI official | p1-02 của game | Ma trận nguồn số RIÊNG (§1.4) |

Mỗi plan của game PHẢI có đủ các mục như plan Keno tương ứng: Mục tiêu / Pattern tham chiếu (trỏ file
Keno ĐÃ MERGE làm mẫu) / Danh sách file / Đánh giá & verify / Review & rủi ro / Rollback. Bảng rủi ro
được phép kế thừa bảng Keno + thêm dòng đặc thù game, KHÔNG được ít dòng hơn bản Keno mà không giải thích.

**Nguyên tắc viết plan port:** mỗi chỗ plan Keno ghi "Keno" phải được người port TRA LẠI cho game mình
(tên collection, tên type, số slot, ngưỡng) — plan port nào còn nguyên chữ "keno"/"pick8"/"KENO_" trong
code mẫu là chưa đạt.

## 3. GIAI ĐOẠN THỰC THI + REVIEW

1. Mỗi plan = 1 PR, thứ tự như Keno (p0 alerts → p0 minimal docs → p1). KHÔNG gộp 3 game 1 PR.
2. Reviewer bắt buộc mở file Keno tương ứng cạnh diff game — lệch so với pattern Keno phải có ghi chú
   "vì sao" trong PR description (căn cứ từ analysis §1 của game).
3. Checklist review chung mọi PR port:
   - [ ] Index tạo trên Atlas TRƯỚC deploy (per-game collection).
   - [ ] `beforeLoop` reset đủ mutable field (rủi ro container reuse — bảng p0-01 Keno #1).
   - [ ] Grep dead code sau dọn alert khỏi sync worker (bảng p0-02 Keno §6.2, đổi path sang game).
   - [ ] Unit test normalize mapper với 3 case doc rỗng/partial/full-cũ (p0-03 Keno §5.2, shape game).
   - [ ] Click-through trang Operations game trên dev cả kỳ live + settled + void.
   - [ ] `check-types` các package: `game-{game}`, `game-{game}-application`, `worker-{game}`, `backoffice`.
   - [ ] **Không còn API của mô hình cũ:** `rg -n 'upsertFull|recomputeFull|resetFinal|\.seed\(' packages/game-{game}*`
     → 0 match. Còn match nào phải giải thích trong PR vì sao nó vẫn đúng với `$inc` (mặc định: không đúng).
     Method public không caller cũng phải xoá — xem bài học `resetFinal` (analysis §5.3.1).
   - [ ] **Sức khoẻ worker dùng base class:** `rg -n 'worker_stuck|WorkerStuck' packages/game-{game}* apps`
     → 0 match; và có đúng 1 cặp `recordStalledItem`/`clearStalledItem` per worker, không try/catch bọc,
     guard `LockTakenOverError` đứng trước (§7).
4. Sau deploy mỗi game: theo dõi 24h như Keno (p0-02 §6.5) rồi mới port game kế tiếp.

## 4. GIAI ĐOẠN KẾT THÚC

- [ ] Cập nhật `00-overview.md` của game (status ✅) + bảng trạng thái trong overview thư mục Keno này
  (dòng p2-01: ghi chú game nào đã port xong).
- [ ] Sau khi CẢ 3 game xong: rà `worker-core` — nếu trong quá trình port phát hiện base cần sửa
  (hiếm, vì Keno đã "trả phí" trước), sửa base là 1 PR riêng CÓ chạy lại check-types 4 game.
- [ ] Cập nhật analysis nguồn (`keno-stats-worker-simplification.analysis.md`): status → `done`,
  bảng plans phái sinh đánh dấu đủ.
- [ ] Nếu port lộ ra bài học mới (giả định Keno sai ở game nào đó) → thêm mục "Bài học port" vào
  file guide NÀY để game sau không dẫm lại.

## 5. Những cái BẪY đã biết (đọc trước khi bắt đầu từng game)

1. **bingo18 quay nhanh** — mọi con số "thừa an toàn cho 6–8 phút" của Keno phải tính lại (§1.3).
2. **Không có combo collection** ≠ "bỏ qua phần combo trong plan" — phải chủ động XOÁ nhánh comboRepo
  khỏi code port, không để tham số/import chết.
3. **Ma trận KPI official per-game** — settle mỗi game ghi field khác nhau; max3d/max3dpro kiểm
  jackpot/quỹ trong `calculate-financials.ts` trước khi khẳng định cột nào có nguồn chính thức.
4. **max3dpro ≈ max3d nhưng KHÔNG bằng** — diff 2 file `sync-betting-stats.ts` của 2 game trước khi
  copy plan max3d sang max3dpro; khác biệt (playtype, prize structure) thường nằm ở accumulator.
5. **Đừng "tiện tay" sửa nghiệp vụ game khi port** — port chỉ TÁI CẤU TRÚC; thấy bug nghiệp vụ →
  ghi issue riêng, không trộn vào PR port (nguyên tắc #3 của 00-overview).
6. **API sót lại từ mô hình `$set` — bẫy đắt nhất của lần refactor Keno.** `resetFinal()` sống sót
  qua chuyển đổi `$set` → `$inc` vì compiler không bắt method public không ai gọi, và JSDoc của nó
  vẫn mô tả hành vi mô hình CŨ nên **đọc lên vẫn thấy hợp lý**. Thực tế nó là no-op, và cách "sửa"
  hiển nhiên nhất (reset luôn watermark) gây **cộng đôi cả kỳ**. 3 game hiện có `upsertFull` +
  `recomputeFull` + `accumulator.seed()` — cả 3 PHẢI xoá khi port, không được giữ "cho chắc".
  Kiểm kê theo §1.1 checklist cuối; grep xác nhận theo §3.3. Chi tiết: analysis §5.3.1 + §7.

## 6. Việc đã CHỜ SẴN cho từng game — bỏ `topAccounts` khỏi stats doc

Ngày 02/08/2026 `topAccounts` đã được **dời khỏi `DrawBettingStatsBase`** (game-core) xuống 3 game
chưa port tự khai trong entity của mình, kèm `@deprecated` chỉ đúng cách làm. Lý do dời: để ở base thì
game MỚI `extends` vào là tự động thừa hưởng kiến trúc drift — `@deprecated` cảnh báo được người đọc
nhưng KHÔNG chặn được kế thừa.

Đó thuần là dời chỗ khai (0 đổi hành vi). Việc THẬT nằm ở port này, mỗi game:

- [ ] Tạo entity + collection `{game}_draw_account_stats` (`{drawId, accountId}` unique, `$inc
  amount/entries/sets`, index `{drawId:1, amount:-1}`, TTL 90d) — mẫu: `packages/game-keno/src/entities/account-stats.ts`
  (JSDoc file đó giải thích sẵn vì sao cần collection riêng thay vì mảng top-K).
- [ ] Accumulator: bỏ map `accounts` build top-K + bỏ `seed()` đọc `b.topAccounts`; thay bằng drain
  delta per-account → `bulkUpsertDelta` (mẫu: `keno-application/.../stats-accumulator.ts` `drainAccountDeltas`).
- [ ] `get-ops-snapshot` của game: derive `topAccounts` bằng `sort({amount:-1}).limit(topAccountsK)`.
  DTO/FE **không đổi** — vẫn nhận `TopAccountStat[]` ở cấp snapshot (Keno đã vậy).
- [ ] Xoá dòng khai `topAccounts` trong `entities/betting-stats.ts` của game → compiler chỉ ra hết chỗ
  còn ghi vào doc. Không cần backfill: doc kỳ cũ tự hết hạn, kỳ mới dùng collection mới.
- [ ] `topAccountsK` trong `ops.stats` **giữ nguyên** (vẫn là số phần tử cắt lúc đọc) — đừng xoá theo.

## 7. Sức khoẻ worker — dùng base class, KHÔNG khai alert type mới

Keno từng có alert `worker_stuck` (p1-01 Q4) và **đã hoàn nguyên** 03/08/2026. Người port đọc mục này
để không hồi sinh nó.

**Luật phân tuyến** (nguồn: `.cursor/analysis/system-worker-health.analysis.md` §5.1):

| | `{game}_ops_alerts` | `worker_locks` (`worker-core`) |
|---|---|---|
| Bản chất | **Sự kiện nghiệp vụ** đã xảy ra trong 1 kỳ | **Trạng thái sức khoẻ** hạ tầng |
| Tự hết? | KHÔNG — staff phải ack | CÓ — item thành công là hết |
| Cấu hình tắt | Có (`ops.alerts.enabled`) | KHÔNG |

Tín hiệu *tự hết khi hệ thống hồi phục* và *không thuộc 1 kỳ quay* → thuộc `worker_locks`.

**Vì sao Keno phải hoàn nguyên** (4 defect, chi tiết analysis §3): `OpsAlertStatus.Resolved` không có nơi
nào set ⇒ badge đỏ cho sự cố **đã tự khỏi**, làm mòn giá trị badge của alert nghiệp vụ thật · badge đếm
**global** nhưng panel lọc **per-draw** ⇒ đỏ mà panel trống · key thừa trong
`Record<{Game}OpsAlertType, boolean>` không consumer nào đọc · streak reset mỗi invocation ⇒ không phân
biệt lỗi thoáng qua với kẹt 6 tiếng.

**Việc phải làm khi port — đúng 2 dòng:**

```typescript
// nhánh item thành công
this.clearStalledItem(drawId);

// nhánh catch (SAU guard LockTakenOverError)
this.recordStalledItem(drawId, error);
```

- [ ] KHÔNG bọc `try/catch` quanh 2 lời gọi trên — không có I/O nên **không thể throw**. Bọc thêm là
  tái tạo đúng 2 defect Keno đã sửa (nuốt lỗi mất-lock, nhảy qua `setCursor`).
- [ ] Guard `if (error instanceof LockTakenOverError) { throw error; }` phải đứng **TRƯỚC**
  `recordStalledItem` — takeover không phải "kỳ lỗi".
- [ ] **KHÔNG** thêm member vào `{Game}OpsAlertType`, **KHÔNG** thêm key vào `enabled` default + zod
  schema backoffice, **KHÔNG** thêm label `ops-constants.ts`, **KHÔNG** thêm nhánh render
  `alerts-panel.tsx`. Đây là phần tiết kiệm lớn nhất so với bản Keno đã ship (3 game × 4 điểm chạm).
- [ ] Grep nghiệm thu: `rg 'worker_stuck|WorkerStuck' packages/game-{game}* apps` → 0 kết quả.
- [ ] Nghiệm thu vận hành: ép 1 kỳ lỗi → `db.worker_locks.findOne({lockKey:"{game}:stats-sync"}).stalledItems`
  có entry với `failCount` tăng **qua từng invocation**; sửa data → mảng tự rỗng, **không ai ack gì**.
  Xem cùng tín hiệu trên trang BO `/system/workers`.
- [ ] Khai `protected readonly description` cho MỖI worker mới (base class, p0-01 §2.6a) — nếu không,
  trang BO hiện `lockKey` kỹ thuật. Quy ước (p0-02 §2.6): mở đầu bằng **tên game**, nói **worker làm gì
  cho nghiệp vụ** (ops phải trả lời được "tắt cái này thì mất gì?"), nêu **cadence** nếu là tick-loop,
  1 dòng ≤ ~100 ký tự. Mẫu Keno:

```typescript
  protected readonly description =
    "Bingo 18 — đồng bộ thống kê cược theo delta (tick ~20s, mọi kỳ đang mở)";
```

- [ ] KHÔNG tự thêm member vào `WorkerLockKind`: worker game luôn là `Worker`, base class tự ghi
  (analysis §2.4). Nếu thấy mình cần loại thứ 3, dừng lại và bàn — nhiều khả năng đó không phải worker.

Tiên quyết: `.cursor/plans/system-worker-health/p0-01` (base method) + `p0-02` (Keno đã gỡ) merge trước.
