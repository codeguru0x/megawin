# DrawFeed — Backoffice & API

Vận hành nằm trong `apps/backoffice` (không dựng app riêng): người dùng là **cùng một nhóm staff**,
cùng session, cùng RBAC. Dựng app riêng chỉ để có menu riêng là thêm một auth surface, một deploy,
một domain — không đổi lại gì. Nhưng **domain/DB thì tách hẳn** (D3) nên tách khi cần chỉ là chuyển
thư mục route, không phải bóc nghiệp vụ.

## 1. Cấu trúc

```
apps/backoffice/src/app/
├── (main)/drawfeed/                     ← MENU RIÊNG, không nằm trong games/
│   ├── page.tsx                         ← Dashboard: kỳ chờ duyệt, sức khoẻ nguồn
│   ├── review/                          ← ⭐ Hàng đợi duyệt — trang quan trọng nhất
│   │   ├── page.tsx
│   │   └── _lib/
│   ├── periods/                         ← Tra cứu 1 kỳ: mọi nguồn nói gì
│   ├── sources/                         ← Quản lý nguồn: role, trustWeight, enable
│   └── submissions/                     ← Log thô: xem HTML gốc, chi phí
└── api/drawfeed/
    ├── consensus/{route.ts, [gameKey]/[drawPeriod]/route.ts}
    ├── consensus/[gameKey]/[drawPeriod]/verify/route.ts
    ├── consensus/[gameKey]/[drawPeriod]/publish/route.ts
    ├── observations/route.ts
    ├── submissions/{route.ts, [id]/raw/route.ts}
    ├── sources/{route.ts, [sourceId]/route.ts}
    ├── health/route.ts
    └── results/route.ts                 ← MegaWin core PULL (API key, không session)
```

Đặt ở `(main)/drawfeed/` **không** phải `(main)/games/drawfeed/`: nó không phải một game, và để trong
`games/` sẽ ngầm gợi ý nó dùng chung khái niệm draw với các game — điều mà D7 cấm.

## 2. Trang `review` — thiết kế quanh câu hỏi thật của người duyệt

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

## 3. API nội bộ

Tuân thủ `mongodb.mdc` §4 (route → use-case, **không** gọi repo) và bound instance `withApi` sẵn có
(`apps/backoffice/src/lib/api.ts`).

```typescript
// apps/backoffice/src/app/api/drawfeed/consensus/[gameKey]/[drawPeriod]/verify/route.ts
import { VerifyConsensusUseCase } from "@megawin/drawfeed-application/use-cases/consensus";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { verifyConsensusSchema } from "../../../_lib/schema";

const verifyConsensusUseCase = new VerifyConsensusUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(verifyConsensusSchema)
  .handler(async ({ body, params, session }) => {
    return verifyConsensusUseCase.run({
      gameKey: params.gameKey,
      drawPeriod: params.drawPeriod,
      chosenObservationId: body.chosenObservationId,
      manualNumbers: body.manualNumbers,
      note: body.note,
      accountId: session.accountId,
      username: session.username,
    });
  });
```

| Route | Method | Role | Việc |
| --- | --- | --- | --- |
| `/consensus` | GET | Staff | List có filter `state`/`gameKey`, cursor page |
| `/consensus/[gameKey]/[drawPeriod]` | GET | Staff | Chi tiết + **toàn bộ observations** của kỳ |
| `…/verify` | POST | Staff | Human verify (03 §5) |
| `…/publish` | POST | **Manager** | Publish — quyền cao hơn verify |
| `/observations` | GET | Staff | Tra cứu theo nguồn/kỳ |
| `/submissions` | GET | Staff | Log fetch + chi phí |
| `/submissions/[id]/raw` | GET | **Admin** | Gunzip trả HTML gốc |
| `/sources` | GET · POST | Staff · **Admin** | Đọc · sửa `role`/`trustWeight`/`isEnabled` |
| `/health` | GET | Staff | Sức khoẻ nguồn, backlog, chi phí hôm nay |

Ba điểm về quyền:

- **`publish` cao hơn `verify`**: verify là "đọc và xác nhận dữ liệu"; publish là "cho phép tiền chảy
  theo dữ liệu này". Hai mức rủi ro khác nhau.
- **`sources` POST cần Admin**: đổi `role` của một nguồn là đổi *nguồn nào được công bố* — quyết định
  chính danh, không phải tinh chỉnh vận hành.
- **`/raw` cần Admin**: trả nguyên văn HTML của bên thứ ba; giới hạn để tránh thành proxy đọc web tuỳ ý.

Zod schema đặt ở `app/api/drawfeed/_lib/schema.ts`. Use-case **không** validate lại thứ Zod đã chặn
(`code-quality-standards.mdc` §8) — trừ ràng buộc phụ thuộc DB (kỳ tồn tại, `state` cho phép sửa).

## 4. API cho MegaWin core PULL

`GET /api/drawfeed/results?gameKey=&since=&size=`

- Auth bằng **API key riêng** (không session) — caller là worker, không phải người.
- Chỉ trả `publishedAt != null`, sắp tăng theo `publishedAt`, cursor-based.
- Trả: `gameKey`, `drawPeriod`, `drawDateSource`, `numbers` (**thứ tự công bố**), `payoutHash`,
  `state`, `publishedAt`.
- **Không** trả `drawId` — `drawfeed` không biết quy ước `drawId` của MegaWin (D7). Core tự map.

Core cần `payoutHash` để so với `DrawDoc` đang có **mà không phải so từng phần tử** — và vì
`payoutHash` là canonical, so sánh này miễn nhiễm với khác biệt thứ tự (Bingo18).

## 5. API public — làm sau (G7), nhưng chừa đường ngay

Không xây bây giờ. Chỉ **không tự chặn đường**:

- `apps/drawfeed-api` tách riêng, **không** nhét vào backoffice — khách ngoài không đi qua app nội bộ.
- Đọc qua `DRAWFEED_MONGODB_URI`, tách cluster được (D3) ⇒ tải khách ngoài không chạm OLTP game.
- Chỉ đọc `consensus` đã publish. Không bao giờ expose `submissions` (raw HTML của bên thứ ba —
  vấn đề bản quyền/ToS) hay `sources` (tiết lộ hạ tầng thu thập).
- Cần thêm khi làm: API key per khách, rate limit, versioning `/v1/`, và **rà ToS** trước khi bán lại
  dữ liệu nguồn.

⚠️ **Việc chưa quyết:** phân phối lại kết quả từ `vietlott.vn` cho bên thứ ba là câu hỏi **pháp lý**,
không phải kỹ thuật. Phải có kết luận trước G7 — kiến trúc không giải quyết được việc này.

## 6. Checklist

- [ ] Route `(main)/drawfeed/`, **không** trong `games/`.
- [ ] Mọi route qua `withApi` bound instance của backoffice; **không** gọi repo trực tiếp.
- [ ] `publish` yêu cầu quyền cao hơn `verify`; `sources` POST + `/raw` yêu cầu Admin.
- [ ] Trang review: highlight diff **từng số**, hiện `IntrinsicState`, tách `role` vs `trustWeight`.
- [ ] Bingo18 hiện **cả** thứ tự quay và canonical.
- [ ] Có keyboard shortcut cho hàng đợi duyệt.
- [ ] `/results` không trả `drawId`; có `payoutHash`.
- [ ] `/results` chỉ trả bản đã publish (index `partialFilterExpression` đã có — 01 §5).
- [ ] Backoffice có `DRAWFEED_MONGODB_URI` trong `.env.example` (**không** tạo/ghi `.env*`).
