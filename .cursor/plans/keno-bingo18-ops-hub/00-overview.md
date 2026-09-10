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
| [`p0-01-daily-rollup-race-fix`](./p0-01-daily-rollup-race-fix.plan.md) | P0 | ✅ done (07/09) | ✅ reviewed (07/09) | — | **CHẶN toàn bộ**. Chạm shared 7 game. Code+check-types+lint xanh; test §6 (race condition thật) chưa chạy |
| [`p0-02-remove-sequential-guard`](./p0-02-remove-sequential-guard.plan.md) | P0 | ✅ done (07/09) | ✅ reviewed (07/09) | p0-01 | Chỉ Keno + Bingo18. Đúng 4 block xoá (2 use-case × 2 game), `findUnfinishedDrawBefore` giữ lại (JSDoc ghi rõ không còn caller, dùng cho p1-01 KPI). Code+check-types xanh; test §6 chưa chạy |
| [`p0-03-hub-query-foundation`](./p0-03-hub-query-foundation.plan.md) | P0 | ✅ done (07/09) | ✅ reviewed + tested UI (07/09) | — | Repo batch (`listUnfinishedDrawRows`/`getRowsByDrawIds`/`countByDrawIds`) + DTO raw (`hub.types.ts`, `hub-snapshot.dto.ts`) + `GetOpsHubSnapshotUseCase` (đúng 4 query cố định) + route `hub-snapshot` với ETag composite. **1 bug tìm thấy khi test UI thật, đã fix**: `TypeError` khi draw chưa có bets (xem `betting-stats-repo.ts`). Index thật (điểm 2-3 bảng câu hỏi mở) chưa đo |
| [`p0-04-bulk-settle-void-api`](./p0-04-bulk-settle-void-api.plan.md) | P0 | ✅ done (07/09) | ✅ reviewed (07/09) | p0-02 | 4 use-case mỏng (`BulkTriggerSettleUseCase`/`BulkVoidDrawUseCase`/`BulkCloseSalesUseCase`/`BulkOpenSalesUseCase`) gọi lại use-case đơn qua `runBulkDrawAction` (dedupe + chunk cap 5 + partial success). `isVoidable` export từ `void-draw.ts` cho FE. `bulk-open-sales` đọc `closeAt` 1 query (`getCloseAtByDrawIds`), tự lọc kỳ quá hạn (`DRAW_SALES_WINDOW_CLOSED`) không gọi use-case đơn, giữ đúng thứ tự qua `Map`. Audit cấp lô mới (`draw.bulk_*` trong `@megawin/audit`, dùng chung 7 game). 4 route mới cùng quyền route đơn. Code+check-types+lint xanh; test §5 (bulk thật) chưa chạy |
| [`p1-01-hub-page-shell-kpi`](./p1-01-hub-page-shell-kpi.plan.md) | P1 | ✅ done (07/09) | ⚠️ **1 bug** (07/09) | p0-03 | Trang `/games/keno/operations-hub` mới. Client derive 1 pass (`derive-hub-summary.ts`) từ raw snapshot — `SaleGate`/`OpsStage`/`StageHealth` tính lại mỗi boundary tick. Đúng 1 `useQuery`. Zone 1-4 render đúng. **Bug tìm thấy khi test UI thật:** PageHeader hardcode `from-indigo-500` thay vì `GAME_COLORS[GameProduct.Keno].iconGradient` — xem [`ui-review-2026-09-07.md`](./ui-review-2026-09-07.md) mục 3. Zone 5A/5B chưa có — sang p1-02 |
| [`p1-02-hub-queue-table-bulk`](./p1-02-hub-queue-table-bulk.plan.md) | P1 | ✅ done (07/09) | ⚠️ **2 bug/deviation** (07/09) | p1-01, p0-04 | Zone 5A/5B, Bulk Action Bar, Focus Rail, keyboard shortcuts — logic (tab count, sort, selection, bulk enable/disable) verify đúng 100% qua test UI thật. **Bug/deviation tìm thấy:** (1) label `OPS_STAGE_LABEL.pending_close = "Chờ chốt sổ"` lệch guideline (đúng phải "Hết giờ cược" — hậu tố bị nhầm thành label chính), gây 3 nơi trên cùng trang hiện 2 chuỗi khác nhau cho cùng 1 chặng; (2) bảng 5A thiếu cột Exposure + `pl-5`/`pr-5` so với plan này. Xem [`ui-review-2026-09-07.md`](./ui-review-2026-09-07.md) mục 1-2 |
| [`p1-03-hub-detail-panel`](./p1-03-hub-detail-panel.plan.md) | P1 | ✅ done (07/09) | ✅ reviewed + tested UI (07/09) | p1-02 | Inline expand `hub-expand-panel.tsx` — click DÒNG toggle panel, 0 query, action đơn tái dùng đúng đường Bulk. Test UI thật xác nhận: panel mở đúng, action buttons disable đúng theo trạng thái, 0 query mới phát sinh. Trang `/games/keno/operations` xác nhận **0 dòng bị sửa**. Xem [`ui-review-2026-09-07.md`](./ui-review-2026-09-07.md) mục 5 |
| [`p1-05-ui-redesign`](./p1-05-ui-redesign.plan.md) | P1 | ✅ done (08/09) | ✅ reviewed + tested UI qua CDP từng bước (08/09) | p1-03 | **Redesign toàn diện** theo review UI thật + phản hồi chi tiết của bạn — 9 bước tuần tự, mỗi bước tự review bằng Cursor Browser (CDP) + screenshot trước khi qua bước sau. Gộp Day Flow + Focus Rail thành `HubTimelineRail` (full-width, drag-scroll, nút "Về kỳ hiện tại"); 6 KPI card `h-[72px]` đồng nhất (thêm card "Tổng ngày"); bỏ Void khỏi bulk action, chuyển vào expand panel với dialog 2 lớp (gõ `drawId` + checkbox); outlier 5B đổi từ "kỳ chết" (suy đoán sai) sang 4 điều kiện đo được (`alertsCritical`/p95 doanh thu/cược lớn/p95 exposure); rà soát văn phong 5 chỗ theo bảng §C. **3 bug thật phát hiện qua CDP trong lúc làm, đã fix ngay:** (1) duplicate DOM `id` giữa `OutlierRow`/`SellingFullTable` khi cùng 1 kỳ xuất hiện 2 nơi; (2) "Đóng bán sau" luôn hiện "—" vì dùng nhầm `row.remainingSec` (cố ý `null` ở `gate=Open`) — sửa tính trực tiếp từ `closeAtMs - nowMs`; (3) card KPI "Tổng ngày" sub-text bị `truncate` cắt chữ. `pnpm lint` + `tsc` toàn repo (48/48 package) xanh, không lỗi mới ngoài baseline pre-existing. Tách riêng luồng nhập kết quả tuần tự sang `p1-06` (chưa code) |
| [`p1-07-ui-polish-round2`](./p1-07-ui-polish-round2.plan.md) | P1 | ✅ done (08/09) | ✅ reviewed + tested UI qua CDP (08/09) | p1-05 | **Vòng polish UI thứ 2** sau khi bạn dùng thử bản redesign p1-05 — 9 điểm chốt (§10): (1) KPI Strip viết lại hoàn toàn thành **3 card tài chính thuần** (Tổng tiền cược/Tổng số vé/Rủi ro chi trả, mỗi card có breakdown "tồn đọng" theo `gate !== Open`) — bỏ hẳn 4 card đếm việc trùng lặp với tab bar + bỏ hẳn active/ring state; (2) Header — `RefreshButton` đổi từ icon reload+đếm giây sang chấm "Live"/"Chậm" nhấp nháy (tái dùng pattern có sẵn ở `live-feed.tsx`); (3) `HubTimelineRail` — card `flex-1` lấp đủ chiều rộng khi ít kỳ, kỳ hiện tại có icon `Radio` pulse + nền `bg-primary/10`; (4) Bảng 5A — scroll `max-h-[70vh]` + `overflow-hidden` fix border góc khi sticky, checkbox cell đổi thành icon `Lock` xám khi hết action; (5) Zone 5B — sort **tường minh** theo `closeAtMs` tăng dần (trước dựa vào thứ tự ngầm định), outlier gộp khi >5 dòng, hover hiện icon `ExternalLink`; (6) Expand panel — bỏ nút "Chọn vào lô xử lý" (dư thừa với checkbox), **bỏ hẳn Void** (chuyển hẳn sang trang `operations` chi tiết, xoá cả `VoidConfirmDialog`), link header chỉ còn icon, timestamp bỏ năm, Việt hoá "Exposure"→"Rủi ro chi trả (chưa cap)"/"Alert"→"Cảnh báo". `DrawIdLabel` giữ nguyên logic (đã đúng từ p1-05), chỉ thêm nhãn "Ngày quay" vào tooltip. Bulk settle limit (`BULK_MAX_DRAWS=50`/`BULK_CONCURRENCY=5`) xác nhận đã đúng cơ chế mong muốn từ p0-04, không cần UI mới. Biome+tsc sạch, verify qua CDP browser thật (không bấm confirm mutation nào — dữ liệu thật) |
| [`p1-08-tab-redesign-polish-round3`](./p1-08-tab-redesign-polish-round3.plan.md) | P1 | ⏳ pending (chờ bạn chốt 8 câu hỏi §9) | ⏳ pending | p1-07 | **Vòng polish thứ 3** sau khi dùng thật bản p1-07 — 8 điểm (08/09): (1) Dải kỳ mất viền trên kỳ hiện tại (`ring-offset` thiếu `padding-top` ở container scroll) + hỏi bỏ nút Lùi/Tiến (đã có drag-to-scroll sẵn từ p1-05) không; (2) checkbox header lệch 12px so với checkbox dòng (đo CDP: `pl-5` vs `p-2`) — fix ngay không cần hỏi; (3) P1-06 nhắc lại, chưa tách file; (4) KPI "quá thưa" — mâu thuẫn với quyết định p1-07 "bỏ card trùng tab", đưa 3 phương án chờ chọn; (5) chiều cao trang — chẩn đoán `max-h-[70vh]` không trừ phần header/KPI/rail phía trên nên tổng > 100vh, đề xuất `h-[calc(100vh-...)]` + `flex-1 min-h-0` (rủi ro cao hơn) hoặc siết `gap`/`padding` (an toàn, làm trước); (6) "Live" dời cạnh subtitle header; (7) **bug thật**: icon khoá tooltip sai + kỳ `SalesClosed`/chưa có KQ bị `bulkKindForStatus` trả `null` nên Expand Panel không hiện nút nào — thêm nút link "Công bố KQ ↗" tái dùng `getNextAction`; (8) bỏ tab "Cần xử lý" (hợp nhiều action, dễ hiểu lầm khi bulk) → 5 tab theo đúng 1 action/tab (thêm "Chờ mở bán"), sửa 4 đích Alert Banner. **CHƯA CODE** — chờ bạn trả lời §9 |
| [`p1-09-expand-panel-redesign`](./p1-09-expand-panel-redesign.plan.md) | P1 | ✅ done (08/09) | ✅ reviewed + tested UI qua CDP 3 vòng (08/09) | p1-08 | **Redesign Expand Panel + KPI hoa hồng** (từ review UI thật của bạn): (1) **bug format ngày** — `fmtTime` dùng `toLocaleString("vi-VN")` sinh `07-09` (dash) trong khi `DrawIdLabel` toàn trang dùng `06/09` (slash); Intl KHÔNG cho chọn separator nên phải tự ghép string, bỏ giây (đưa vào `title`); (2) panel 3 cột ĐỀU nhau là gốc của "không có điểm nhấn" → **dải A full-width** (badge chặng + câu "vì sao" nâng lên `text-sm` + nút hành động CÙNG HÀNG canh phải, accent `border-l-[3px]` theo `health` để kế thừa màu dòng đỏ) + 2 cột bất đối xứng 58/42 (Dòng thời gian 5 mốc CỐ ĐỊNH kèm `(… trước)` / Tiền & rủi ro tự hạ tương phản khi kỳ chưa có cược, gộp `Cược lớn`+`Cảnh báo` thành badge chỉ hiện khi >0); bỏ footer nút (trước cách câu chẩn đoán ~120px, buộc mắt đi qua vùng toàn số `0`); (3) **KPI "Ước tính hoa hồng" → dùng SỐ THẬT**: `totals.commission` đã có trong stats doc (worker `$inc` mỗi tick từ `entry.tenant.commissionAmount` — rate riêng từng tenant) nhưng CHƯA trong projection Hub → thêm 1 dòng projection + 3 field DTO = **0 query mới** (giữ RÀNG BUỘC "đúng 4 query"). Ước tính `revenue × 20%` sẽ SAI khi tenant override rate. Card thứ 5 (`Percent`, amber) đặt ngay sau "Tổng tiền cược", `lg:grid-cols-5`, `sub` = phần tồn đọng giống 3 card tài chính, thêm prop `tooltip` + sửa skeleton 4→5 ô. **BUG THẬT phát hiện qua CDP (không nằm trong 7 vấn đề dự đoán, screenshot tĩnh không thấy được):** counter đếm sống bị "đóng băng" — `Date.now() - row.ageInStageSec * 1000` trộn đồng hồ SỐNG với ảnh chụp theo poll nên mốc neo trượt về sau mỗi render, triệt tiêu việc đếm; đo được ô cột `Thời gian` bảng 5A ĐỨNG YÊN `3h17ph` suốt 90s trong khi mốc `Công bố KQ` cùng kỳ đã tới `3h23ph` — **lệch 6 phút trong CÙNG khung nhìn**. Fix: export `stageStartMs(ts, stage)` dùng chung ở `derive-draw-state.ts` (cạnh mốc gốc `deriveHealth`) trả timestamp TUYỆT ĐỐI theo chặng, áp cho cả bảng và panel → verify lại: tăng đơn điệu `3h28→3h31ph`, bảng và panel đổi phút CÙNG LÚC, lệch 0. Sửa thêm 2 điểm sau khi xem UI: counter dải A chỉ hiện khi `health=Ok` (ở `warn`/`stuck`, `reason` đã chứa thời lượng → trước đó hiện cùng con số 2 lần cách nhau 1 dòng, và lệch nhau tại mốc đổi đơn vị vì `reason` đổi theo poll còn counter theo giây), nhãn bỏ `(VND)`. **Còn nợ:** đối chiếu `32K` hoa hồng kỳ #060 với `totals.commission` bằng Compass; tìm kỳ có tenant rate ≠20% để chứng minh khác `revenue × 0.2`. **Fix vòng 4 (09/09, phản hồi sau khi dùng bản p1-09 thật):** (a) nút hành động dải A `items-start` → `items-center` — câu "vì sao" xuống 2 dòng khiến nút neo lệch lên trên; (b) bỏ hẳn `(… trước)` khỏi 5 mốc Dòng thời gian — trùng với con số dải A đã nói (`reason`/counter `· đã …`), giữ absolute time + `title` đầy đủ giây/năm khi hover; (c) 2 khối "Dòng thời gian"/"Tiền & rủi ro" thêm khung `border rounded-lg bg-card` + icon (`Clock`/`Wallet`) cạnh heading — trước không khung nên "chìm" vào nền `bg-muted/30` của panel, không tách biệt khỏi dải A hay khỏi nhau; (d) trả lời câu hỏi "Kết sổ có luôn còn không" bằng đọc code (không phải suy đoán): Hub chỉ query `DRAW_UNFINISHED_STATUSES` (mọi status trừ `Settled`/`Void`) nên kỳ kết sổ xong **biến mất khỏi Hub ngay lần poll sau** — mốc "Kết sổ" trong panel chỉ có giá trị thấy được ở case hiếm `NeedsResettle` (KQ sửa sau khi đã kết sổ lần đầu). Verify: lint + `tsc --noEmit` xanh, xem UI qua CDP xác nhận cả 3 fix UI trên 2 kỳ thật (`PendingClose` + `AwaitingSettle`). **Trần bulk action (09/09, §12 file plan):** đã chốt KHÔNG nâng `BULK_MAX_DRAWS` server — thay bằng client-side batch runner (chia lô tuần tự, gộp kết quả, engine domain-agnostic ở `hooks/use-batch-runner.ts` để bingo18 tái dùng nếu cần), bỏ trần selection ở UI, retry thất bại vẫn manual. Implement xong, `biome`/`tsc` sạch — chưa E2E được vì DB dev hiện 0 kỳ |
| [`p1-06-sequential-publish-result`](./p1-06-sequential-publish-result.plan.md) | P1 | ✅ done (08/09) | ✅ reviewed + tested UI thật (08/09) | p1-07 | Luồng "Xác nhận & Kỳ tiếp ▶" cho nhập kết quả nhiều kỳ liên tiếp — **CHỈ Keno + Bingo18** (2 game nhập nhiều kỳ/ngày). 3 nút phân tầng: `Huỷ bỏ` (ghost) · `Xác nhận` (outline, ít chú ý) · `Xác nhận & Kỳ tiếp ▶` (default = main); ở kỳ cuối "Kỳ tiếp" ẩn, `Xác nhận` lên `default`; header hiện `kỳ N/M`, footer liệt kê drawNo còn lại. Sửa 2 cặp file `publish-result-action.tsx` + `draw-management/index.tsx` riêng biệt cho Keno/Bingo18 (không dùng chung 7 game — đã verify). Hàng đợi build từ `useDrawContext().draws` lọc `status === SalesClosed`, sort theo `drawId` (lexical, đúng thứ tự thời gian dù vắt qua nhiều ngày). **1 bug thật phát hiện khi test UI thật bằng dữ liệu 2 kỳ SalesClosed khác ngày (#015 04/09 + #001 07/09):** hàng đợi dùng `pending.slice(idx)` sau sort ASC theo `drawId` — bỏ sót MỌI kỳ đứng TRƯỚC idx trong danh sách đã sort (kỳ tồn từ ngày trước luôn đứng trước kỳ hôm nay theo lexical `drawId`); nếu staff đang mở kỳ hôm nay, kỳ tồn cũ rơi khỏi hàng đợi hoàn toàn, dialog chỉ hiện 1 nút "Xác nhận" thay vì "Xác nhận & Kỳ tiếp". Fix: đặt kỳ đang xem lên đầu bằng `[current, ...pending.filter(id khác)]` thay vì `slice`. Verify lại bằng browser thật: publish kỳ #001 → dialog tự chuyển đúng sang #015 (khác ngày), counter/footer cập nhật đúng, publish tiếp #001→#015 xong cả 2 kỳ chuyển "Kết sổ". Biome+tsc sạch (2 file, không lỗi mới ngoài baseline pre-existing đã biết ở dòng `as any`/`nums` không thuộc diff) |
| [`p1-10-hub-inline-publish-result`](./p1-10-hub-inline-publish-result.plan.md) | P1 | ✅ code done + 1 bug đã sửa (09/09) | ⏳ pending test UI thật lần 2 | p1-06, p1-09 | **Nhập kết quả ngay trong Hub** — thay nút "Công bố KQ ↗" (điều hướng sang tab `operations`, quyết định tạm ở p1-08 §6) bằng mount trực tiếp dialog `PublishResultAction` (đã có từ p1-06) khi kỳ `SalesClosed`. **Chỉ Keno** — Bingo18 chưa có trang Hub (p1-04 pending), áp dụng khi port (bảng đối chiếu khác biệt ở §7 file plan). **1 bug thật phát hiện khi test UI lần 1** (báo bởi user, không phải review code): bấm "Xác nhận & Kỳ tiếp" khiến dialog TỰ TẮT thay vì chuyển kỳ tiếp theo. Nguyên nhân: dialog mount ngay trong `hub-expand-panel.tsx`, gate bằng `row.status === SalesClosed`; publish thành công → refetch → status đổi `SalesClosed → Published` → kỳ rời `rows5A` của tab đang chọn → effect tự-đóng-panel có sẵn (viết cho mục đích khác) unmount `HubExpandPanel` → dialog (đang giữ hàng đợi) chết theo. **Đã sửa:** chuyển toàn bộ state (`publishOpen`, `publishAnchorId`), `useMemo publishQueue`, và mount `<PublishResultAction>` lên `hub-queue-table.tsx` (component cha, không phụ thuộc trạng thái/tab của 1 dòng cụ thể) — `hub-expand-panel.tsx` chỉ còn gọi callback `onOpenPublish(row.drawId)`. Chi tiết đầy đủ ở §2.4 file plan. Đúng 4 file thay đổi: (1) export thêm `PublishResultDraw` ở barrel `draw-actions/index.ts`; (2) file mới `to-publish-result-draw.ts` map `DerivedRow`→`PublishResultDraw`, convert `drawTime` qua `displayVNTime()` (nguồn Hub là ISO 8601, khác `DrawSelectorItem.drawTime` đã format `HH:mm`); (3) `hub-queue-table.tsx` — state + queue + mount dialog; (4) `hub-expand-panel.tsx` — prop `onOpenPublish` thay cho state cục bộ. Hàng đợi build từ `state.rows` (toàn bộ, không phải `rows5A` đã lọc theo tab), đặt kỳ vừa bấm lên đầu — áp lại đúng fix bug `slice(idx)` đã gặp ở p1-06. Query cache tự cập nhật (0 code thêm) vì `usePublishResult` đã invalidate `kenoKeys.all`, là cha của `kenoKeys.opsHub()`. `biome check` + `pnpm --filter @megawin/backoffice check-types` xanh; `git diff --stat` xác nhận trang `operations` **0 dòng bị sửa** ngoài 1 dòng export type ở barrel. **Chưa test UI thật lần 2** (§5 file plan) — cần lặp lại đúng kịch bản đã gây bug lần 1 (≥2 kỳ `SalesClosed`, bấm "Xác nhận & Kỳ tiếp" liên tiếp) để xác nhận dialog không còn tự tắt |
| [`p1-04-bingo18-port`](./p1-04-bingo18-port.plan.md) | P1 | ⏳ pending | ⏳ pending | p1-07 chạy thật ≥1 tuần | Port sang Bingo18. Redesign p1-05 + polish p1-07 đã sửa hết bug/deviation tìm thấy ở p1-01/p1-02/p1-03 — port theo UI mới, không lặp lại "kỳ chết"/label lệch/hardcode màu |
| [`p2-01-autopilot-config`](./p2-01-autopilot-config.plan.md) | P2 | ⏳ pending | ⏳ pending | p1-04 chạy thật ≥2 tuần | Config-first cho **4 giai đoạn** (mở/đóng bán/nhận kết quả/kết sổ), deterministic, KHÔNG LLM |
| [`p2-02-autopilot-open-close-engine`](./p2-02-autopilot-open-close-engine.plan.md) | P2 | ⏳ pending | ⏳ pending | p2-01 | Giai đoạn 1+2 — mở kỳ theo mô hình **reconcile** (cron 5-10 phút, tự bù kỳ thiếu) + tự đóng bán. Tái dùng `CreateDrawUseCase`/`CloseSalesUseCase` |
| [`p2-03-autopilot-publish-engine`](./p2-03-autopilot-publish-engine.plan.md) | P2 | ⏳ pending | ⏳ pending | p2-01 | Giai đoạn 3 — tự nhận kết quả. **Phụ thuộc ngoài cứng: ResultFeed đạt G5** trước khi bật `enabled` |
| [`p2-04a-settle-payout-extract`](./p2-04a-settle-payout-extract.plan.md) | P2 | ⏳ pending | ⏳ pending | — | **Refactor thuần**, không đổi hành vi: tách logic tính payout inline trong `SettleEntriesBatchUseCase` thành hàm pure `computeEntryPayout`. Prerequisite của p2-04b |
| [`p2-04b-settle-preview-engine`](./p2-04b-settle-preview-engine.plan.md) | P2 | ⏳ pending | ⏳ pending | p2-04a | **Kết sổ thử**: tính CHÍNH XÁC số tiền phải trả từ kết quả đã publish, ghi collection riêng `keno_settle_previews`. **KHÔNG** chạm entries/draw/pipeline. Kèm vòng tự kiểm chứng đối chiếu `draw.financial` sau settle thật |
| [`p2-04-autopilot-settle-engine`](./p2-04-autopilot-settle-engine.plan.md) | P2 | ⏳ pending | ⏳ pending | p2-01, **p2-04a, p2-04b** | Giai đoạn 4 — kết sổ. Rule engine + cron, quyết định trên **SỐ TIỀN THẬT** từ `keno_settle_previews`. **Nguy hiểm nhất** — bắt buộc backfill 30 ngày (100% `delta === 0`) + dry-run ≥3 ngày |
| [`p2-05-autopilot-decision-log-ui`](./p2-05-autopilot-decision-log-ui.plan.md) | P2 | ⏳ pending | ⏳ pending | p2-04 | Log quyết định + panel Hub + Mira read-only (chi tiết cho giai đoạn kết sổ, pattern áp dụng chung §9) |

Tài liệu kèm (không phải plan thực thi):
[`ops-hub-page-layout.guideline.md`](./ops-hub-page-layout.guideline.md) — chuẩn UI/UX trang Hub ·
[`ui-review-2026-09-07.md`](./ui-review-2026-09-07.md) — báo cáo review UI + test trực tiếp trên
browser (p0-01→p1-03), nguồn phát hiện các bug/deviation đã được **sửa hết ở `p1-05`** (label lệch
guideline, thiếu cột Exposure, màu icon PageHeader hardcode sai, "kỳ chết" suy đoán sai, layout Day
Flow/Focus Rail vô nghĩa).

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

**Lưu ý khi chạy `check:url-params` (P1-02/P1-03):** script báo 1 lỗi **pre-existing, KHÔNG liên
quan** tới feature này — `lib/auth/callback-url-storage.ts:27` ghi `tab=` cho `/games/keno/draws`
(route khác hẳn `operations-hub`), đã verify bằng `git log` (commit cũ, không thuộc diff của
`p0-01`…`p1-03`). Không sửa trong phạm vi plan này; nếu ai fix, làm ở PR riêng.

**Bổ sung sau p1-03 (07/09): thiếu entry sidebar.** Không plan nào trong p1-01/p1-02/p1-03 khai báo
việc thêm mục vào sidebar UI thật — `nav-registry.ts` (`NavPage.GameOperationsHub`) chỉ phục vụ
AI tool/`buildNavHref`, **không** điều khiển sidebar hiển thị. Nguồn thật cho sidebar là
`apps/backoffice/src/navigation/sidebar/sidebar-items.ts` (khác hẳn `nav-registry.ts`, dễ nhầm vì
tên gần giống). Đã thêm sub-item "Trung tâm vận hành" (`icon: Gauge`, `isNew: true`) ngay dưới
"Vận hành" trong nhóm Keno, trỏ `/games/keno/operations-hub` — nếu không có bước này staff không
có đường vào trang Hub từ UI (chỉ vào được bằng gõ URL tay hoặc qua AI tool). Biome+tsc xanh. Khi
làm p1-04 (port Bingo18), nhớ thêm tương tự cho nhóm Bingo18.

---

## Thứ tự phụ thuộc

```
p0-01 (daily rollup race)  ──┬──► p0-02 (bỏ guard) ──► p0-04 (bulk API) ──┐
                             │                                            │
p0-03 (query foundation) ────┴────────────► p1-01 (shell+KPI) ──► p1-02 ──┴──► p1-03 ──► p1-05 (redesign) ──► p1-07 (polish round 2) ──┬──► p1-04 (Bingo18 port)
                                                                                                                                        ├──► p1-06 (sequential publish, ✅ done 08/09)
                                                                                                                                        └──► p1-09 (expand panel redesign, ✅ done 08/09) ──► p1-10 (Hub inline publish, ✅ code + 1 bug đã sửa 09/09, chờ test lần 2)
                                              (chạy thật 1-2 tuần sau p1-07) ◄─────────────────────────────────────────────────────────┘
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
| p1-07 | p1-04 | Keno Hub (bản redesign + polish round 2) production **≥ 1 tuần** | 7 câu hỏi mở (§trên) chỉ có đáp án khi chạy thật. Đổi từ "p1-03 → p1-04" vì p1-05+p1-07 đã sửa hết bug/deviation UI tìm thấy — port Bingo18 theo UI cũ sẽ phải sửa 2 lần |
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
