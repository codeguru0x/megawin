# ResultFeed — Backoffice & API (đã tách thành 07 + 08)

⚠️ **File này đã tách làm 2 plan riêng** (2026-09-02) sau khi xác nhận 2 việc độc lập cần triển
khai: trang quản trị ResultFeed và tính năng tự lấy kết quả điền form nhập kết quả. Đọc 2 file đó
để triển khai — nội dung dưới đây chỉ giữ lại phần vẫn còn đúng làm tham chiếu chung.

| File | Phạm vi |
| --- | --- |
| [`07-admin-management-page.plan.md`](07-admin-management-page.plan.md) | Trang `(main)/resultfeed/*` + API `/api/resultfeed/*` — **chỉ Admin** xem được (không còn Staff/Manager như bản gốc dưới đây). Trang `review` (verify/reject conflict), `periods`, `sources`, dashboard. |
| [`08-vietlott-result-autofill.plan.md`](08-vietlott-result-autofill.plan.md) | API `GET /api/resultfeed/results` (API key, không session) + tính năng nút "Lấy kết quả" tự điền form nhập/sửa kết quả ở cả 7 game trong `apps/backoffice`. |

## Vì sao tách, và những gì đã đổi so với bản gốc

- `CompanyRole` (`packages/identity/src/entities/account.ts`) chỉ có `Admin`/`Staff` — **không có
  `Manager`**. RBAC 3 cấp (Staff/Manager/Admin) ở §3 bản gốc dưới đây **không áp dụng được** — đã
  đơn giản hoá thành **toàn bộ menu ResultFeed chỉ Admin** (theo yêu cầu vận hành thực tế).
- Worker đã **auto-publish** khi máy quyết `Agreed` (`RESULTFEED_AUTO_PUBLISH_UNVERIFIED=true`,
  xem `packages/resultfeed-application/src/use-cases/consensus/tick.ts`) — action `…/publish`
  (Manager) ở §3/§4 bản gốc **không cần xây**.
- Tính năng "lấy kết quả điền form" (mới, không có trong bản gốc) được thiết kế gọi qua chính API
  `/results` ở §4 — không phải một API riêng.

---

## Nội dung gốc (2026-08) — giữ tham khảo, KHÔNG dùng để triển khai RBAC/publish

Vận hành nằm trong `apps/backoffice` (không dựng app riêng): người dùng là **cùng một nhóm staff**,
cùng session, cùng RBAC. Dựng app riêng chỉ để có menu riêng là thêm một auth surface, một deploy,
một domain — không đổi lại gì. Nhưng **domain/DB thì tách hẳn** (D3) nên tách khi cần chỉ là chuyển
thư mục route, không phải bóc nghiệp vụ.

### Cấu trúc (vẫn đúng — xem 07 §Cấu trúc trang để biết bản rút gọn)

```
apps/backoffice/src/app/
├── (main)/resultfeed/                     ← MENU RIÊNG, không nằm trong games/
│   ├── page.tsx                         ← Dashboard: kỳ chờ duyệt, sức khoẻ nguồn
│   ├── review/                          ← ⭐ Hàng đợi duyệt — trang quan trọng nhất
│   │   ├── page.tsx
│   │   └── _lib/
│   ├── periods/                         ← Tra cứu 1 kỳ: mọi nguồn nói gì
│   ├── sources/                         ← Quản lý nguồn: role, trustWeight, enable
│   └── submissions/                     ← Log thô: xem HTML gốc, chi phí
└── api/resultfeed/
    ├── consensus/{route.ts, [gameKey]/[drawPeriod]/route.ts}
    ├── consensus/[gameKey]/[drawPeriod]/verify/route.ts
    ├── consensus/[gameKey]/[drawPeriod]/publish/route.ts    ← ĐÃ BỎ, xem 07
    ├── observations/route.ts
    ├── submissions/{route.ts, [id]/raw/route.ts}
    ├── sources/{route.ts, [sourceId]/route.ts}
    ├── health/route.ts
    └── results/route.ts                 ← MegaWin core PULL (API key, không session) — xem 08
```

Đặt ở `(main)/resultfeed/` **không** phải `(main)/games/resultfeed/`: nó không phải một game, và để trong
`games/` sẽ ngầm gợi ý nó dùng chung khái niệm draw với các game — điều mà D7 cấm.

### Trang `review` — thiết kế quanh câu hỏi thật của người duyệt (vẫn đúng, xem 07)

Người duyệt cần trả lời đúng một câu: **"nguồn nào đúng, và tôi có tin được không?"** Layout phải
phục vụ câu đó, không phải đổ dữ liệu ra bảng.

```
┌─ Keno · kỳ 0293945 · 30/08/2026 14:32 ────────────── [Conflict] ─┐
│                                                                   │
│  ┌ vietlott-detail  authoritative · w100 ─────────── ✅ Passed ─┐ │
│  │  07 09 14 22 … 78                                            │ │
│  │  chẵn 9 · lẻ 11 · lớn 11 · nhỏ 9   ✅ ta tính lại: khớp      │ │
│  │                                       [Chọn nguồn này]       │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ┌ minhchinh-json   confirming · w60 ──────── ⚠️ NotAvailable ──┐ │
│  │  07 09 14 22 … 77          ← LỆCH 1 số (số cuối)             │ │
│  │  nguồn không công bố checksum ⇒ không kiểm được               │ │
│  │                                       [Chọn nguồn này]       │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Máy đề xuất: vietlott-detail (authoritative + Passed)            │
│  ▸ Nhập tay (cần lý do)     ▸ Từ chối kỳ này                      │
│  Ghi chú: [____________________]        [Xác nhận & Verify]       │
└───────────────────────────────────────────────────────────────────┘
```

Bốn điều bắt buộc trong UI:

1. **Diff phải nổi bật ở mức từng số** — highlight đúng số lệch. Bắt người tự so 20 số bằng mắt là
   cách tạo lỗi verify.
2. **Hiện `IntrinsicState` kèm giải thích**, và phân biệt rõ `NotAvailable` với `Passed`. Người phải
   thấy được "nguồn này không tự chứng minh được" khác "nguồn này đã tự chứng minh".
3. **Hiện `role` + `trustWeight` tách nhau** — đúng như hai trục ở 03 §2, để người không tưởng
   trọng số cao nghĩa là được công bố.
4. **Bingo18: hiện cả thứ tự quay và dạng canonical.** Nếu chỉ hiện một dạng, người sẽ báo conflict
   giả cho `5,2,5` vs `2,5,5` (hoặc tệ hơn: verify sai thứ tự).

**Bàn phím trước chuột.** 280 kỳ/ngày ⇒ nếu backlog phải duyệt nhanh: `J`/`K` chuyển kỳ, `1`/`2` chọn
nguồn, `Enter` xác nhận, `Esc` bỏ. Có xác nhận cho hành động ghi.

Dùng `@megawin/ui` (shadcn) + SWR như các trang operations hiện có (`_lib/use-*.ts`). Không tự dựng
design system mới.

### RBAC gốc §3 (ĐÃ THAY THẾ bởi 07 — không dùng)

Bảng role Staff/Manager/Admin và action `…/publish` bên dưới **không còn áp dụng** — xem
`07-admin-management-page.plan.md` cho RBAC thật (toàn bộ Admin-only, không có `…/publish`).

### API cho MegaWin core PULL — mục 4 gốc (vẫn đúng, chi tiết hoá ở 08)

`GET /api/resultfeed/results?gameKey=&since=&size=`

- Auth bằng **API key riêng** (không session) — caller là worker, không phải người.
- Chỉ trả `publishedAt != null`, sắp tăng theo `publishedAt`, cursor-based.
- Trả: `gameKey`, `drawPeriod`, `drawDateSource`, `numbers` (**thứ tự công bố**), `payoutHash`,
  `state`, `publishedAt`.
- **Không** trả `drawId` — `resultfeed` không biết quy ước `drawId` của MegaWin (D7). Core tự map.

Core cần `payoutHash` để so với `DrawDoc` đang có **mà không phải so từng phần tử** — và vì
`payoutHash` là canonical, so sánh này miễn nhiễm với khác biệt thứ tự (Bingo18).

**Bổ sung ở 08:** endpoint này còn được `apps/backoffice` **tự gọi lại** (qua HTTP, URL/API key
config `.env`) để phục vụ tính năng tự điền form nhập kết quả — xem 08 §1 cho query mode
`drawPeriod` (single lookup) mới thêm.

### API public — làm sau (G7), nhưng chừa đường ngay (vẫn đúng, không đổi)

Không xây bây giờ. Chỉ **không tự chặn đường**:

- `apps/api-resultfeed` tách riêng, **không** nhét vào backoffice — khách ngoài không đi qua app nội bộ.
- Đọc qua `MONGODB_URI` chung (D3) — DB `megawin-resultfeed` tách tên/collection, tách cluster nếu
  sau này tải đọc khách ngoài cần cách ly khỏi OLTP game (thêm `mongoEnvKey` riêng lúc đó).
- Chỉ đọc `consensus` đã publish. Không bao giờ expose `submissions` (raw HTML của bên thứ ba —
  vấn đề bản quyền/ToS) hay `sources` (tiết lộ hạ tầng thu thập).
- Cần thêm khi làm: API key per khách, rate limit, versioning `/v1/`, và **rà ToS** trước khi bán lại
  dữ liệu nguồn.

⚠️ **Việc chưa quyết:** phân phối lại kết quả từ `vietlott.vn` cho bên thứ ba là câu hỏi **pháp lý**,
không phải kỹ thuật. Phải có kết luận trước G7 — kiến trúc không giải quyết được việc này.
