# Backoffice — Navigation Performance & Prefetch — Master Plan (00-overview)

> **Nguồn:** [`docs/analytics/backoffice-navigation-performance.md`](../../../docs/analytics/backoffice-navigation-performance.md)
> **Ngày chốt scope:** 10/09/2026
> **Mục tiêu:** cảm giác chuyển trang nhanh như webapp trong `apps/backoffice`, **sửa dứt điểm** lỗi
> "load liên tục" khi dùng prefetch, **không** đánh đổi độ chính xác dữ liệu (ops/tiền).
> **Feature slug:** `backoffice-nav-performance` · tuân [`.cursor/plans/README.md`](../README.md)

---

## 0. Bằng chứng mới tìm thấy khi lập plan — SỬA LẠI khuyến nghị của analysis doc

Analysis doc gốc đề xuất P0 là *"`HoverPrefetchLink` cho sidebar + bỏ `prefetch={false}` cứng"* làm
việc đầu tiên. Khi đọc code để lập plan này, phát hiện **bằng chứng thật tại hiện trường** mà
analysis doc chưa có: `apps/backoffice/src/components/ai-chat/chat-header.tsx` dòng 24-30 có đúng
comment cảnh báo, ghi lại một sự cố **CÙNG loại bug** đã xảy ra và được tự tay revert ngày 04/09/2026:

> *"⚠️ KHÔNG prefetch khi hover/focus (đã bỏ 04/09). Từng thêm `router.prefetch()` ở `onMouseEnter`/
> `onFocus`... nhưng `/ai` là route dynamic session-gated, không cache được (`staleTimes.dynamic` = 0
> mặc định), nên MỌI lần gọi đều tạo 1 request RSC mới, hết hạn ngay. Production ghi nhận **hàng trăm
> request `_rsc` lặp lại** dù đã thêm guard dedupe-theo-href."*

**Kết luận rút ra (đổi thứ tự P0 so với analysis doc):**

1. Gốc bug là `staleTimes.dynamic = 0` (default Next 15+, xem `p0-01` §1) — **KHÔNG phải** việc gọi
   `router.prefetch()` hay dùng `<Link>` tự nó sai. Sửa **cấu hình gốc** trước, không sửa từng
   component một.
2. Toàn bộ 84 route dưới `(main)` **đều dynamic** — layout gọi `requireOperatorSession()` +
   `cookies()` cho MỌI request. Không có route nào "an toàn hơn route khác" theo tiêu chí static/dynamic.
3. `HoverPrefetchLink` (pattern chính thức của Next — flip `prefetch` prop, KHÔNG tự gọi
   `router.prefetch()` trong event handler) là **an toàn hơn** pattern `/ai` đã dùng (gọi
   `router.prefetch()` trực tiếp, tự viết dedupe tay). Nhưng vẫn phải **pilot đo network trước**,
   không rollout toàn bộ 91 chỗ `prefetch={false}` cùng lúc — đúng bài học từ `/ai`.
4. Vì vậy plan này tách `p0-01` (sửa root cause + viết guardrail cấm lặp lại đúng bug `/ai`) làm
   **P0 thật**, đẩy hover-prefetch sidebar xuống `p1-01` với yêu cầu đo lường trước khi rollout rộng.

---

## 1. Bảng trạng thái

| Plan | Phase | Status | Việc chính | Rủi ro dữ liệu |
|---|---|---|---|---|
| [`p0-01-fix-prefetch-loop-root-cause`](./p0-01-fix-prefetch-loop-root-cause.plan.md) | P0 | ⏳ pending | `staleTimes.dynamic` > 0 (60s) trong `next.config.ts` + viết rule cấm anti-pattern `/ai` + verify Network tab | Không — chỉ Next Client Cache, không đụng RQ/API |
| [`p0-02-loading-skeleton-coverage`](./p0-02-loading-skeleton-coverage.plan.md) | P0 | ⏳ pending | Thêm `loading.tsx` cho `games/**`, `reports/**`, `dashboard`, `resultfeed`, `audit-logs`, `system/workers` | Không — server component tĩnh, không fetch |
| [`p1-01-hover-prefetch-nav-shell`](./p1-01-hover-prefetch-nav-shell.plan.md) | P1 | ⏳ pending | `HoverPrefetchLink` cho sidebar, pilot 1 nhóm → đo → rollout | Thấp — chỉ shell, không kéo data API |
| [`p1-02-react-query-prefetch-on-hover`](./p1-02-react-query-prefetch-on-hover.plan.md) | P1 | ⏳ pending | `queryClient.prefetchQuery` khi hover cho 4-5 route nóng (Dashboard, 2 Hub, Operations, Outstanding) | Thấp nếu `staleTime` khớp poll — có kiểm tra |
| [`p1-03-react-query-staletime-matrix`](./p1-03-react-query-staletime-matrix.plan.md) | P1 | ⏳ pending | Chuẩn hoá + document ma trận `staleTime` theo loại màn (realtime/drilldown/config/tĩnh), audit lệch | Trung — sửa `staleTime` sai có thể làm số liệu cũ hiện lâu hơn dự kiến, cần review từng use-case |
| [`p2-01-cache-components-guides-pilot`](./p2-01-cache-components-guides-pilot.plan.md) | P2 | ⏳ pending | `cacheComponents` + `'use cache'` CHỈ cho `/guides` (nội dung tĩnh, không ops/tiền) | Không — nội dung markdown build-time, không phải data nghiệp vụ |
| [`p2-02-view-transitions-polish`](./p2-02-view-transitions-polish.plan.md) | P2 | ⏳ pending | `<ViewTransition>` cho layout content khi đổi route | Không — thuần CSS/UX polish |
| [`p2-03-instant-navigation-spike`](./p2-03-instant-navigation-spike.plan.md) | P2 (spike) | ⏳ pending | Xác nhận `instant` (Next 16.3, đổi tên từ `unstable_instant`) có áp dụng được không — kỳ vọng bị chặn ở `MainLayout`, quyết định làm tiếp hay dừng | Không — chỉ thử nghiệm tạm rồi xoá, không giữ code trong nhánh chính |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

---

## 2. Thứ tự phụ thuộc

```
p0-01 (fix staleTimes root cause + guardrail)  ──┬──► p1-01 (hover prefetch nav — pilot rồi rollout)
                                                  │                    │
p0-02 (loading.tsx coverage) ────────────────────┘                    ▼
                                                          p1-02 (RQ prefetch on hover — 4-5 route nóng)
                                                                       │
                                                                       ▼
                                            p1-03 (chuẩn hoá staleTime matrix — làm SONG SONG được,
                                                    không phụ thuộc p1-01/p1-02, nhưng nên làm trước
                                                    p1-02 để prefetch dùng ĐÚNG staleTime đã chuẩn hoá)

p1-01 + p1-02 chạy thật ≥ 1 tuần ──► p2-01 (Cache Components — chỉ /guides, không đụng ops/tiền)
                                 │                      │
                                 │                      ▼
                                 │       p2-03 (spike: instant route config — cần cacheComponents đã bật)
                                 └──► p2-02 (View Transitions — polish, làm bất kỳ lúc nào sau P1)
```

**Điểm chặn cứng duy nhất:** `p0-01` phải xong và **verify bằng Network tab thật** trước khi làm bất
kỳ plan nào gọi `router.prefetch()` hoặc bật lại prefetch trên link (`p1-01`) — đây chính xác là thứ
tự đã bị đảo ngược trong lần thử nghiệm `/ai` (04/09): thêm hover-prefetch TRƯỚC khi sửa
`staleTimes`, gây storm, phải revert. Không lặp lại.

`p1-03` khuyến nghị làm **trước hoặc cùng lúc** `p1-02` (không bắt buộc thứ tự cứng) vì `p1-02` cần
biết đúng `staleTime` của từng query để prefetch không phá tính "tươi" của dữ liệu.

---

## 3. Nguyên tắc chung (áp cho MỌI plan trong thư mục)

1. **Next tối ưu shell. React Query tối ưu data.** Không bao giờ dùng cơ chế prefetch/cache của Next
   (`staleTimes`, `cacheComponents`, `router.prefetch`) để thay cho `staleTime`/`refetchInterval` của
   React Query. Hai tầng cache độc lập — xem `docs/analytics/backoffice-navigation-performance.md` §2.2.
2. **Cấm tuyệt đối pattern `router.prefetch(href, { onInvalidate: poll })`** (docs Next gọi là
   `ManualPrefetchLink`) trên toàn bộ `apps/backoffice`, trừ khi thiết kế mới có `staleTimes.dynamic`
   dương **và** có debounce/cancel rõ ràng đã review riêng. Đây là nguồn gốc chính xác của cả 2 sự cố
   đã biết (bug gốc user báo + sự cố `/ai` 04/09).
3. **Không thay đổi behavior tài chính/vận hành để lấy tốc độ.** `staleTime`/`refetchInterval` của
   màn hình tiền (settle, outstanding, exposure) chỉ được SIẾT chặt hơn hoặc giữ nguyên, không được
   nới lỏng vì "cho nhanh hơn" — theo `gitnexus-code-graph.mdc` §4 (code tài chính đọc bằng mắt, không
   suy đoán).
4. **Đo trước khi rollout rộng.** Mọi thay đổi liên quan prefetch (`p1-01`, `p1-02`) phải có bước đo
   Network tab / React Query Devtools trên 1 nhóm nhỏ TRƯỚC khi áp dụng cho toàn bộ 91 chỗ
   `prefetch={false}` hiện có. Không "sửa 1 lần cho tất cả" — chính cách làm này đã gây sự cố `/ai`.
5. **Mỗi plan có mục Test/Review + Rollback** — không có ngoại lệ, vì thay đổi thuộc tầng hạ tầng
   (Next config, cache) ảnh hưởng đồng thời nhiều trang, khó khoanh vùng nếu không có checklist rõ.
6. **Tiếng Việt cho prose, tiếng Anh cho thuật ngữ.** JSDoc bắt buộc theo `code-quality-standards.mdc`.

---

## 4. Câu hỏi phải trả lời BẰNG ĐO LƯỜNG (không quyết trước)

| # | Câu hỏi | Chốt ở | Kết quả |
|---|---|---|---|
| 1 | Sau khi set `staleTimes.dynamic = 60`, hover lặp lại 20 lần trên 1 link có còn tạo > 1 request RSC không? | `p0-01` §5 | ⏳ Phải dán screenshot Network tab vào PR |
| 2 | `HoverPrefetchLink` trên 1 nhóm nav pilot (7 game-group header) có tạo request storm không sau khi `staleTimes` đã fix? | `p1-01` §5 | ⏳ Đo trước khi rollout 91 chỗ còn lại |
| 3 | `queryClient.prefetchQuery` on hover cho Hub có làm sai lệch data khi staff bấm ngay sau khi rời kỳ đang xem hơn `staleTime`? | `p1-02` §4 | ⏳ Test tay: hover → chờ > staleTime → click → so dữ liệu với API trực tiếp |
| 4 | Cache Components + `'use cache'` cho `/guides` có leak nội dung giữa 2 session khác quyền xem không? | `p2-01` §4 | ⏳ `/guides` không phân quyền theo role — xác nhận trước khi bật |
| 5 | `instant` (Instant Navigation, Next 16.3) có áp dụng được cho backoffice không, hay bị chặn ở `MainLayout`? | `p2-03` §4 | ⏳ Spike xác nhận bằng thử nghiệm thật, không suy đoán — xem `p2-03` §3 cho giả thuyết ban đầu |

---

## 5. Định nghĩa "xong" (Definition of Done) cho toàn feature

1. Network tab: hover lặp lại bất kỳ link nào trong sidebar **không** tạo quá 1 request RSC / lần
   hover thật (không tính lần đầu), và không có request nào tự lặp lại khi không có tương tác mới.
2. Toàn bộ route hay dùng (`games/**/operations`, `games/**/operations-hub`, `reports/**`,
   `dashboard`, `accounts/**`) có `loading.tsx` khớp layout — không còn khoảng trắng khi chuyển trang
   lần đầu (JS chunk chưa tải).
3. `pnpm --filter @megawin/backoffice check-types` + `pnpm lint` xanh sau mỗi plan.
4. Không màn hình tài chính/vận hành nào đổi `staleTime`/`refetchInterval` theo hướng nới lỏng —
   `p1-03` phải liệt kê rõ từng thay đổi kèm lý do.
5. `docs/analytics/backoffice-navigation-performance.md` được cập nhật link trỏ sang plan này (mục
   "Plans phái sinh") sau khi `p0-01` xong.

---

## 6. Sau khi hoàn thành

- [ ] Cập nhật `docs/analytics/backoffice-navigation-performance.md`: thêm mục "Plans phái sinh" trỏ
      về thư mục này, đổi các dòng roadmap §7 đã làm thành "✅ done, xem plan tương ứng".
- [ ] Nếu `HoverPrefetchLink` ổn định sau rollout — xem xét thêm `.cursor/rules/` mới nếu pattern này
      trở thành convention bắt buộc cho mọi `<Link>` sidebar mới (hiện chưa có rule riêng, chỉ có ghi
      chú rải rác trong `chat-header.tsx` và các plan Hub).
- [ ] Rà lại toàn bộ comment "KHÔNG prefetch..." còn sót trong code (grep `KHÔNG prefetch`) — cập
      nhật hoặc xoá nếu `p0-01`/`p1-01` đã thay đổi bản chất khuyến nghị.
