# Backoffice Visual Color/Style Redesign — Overview (TRACK RỦI RO — cần review ảnh)

> Track này **THAY ĐỔI PIXEL THẬT**. Không làm chung với
> [`backoffice-lint-color-cleanup/`](../backoffice-lint-color-cleanup/00-overview.md) (track an
> toàn) — chỉ bắt đầu track này sau khi track an toàn đã xong và merge, để diff review không bị
> nhiễu bởi các thay đổi không liên quan.

## 1. Nguyên tắc bắt buộc cho MỌI phase ở track này

1. **Một game / một nhóm màn hình một lần** — không sửa 7 game cùng lúc. Thứ tự đề xuất: bắt đầu
   game **không** có baseline ảnh nào (VD Max3D — rủi ro thấp nhất nếu sai vì không ai đang dựa
   vào snapshot), để lại Keno/Bingo18 (đã có `ops-hub-visual.spec.ts`) làm cuối cùng.
2. **Trước khi sửa mỗi page:** chụp ảnh hiện trạng (dùng `browser-use` subagent hoặc Playwright
   `page.screenshot()` thủ công) — lưu vào `/tmp` hoặc gửi cho user, KHÔNG cần commit vào repo.
3. **Sau khi sửa:** chụp lại đúng viewport/route, đặt 2 ảnh cạnh nhau, **hỏi user xác nhận** trước
   khi merge — không tự quyết "trông vẫn ổn".
4. **Mở rộng baseline visual test:** sau khi 1 game/nhóm được duyệt, thêm 1 spec Playwright
   screenshot mới cho page đó vào `apps/backoffice/test/e2e/` (theo pattern
   `ops-hub-visual.spec.ts`) — để lần sau có lưới an toàn, không lặp lại tình trạng "chỉ 2 game có
   baseline" như hiện tại.
5. **KHÔNG gộp fix màu + fix layout/spacing trong cùng 1 file/1 lần sửa** nếu 2 việc đó thuộc 2
   phase khác nhau dưới đây — mỗi phase review ảnh riêng, dễ khoanh vùng nếu có vấn đề.

## 2. Các phase (độc lập, làm theo thứ tự ưu tiên rủi ro thấp → cao)

| # | Phase | File | Status (2026-09-20) | Rủi ro |
|---|---|---|---|---|
| 1 | Đơn giản hoá màu theo game (hero card, draw-action panel) | [`p1-01`](p1-01-game-color-simplification.md) | **DONE** (`cbdd949c`) — mono-tone `gradientMutedFrom` | Trung bình |
| 2 | Hợp nhất màu status badge → token semantic | [`p1-02`](p1-02-status-badge-unification.md) | **DONE** (`9d2b7e13`) — `status-*` tokens + 17 call site | Trung bình |
| 3 | Non-typography arbitrary (border/ring/shadow/width...) | [`p1-03`](p1-03-typography-arbitrary-values.md) | **DONE** (`f22e6d8e`) — `no-arbitrary-values` = 0 | Thấp |
| 4 | `no-restyle` — spacing/typography override thật | [`p1-04`](p1-04-restyle-spacing-typography.md) | **PARTIAL** — 2a + contract xong (~−1494); leftover color raw / compact Button / effect cần review ảnh từng khu vực — **KHÔNG suppress hàng loạt** | Cao nhất |
| 5 | Hợp nhất hue heatmap → 1 scale chung | [`p1-05`](p1-05-heatmap-hue-unification.md) | **DONE** (branch `visual/p1-05-heatmap`) — financial-cool **blue** (+ indigo Lotto Special); kèm fix draw-selector + live-feed settled | Trung bình |

## 3. Định nghĩa "Definition of Done" cho toàn track (đã chốt với user 19/09/2026)

**KHÔNG dùng suppression làm đích đến.** Mục tiêu là đạt chuẩn UI thật qua sửa dần từng khu vực —
suppression (`oxlint-disable-next-line`) chỉ dùng cho trường hợp hiếm có lý do nghiệp vụ xác nhận
rõ ràng (theo `oxlint-lint-conventions.mdc` §d), **không** dùng như cách "đóng" 1 nhóm warning lớn
để coi là xong.

- Mỗi phase là 1 khu vực UI (1 game, 1 nhóm component, 1 loại token) — sửa **thật**, review ảnh,
  merge, rồi qua khu vực kế tiếp. Không giới hạn thời gian cứng — làm tới khi khu vực đó đạt chuẩn
  UI đồng nhất (dùng đúng token semantic, đúng thang typography, đúng contract `no-restyle`).
- Mỗi phase DONE khi: (a) khu vực đó hết warning liên quan MÀ KHÔNG dựa vào suppression diện rộng,
  (b) mọi page bị đổi đã được user duyệt ảnh trước/sau, (c) có Playwright screenshot spec mới bảo
  vệ page đó (nhóm màn hình quan trọng: dashboard, draws, jackpot, operations).
- Track VISUAL coi là DONE toàn bộ khi tất cả 5 phase (P1-01 → P1-05) đã đi qua từng khu vực theo
  đúng tinh thần trên — không có "khoanh vùng còn lại rồi suppress cho gọn".
  **Hiện trạng 20/09:** P1-01/02/03/05 DONE; P1-04 còn leftover ~758 `no-restyle` + phần lớn
  `no-raw-colors` (~4k) nằm ngoài scope 2a đã xong — mở slice mới khi chọn khu vực UI cụ thể.

## 4. Quy ước áp dụng cho mọi phase kể từ đây

- P1-02 (status badge): tiền đề "gom 17 file về 1 nơi" đã tách sang track AN TOÀN (P0-05) — phase
  này chỉ còn đổi giá trị màu, dùng cơ chế `useSemantic` per-game để giữ rollout tuần tự (§3 file
  chi tiết).
- P1-03 (arbitrary values): phần typography (`text-[11px]`/`text-[10px]`, ~578) đã **đảo quyết
  định cũ** — chuyển sang track AN TOÀN (P0-06) bằng named token `text-2xs`/`text-3xs` giữ đúng
  pixel, sau khi phát hiện xung đột với `operations-page-ui.mdc` (rule đã document T4/T5 là tier
  có chủ đích). File này giờ chỉ còn phần non-typography (border/ring/shadow), phạm vi nhỏ hơn
  nhiều so với ước tính ban đầu.
- P1-04 (`no-restyle`): ưu tiên tuyệt đối case 2a (xoá override thừa) và 2c (đổi UI thật, review
  ảnh) trước case 2b (suppress) — 2b chỉ áp dụng khi đã xác nhận rõ đây là exception nghiệp vụ
  thật, không phải "khó sửa nên để nguyên". Xem
  [`p1-04-restyle-spacing-typography.md`](p1-04-restyle-spacing-typography.md) §5.
</contents>
