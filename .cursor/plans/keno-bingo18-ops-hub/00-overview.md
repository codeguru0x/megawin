# Keno + Bingo18 — Multi-Draw Ops Hub & Auto-Pilot — Master Plan (00-overview)

> **Nguồn:**
> [`keno-bingo18-sequential-settle-guard.analysis.md`](../../analysis/keno-bingo18-sequential-settle-guard.analysis.md) ·
> [`keno-bingo18-multi-draw-ops-autopilot-plan.analysis.md`](../../analysis/keno-bingo18-multi-draw-ops-autopilot-plan.analysis.md) ·
> [`keno-bingo18-autopilot-eve-feasibility.analysis.md`](../../analysis/keno-bingo18-autopilot-eve-feasibility.analysis.md)
> **Scope chốt:** 06/09/2026 — bỏ guard settle/void tuần tự cho **Keno + Bingo18 CHỈ**, thêm bulk
> settle/void API, xây trang `operations-hub` giám sát N kỳ song song, rồi Auto-Pilot deterministic.
> **Feature slug:** `keno-bingo18-ops-hub` · tuân [`.cursor/plans/README.md`](../README.md)
> **Sửa 07/09/2026:** nhóm P2 sửa 2 lần theo khảo sát code thật.
> **Lần 1:** `p2-02` chuyển auto-open sang mô hình reconcile; `p2-03` bỏ 3 field publish không liên quan;
> `p2-04` phát hiện `draw.financial`/`draw.stats` là POST-settle nên đổi nguồn sang `keno_draw_betting_stats`.
> **Lần 2 (đổi hướng `p2-04`):** nhận ra kỳ đã `Published` là đã có 20 số trúng, và Keno 100% giải cố
> định ⇒ **tính CHÍNH XÁC được số tiền phải trả**, không cần chỉ số proxy. Thêm 2 plan
> [`p2-04a`](./p2-04a-settle-payout-extract.plan.md) + [`p2-04b`](./p2-04b-settle-preview-engine.plan.md);
> `p2-04`/`p2-01` §3.4/`p2-05` viết lại theo số tiền thật. Đổi lớn nhất: hiệu chuẩn ngưỡng từ **dry-run
> 2 tuần** thành **backfill 30 ngày lịch sử (~1 ngày)**, vì số tiền thật đối chiếu ngược quá khứ được.

Hôm nay 1 lỗi ở 1 kỳ làm chết cả ngày vận hành: guard `findUnfinishedDrawBefore` chặn settle kỳ T
nếu kỳ T-1 chưa hoàn thành. Sự cố thật đã ghi nhận — 1 kỳ Keno quarantine lúc 07:16 khiến **112 kỳ
liên tiếp** publish được nhưng không kỳ nào settle được. Với Keno ~119 kỳ/ngày và Bingo18 ~158
kỳ/ngày, mô hình "1 kỳ 1 lúc" không còn dùng được.

Feature này làm 3 việc, theo đúng thứ tự **không được đảo**:

1. **Sửa nền dữ liệu trước** — race TOCTOU ở `system_settle_game_daily`/`system_settle_tenant_daily`
   là rủi ro số liệu THẬT và là điều kiện chặn (P0). Bỏ guard trước khi vá race = tự tay tạo báo cáo
   sai ở đúng tốc độ cao nhất.
2. **Mở khả năng song song** — xoá guard + bulk API có concurrency cap.
3. **Cho người nhìn thấy** — trang `operations-hub` (P1), rồi mới giao cho máy tự bấm (P2).

---

## Bảng trạng thái

| Plan | Phase | Code | Review & rủi ro | Phụ thuộc | Ghi chú |
|---|---|---|---|---|---|
| [`p0-01-daily-rollup-race-fix`](./p0-01-daily-rollup-race-fix.plan.md) | P0 | ⏳ pending | ⏳ pending | — | **CHẶN toàn bộ**. Chạm shared 7 game |
| [`p0-02-remove-sequential-guard`](./p0-02-remove-sequential-guard.plan.md) | P0 | ⏳ pending | ⏳ pending | p0-01 | Chỉ Keno + Bingo18 |
| [`p0-03-hub-query-foundation`](./p0-03-hub-query-foundation.plan.md) | P0 | ⏳ pending | ⏳ pending | — | Repo batch + DTO + index. Song song p0-02 được |
| [`p0-04-bulk-settle-void-api`](./p0-04-bulk-settle-void-api.plan.md) | P0 | ⏳ pending | ⏳ pending | p0-02 | Concurrency cap 5, partial-success |
| [`p1-01-hub-page-shell-kpi`](./p1-01-hub-page-shell-kpi.plan.md) | P1 | ⏳ pending | ⏳ pending | p0-03 | Keno trước, 1 query duy nhất |
| [`p1-02-hub-queue-table-bulk`](./p1-02-hub-queue-table-bulk.plan.md) | P1 | ⏳ pending | ⏳ pending | p1-01, p0-04 | Multi-select — **không có tiền lệ trong repo** |
| [`p1-03-hub-detail-panel`](./p1-03-hub-detail-panel.plan.md) | P1 | ⏳ pending | ⏳ pending | p1-02 | Inline expand **0 query** + mở tab mới. **Không** Sheet |
| [`p1-04-bingo18-port`](./p1-04-bingo18-port.plan.md) | P1 | ⏳ pending | ⏳ pending | p1-03 chạy thật ≥1 tuần | Port sang Bingo18. **Không** find-replace |
| [`p2-01-autopilot-config`](./p2-01-autopilot-config.plan.md) | P2 | ⏳ pending | ⏳ pending | p1-04 chạy thật ≥2 tuần | Config-first cho **4 giai đoạn** (mở/đóng bán/nhận kết quả/kết sổ), deterministic, KHÔNG LLM |
| [`p2-02-autopilot-open-close-engine`](./p2-02-autopilot-open-close-engine.plan.md) | P2 | ⏳ pending | ⏳ pending | p2-01 | Giai đoạn 1+2 — mở kỳ theo mô hình **reconcile** (cron 5-10 phút, tự bù kỳ thiếu) + tự đóng bán. Tái dùng `CreateDrawUseCase`/`CloseSalesUseCase` |
| [`p2-03-autopilot-publish-engine`](./p2-03-autopilot-publish-engine.plan.md) | P2 | ⏳ pending | ⏳ pending | p2-01 | Giai đoạn 3 — tự nhận kết quả. **Phụ thuộc ngoài cứng: ResultFeed đạt G5** trước khi bật `enabled` |
| [`p2-04a-settle-payout-extract`](./p2-04a-settle-payout-extract.plan.md) | P2 | ⏳ pending | ⏳ pending | — | **Refactor thuần**, không đổi hành vi: tách logic tính payout inline trong `SettleEntriesBatchUseCase` thành hàm pure `computeEntryPayout`. Prerequisite của p2-04b |
| [`p2-04b-settle-preview-engine`](./p2-04b-settle-preview-engine.plan.md) | P2 | ⏳ pending | ⏳ pending | p2-04a | **Kết sổ thử**: tính CHÍNH XÁC số tiền phải trả từ kết quả đã publish, ghi collection riêng `keno_settle_previews`. **KHÔNG** chạm entries/draw/pipeline. Kèm vòng tự kiểm chứng đối chiếu `draw.financial` sau settle thật |
| [`p2-04-autopilot-settle-engine`](./p2-04-autopilot-settle-engine.plan.md) | P2 | ⏳ pending | ⏳ pending | p2-01, **p2-04a, p2-04b** | Giai đoạn 4 — kết sổ. Rule engine + cron, quyết định trên **SỐ TIỀN THẬT** từ `keno_settle_previews`. **Nguy hiểm nhất** — bắt buộc backfill 30 ngày (100% `delta === 0`) + dry-run ≥3 ngày |
| [`p2-05-autopilot-decision-log-ui`](./p2-05-autopilot-decision-log-ui.plan.md) | P2 | ⏳ pending | ⏳ pending | p2-04 | Log quyết định + panel Hub + Mira read-only (chi tiết cho giai đoạn kết sổ, pattern áp dụng chung §9) |

Tài liệu kèm (không phải plan thực thi):
[`ops-hub-page-layout.guideline.md`](./ops-hub-page-layout.guideline.md) — chuẩn UI/UX trang Hub.

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

---

## Thứ tự phụ thuộc

```
p0-01 (daily rollup race)  ──┬──► p0-02 (bỏ guard) ──► p0-04 (bulk API) ──┐
                             │                                            │
p0-03 (query foundation) ────┴────────────► p1-01 (shell+KPI) ──► p1-02 ──┴──► p1-03 ──► p1-04
                                                                                            │
                                              (chạy thật 1-2 tuần) ◄──────────────────────┘
                                                        │
                                                        ▼
                                          p2-01 ──┬──► p2-02 (mở/đóng bán)
                                                   ├──► p2-03 (nhận kết quả) ── phụ thuộc ngoài: ResultFeed G5
                                                   └──► p2-04 (kết sổ) ──► p2-05 (log + UI)
                                                          ▲
                    p2-04a (extract hàm pure) ──► p2-04b (kết sổ thử) ──┘
                    (không phụ thuộc p2-01 — làm SỚM được)
```

`p2-04a`/`p2-04b` **không phụ thuộc `p2-01`** — chúng chỉ tính số, không đọc config Auto-Pilot. Làm được
song song với P1, hoặc thậm chí trước. Càng làm sớm càng có nhiều dữ liệu preview tích luỹ để hiệu chuẩn
ngưỡng khi tới `p2-04`.

Ba điểm chặn cứng:

1. **p0-01 chặn p0-02.** Bỏ guard làm số luồng ghi đồng thời vào cùng `financialDate` tăng vọt. Race
   hiện tại "tự lành ở lần settle kế tiếp" — nhưng khi bulk-settle 10 kỳ một lúc, lần kế tiếp có thể
   là **cuối ngày**, và báo cáo sai suốt cả ngày. Không phải rủi ro lý thuyết.
2. **p0-04 chặn p1-02.** Bulk action bar không được là nút gọi N request lẻ — phải có API batch thật
   với cap trước, nếu không UI sẽ bắn 20 request settle đồng thời.
3. **p1-04 chặn p2-01 theo THỜI GIAN, không chỉ theo code.** Phải để người bấm bulk-settle thật
   1-2 tuần, tìm lỗi thật, rồi mới giao cho cron tự bấm. Đây là quyết định đã chốt ở
   `keno-bingo18-autopilot-eve-feasibility.analysis.md` §4.

---

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

1. **Chỉ Keno + Bingo18.** 5 game còn lại (Lotto535, Mega645, Power655, Max3D, Max3DPro) KHÔNG đụng
   guard. 3 game đầu có jackpot rollover thật (`JackpotCycleDoc.jp1Current` — giá trị kỳ sau phụ
   thuộc kỳ trước); Max3D/Max3DPro chưa có nhu cầu và chưa được phân tích. Ngoại lệ duy nhất: p0-01
   chạm `game-core-application` (shared 7 game) — nhưng **behavior-compatible**, không đổi signature,
   không đổi call site.
2. **Số DB call KHÔNG được tỷ lệ với N kỳ.** Đây là ràng buộc kiến trúc, không phải tối ưu "để sau".
   Hub phải chạy **4 query** cố định bất kể 5 kỳ hay 150 kỳ (thành **5** khi Auto-Pilot đã cấu hình —
   xem p2-05 §4.1, vẫn không phụ thuộc N). Mọi PR vi phạm = reject, không "làm đúng trước rồi tối ưu
   sau" — vì trần 500 doc im lặng của `findMany` sẽ che mất lỗi cho tới lúc quá muộn.
3. **1 endpoint, 1 timer.** Theo `operations-page-ui.mdc`: FE dùng **1 query duy nhất** + `select`
   slice cho từng section, `refetchInterval` đọc từ `pollSeconds` server trả về, ETag/304 cho poll
   rẻ. CẤM mỗi card tự `useQuery` riêng.
4. **Bulk = partial success, KHÔNG all-or-nothing.** 1 kỳ lỗi không được làm 9 kỳ còn lại thất bại.
   Không có transaction, không rollback — mỗi draw độc lập, trả mảng kết quả per-draw.
5. **KHÔNG thêm lớp guard mới trong use-case đơn.** `TriggerSettleUseCase` giữ nguyên 3 lớp chống
   double-trigger đã có (CAS `findOneAndUpdate({drawId, status: Published})`, `DistributedMutex` cho
   resettle, SFN execution name deterministic). Bulk chỉ **gọi lại** use-case đơn — không copy logic,
   không bỏ qua guard nào.
6. **Không đụng Step Function ASL.** Phát hiện quan trọng: `serverless.yml` **không có block
   `stepFunctions:`**, ASL sinh bằng `generate-asl.sh` với `ACCOUNT_ID = "YOUR_ACCOUNT_ID"` hardcode
   → state machine hiện deploy **thủ công qua AWS Console**. Mọi thiết kế phải tránh sửa ASL. Đây là
   lý do chính p0-01 chọn giải pháp trong use-case thay vì tách state mới.
7. **Code tài chính: đọc code + test, không dùng graph làm bằng chứng.** Theo
   `gitnexus-code-graph.mdc` §4. Mọi thay đổi ở `settle`/`payout`/`financial` phải có test thật.
8. **Tiếng Việt cho prose, tiếng Anh cho thuật ngữ.** JSDoc bắt buộc theo `code-quality-standards.mdc`
   §1-3: `/** */` cho declaration, `//` cho logic trong body.

---

## Câu hỏi phải trả lời BẰNG CODE (không quyết trước)

Các điểm cố ý để mở — quyết định sai lúc lập plan còn tệ hơn quyết muộn. Mỗi câu phải chốt **trong PR
tương ứng** và ghi kết quả vào đây:

| # | Câu hỏi | Chốt ở | Kết quả |
|---|---|---|---|
| 1 | `stats.exposure.worstCaseTotal` là RAW hay đã cap theo `payoutCaps`? | p0-03 §6 điểm 4 | ✅ **RAW.** Doc lưu giá trị chưa cap; `evaluate-alerts.ts:92` và `get-ops-snapshot.ts:83` đều gọi `capExposureByPlayType(raw, payoutCaps)` trước khi dùng. Mọi consumer mới PHẢI làm như vậy. **Lưu ý:** Auto-Pilot kết sổ **không còn** là consumer của exposure — nó dùng số tiền thật từ `keno_settle_previews` (`p2-01` §3.4.2). Câu hỏi này vẫn áp cho Hub UI + alert engine. Hub DTO trả `exposureRaw` và UI ghi rõ `(chưa cap)` |
| 2 | `idx_hub_row_covering` có thật cho `totalDocsExamined = 0`? | p0-03 §4 (amend p1-01 §11) | ⏳ Phải dán `explain("executionStats")` vào PR |
| 3 | Có cần index `{ drawId, status }` cho `countByDrawIds`? | p0-03 §4 | ⏳ Đo `explain()` trước, đừng thêm index đoán |
| 4 | Bảng 5B bung full (~110 Keno / ~150 Bingo18 dòng) có cần virtualization? | p1-02 §6.3 | ⏳ Đo Profiler trước |
| 5 | Cache module-level TTL 2s: hit-rate thật bao nhiêu? | p1-01 §11 | ⏳ Phụ thuộc số staff trực đồng thời |
| 6 | `BULK_MAX_DRAWS = 50` / `BULK_CONCURRENCY = 5` có đúng? | p0-04 §2.2 | ⏳ Đo p95 khi settle lô thật |
| 7 | Boundary scheduling có mượt sau 8 tiếng mở liên tục? | p1-01 §5.3 | ⏳ Chỉ lộ khi trực cả ca |

**Câu hỏi "DrawCommandCenter dùng props hay useDrawContext, có phải tách shared?" đã bị XOÁ** — p1-03
viết lại bỏ Detail Sheet, không nhúng `DrawCommandCenter` vào hub nữa, nên câu hỏi không còn tồn tại.
Đây là lợi ích trực tiếp của quyết định mở tab mới (p1-03 §0).

**p1-04 (port Bingo18) không được bắt đầu trước khi cả 7 câu có kết quả** — nếu không sẽ phải sửa 2
lần (p1-04 §1). Câu 1 đã chốt bằng đọc code (07/09/2026), không cần chờ chạy thật.

Ngoài ra, **mọi plan đều có mục "Phải verify"** cho các giả định về tên field/constant/route. Đó không
phải formality: plan được viết bằng cách đọc code, nhưng những chỗ ghi "phải verify" là chỗ chưa đọc
tận cùng. Đọc trước khi code, đừng tin plan.

---

## Thời gian chờ bắt buộc giữa các phase

Không phải mọi phụ thuộc là phụ thuộc code. Ba mốc chờ **theo thời gian thực**:

| Từ | Sang | Chờ | Vì sao |
|---|---|---|---|
| p1-03 | p1-04 | Keno Hub production **≥ 1 tuần** | 7 câu hỏi mở (§trên) chỉ có đáp án khi chạy thật |
| p1-04 | p2-01 | Hub 2 game production **≥ 2 tuần** | Người phải dùng bulk-settle thật, tìm lỗi thật, trước khi máy tự bấm |
| p2-04 deploy | p2-04 bật `settle.enabled` | **Backfill 30 ngày** + dry-run **≥ 3 ngày** | 3 tiêu chí pass: (a) **100% kỳ backfill có `verification.delta === 0`** — 1 kỳ lệch = engine sai, không được merge; (b) `payoutRatio` p50 gần RTP lý thuyết từ `rules/odds.ts`; (c) mọi kỳ người đã can thiệp nằm ngoài ngưỡng. Xem `p2-01` §3.4.5 + `p2-04` §4 |
| p2-04a | p2-04b | — | `computeEntryPayout` phải tồn tại trước khi có thứ gọi nó. Không viết lại logic tính payout lần 2 |
| p2-04b | p2-04 | Preview chạy production **≥ 3 ngày** | Cần dữ liệu preview thật để `p2-04` có gì mà đọc. Đo p95 thời gian preview hoàn tất → chốt sàn `settleDelayMinutes` |
| p2-04 deploy | p2-04 merge | Keno có **`evaluate-alerts.test.ts`** | Port từ `power655`. Keno là game duy nhất thiếu test cho alert evaluator, mà Hub dùng `alertsCritical` để hiện badge — badge sai dẫn tới quyết định sai của người. Xem `p2-01` §3.5.4 |
| p2-03 deploy | p2-03 bật `publish.enabled` | ResultFeed đạt **G5** + dry-run **≥ 1 tuần** | Auto-publish sai kết quả làm mọi settle sau đó sai theo — không được nới lỏng vì áp lực tiến độ |

Mốc 3 là mốc quan trọng nhất và cũng dễ bị bỏ nhất — nó không cần code gì, chỉ cần **không bật**.

---

1. Staff mở `/games/keno/operations-hub`, thấy toàn bộ kỳ chưa hoàn thành trên 1 màn hình, phát hiện
   được kỳ có alert critical / exposure cao **trong dưới 5 giây** nhìn.
2. Chọn nhiều kỳ → bấm 1 lần → kết sổ hàng loạt, không bị chặn bởi thứ tự kỳ.
3. Kỳ lỗi hiện rõ lý do ngay tại dòng đó, 9 kỳ còn lại vẫn settle xong.
4. Sau bulk-settle 10 kỳ đồng thời: `system_settle_game_daily` khớp **chính xác** tổng
   `keno_settle_draw_reports` cùng `financialDate` (verify bằng mongosh, không tin dashboard).
5. `system_settle_tenant_daily` không còn doc tenant stale (tenant đã void hết vé phải biến mất).
6. Auto-Pilot ON: kỳ đủ điều kiện tự settle, kỳ không đủ hiện badge "Cần review — {lý do}", mọi
   quyết định có log tra được.
7. 5 game jackpot không có bất kỳ thay đổi hành vi nào (`git diff` không chạm use-case của chúng
   ngoài p0-01, và p0-01 có test chứng minh behavior không đổi).

---

## Sau khi hoàn thành

- [ ] Cập nhật 3 analysis doc nguồn: đổi `Status: discussing` → `implemented`, thêm mục "Plans phái
      sinh" trỏ về thư mục này.
- [ ] Thêm rule mới `.cursor/rules/operations-hub-ui.mdc` nếu pattern Queue Table + bulk action bar
      được tái dùng sang game khác (hiện `operations-page-ui.mdc` không phủ pattern này).
- [ ] Cập nhật `docs/` runbook vận hành: quy trình xử lý kỳ backlog, ngưỡng Auto-Pilot đang dùng.
