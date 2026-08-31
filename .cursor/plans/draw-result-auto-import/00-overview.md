# Draw Result Auto-Import — Overview

> ## 🔴 SUPERSEDED (31/08/2026) — ĐỌC PLAN MỚI: [`../drawfeed/`](../drawfeed/)
>
> Thư mục này **không còn là hướng thực thi**. Giữ lại để tra cứu lý do các quyết định cũ.
>
> | Quyết định cũ ở đây | Thay bằng | Vì sao |
> | --- | --- | --- |
> | Chrome extension MV3 (`p2-extension.plan.md`, 40KB) | **Bright Data Web Unlocker API** | Không cần máy chuyên dụng, không cần CRX self-hosted, không cần lo `cf_clearance`/nonce. Analysis §14.2–14.3 |
> | Proxy zone cho nguồn "không có Cloudflare" | **Chỉ Unlocker cho MỌI nguồn** | Site bật Cloudflare/CAPTCHA sau này không phải viết lại transport. drawfeed `00-overview.md` D1 |
> | `packages/result-collector` | **`packages/drawfeed`** | `result` va chạm với `DrawResultSource`/`draw_results` của core |
> | App Next.js riêng `apps/result-collector` | Vận hành **trong `apps/backoffice`**, DB vẫn tách | Cùng nhóm staff, cùng session — app riêng chỉ thêm auth surface |
> | Dedupe theo `sha256(raw)` vì extension không parse | `sha256` **vẫn dùng** để dedupe submission, nhưng nay có `(sourceId, gameKey, drawPeriod, parserVersion)` unique cho observation | Ta parse phía server nên biết mã kỳ |
> | Poll để phát hiện kỳ mới | **Dự đoán `id` tuần tự** (`lastConfirmedPeriod + 1`) | Tiết kiệm ~60% request và phát hiện được kỳ bị nhảy số. Analysis §13.4 |
>
> **Vẫn còn giá trị, đã mang sang plan mới:** MegaWin PULL (không PUSH), multi-source + so sánh chéo,
> shadow mode trước khi nối tiền, staff duyệt là chốt chặn cuối.


Hệ thống tự động thu thập kết quả xổ số (Keno, Bingo18) từ nhiều nguồn, đối chiếu chéo, cho staff duyệt hàng loạt, rồi cung cấp kết quả đã duyệt cho MegaWin PULL về publish.

## Bối cảnh

- Hôm nay MegaWin nhập kết quả 100% thủ công. Keno/Bingo18 nhịp nhanh (~120/~160 kỳ/ngày) → nhập tay rất khó, dễ trễ và sai.
- Vietlott sau Cloudflare, không có kênh chính thức, không mirror nào còn realtime.
- Nghiên cứu đầy đủ: [`.cursor/analysis/system-draw-result-auto-import.analysis.md`](../../analysis/system-draw-result-auto-import.analysis.md).

## Quyết định kiến trúc

- **Tách service riêng** trong cùng monorepo: `apps/result-collector` + `packages/result-collector[-application]`, DB/collection riêng, dùng chung hạ tầng (`next`, `auth`, `data`, `http-client`). KHÔNG nhúng vào backoffice.
- **MegaWin PULL:** worker/cron MegaWin gọi API service lấy kết quả đã duyệt rồi tự `PublishResultUseCase`. Service không biết nội bộ MegaWin.
- **Extension MV3 siêu mỏng:** chỉ vào trang + lấy raw + POST. Multi-source, config nguồn tải từ server → HTML đổi thì sửa server, không build lại extension.
- **Xác thực extension/MegaWin → service:** device/API key riêng.
- **Deploy extension:** Load unpacked 1 lần (P1) → Enterprise policy `ExtensionInstallForcelist` + self-hosted CRX (update từ xa). ⚠️ `--load-extension` **không dùng được** — đã bị xoá khỏi Chrome branded builds từ Chrome 137.
- **Dedupe ingest:** theo `sha256(raw)` do extension tính (`Idempotency-Key`), **không** theo `drawPeriodSource` — extension không parse nên không biết mã kỳ.

## Các plan trong thư mục

- [`p1-service.plan.md`](p1-service.plan.md) — Result Collector Service: ingest raw, parse + verify + so sánh chéo nguồn, trang duyệt batch, API kết quả đã duyệt, tích hợp MegaWin PULL.
- [`p2-extension.plan.md`](p2-extension.plan.md) — Chrome extension MV3 multi-source: thu thập raw, remote source config, self-heal CF, vận hành 100% tự động, cài file trực tiếp.

## Liên quan nhưng TÁCH RIÊNG (không thuộc chức năng lấy kết quả)

- [`../fix_drawno_server-side_caa66076.plan.md`](../fix_drawno_server-side_caa66076.plan.md) — Fix Bingo18 sinh `drawNo` phía server (giống Keno) + audit 7 game. Đây là bug độc lập trong MegaWin core, để ở root `.cursor/plans`.

## Thứ tự triển khai

0. **Bước 0 mở rộng (~45') — CHẶN TOÀN BỘ.** 5 phép đo: endpoint trả HTML có số, chạy được trong ISOLATED world, header `cf-mitigated`, hash ổn định (không nonce), TTL `cf_clearance`. Xem analysis §4.8.
1. Plan 1 (Service) — scaffold + ingest + `/api/source-config` + parse/verify + trang duyệt (P1 shadow mode, rủi ro 0).
2. Plan 2 (Extension) — thu thập raw từ Vietlott, rồi thêm nguồn 2/3 để bật so sánh chéo.
3. Nối MegaWin PULL, vẫn shadow, tới khi tin cậy mới bật auto-publish có ngưỡng exposure + kill-switch (P3).

Fix drawNo (root) độc lập, làm bất cứ lúc nào.
