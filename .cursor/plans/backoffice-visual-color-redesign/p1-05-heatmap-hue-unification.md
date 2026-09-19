# P1-05 — Hợp nhất hue heatmap (Mega645/Power655/Lotto535/Keno) về 1 hue trung tính

## Status (2026-09-19) — DONE trên `visual/p1-05-heatmap`

Đã đổi `HEAT_BADGE_STYLES` (+ `HEAT_CELL_BG`) sang amber scale chung ở 4 file heatmap;
Lotto535 main+special cùng amber; cập nhật `operations-page-ui.mdc` §4. Brand selected/soft
vẫn giữ per-game hue (ngoài intensity scale).

**Đã chốt với user (19/09/2026):** đổi heatmap intensity scale từ per-game hue (teal cho Mega645,
red/orange cho Power655, amber cho Lotto535, sky/orange cho Keno) sang **1 hue chung duy nhất**
cho cả 4 game có heatmap — chấp nhận mất đặc trưng nhận diện game tại chính khu vực heatmap, đổi
lại nhất quán tuyệt đối.

## 1. Xung đột với rule hiện hành — PHẢI sửa cùng lúc, không chỉ sửa code

[`operations-page-ui.mdc`](../../rules/operations-page-ui.mdc) §4 hiện quy định:

> Badge: gradient từ `{game}-300` (cold) → `{game}-700` (warm) → `amber-500` (hot).
> Hot level: **amber cross-game** + `ring-2 ring-amber-300/50`.

Đây là rule **đang áp dụng** cho toàn bộ operations page — không chỉ code cần đổi, **rule `.mdc`
này cũng phải cập nhật trong cùng lần sửa**, nếu không lần code tiếp theo (người khác hoặc AI agent
sau) sẽ đọc rule cũ và viết lại đúng pattern per-game hue vừa bị xoá. Đây là điểm khác biệt quan
trọng của phase này so với P1-01 đến P1-04 — các phase đó không đụng tới rule đã publish.

## 2. Hue được chọn: Amber (đã là "hot" cross-game từ trước)

Giữ nguyên "hot = amber" đã có sẵn (cross-game, không đổi) — mở rộng amber ra **toàn bộ scale**
cold→hot, thay vì chỉ dùng ở mức hot. Lý do chọn amber (không phải màu khác): đã tồn tại vai trò
"điểm nhấn cường độ cao nhất" trong hệ thống, không tạo thêm 1 hue mới hoàn toàn lạ.

```typescript
// TRƯỚC (per-game, VD Mega645 — teal)
const HEAT_BADGE_STYLES: Record<HeatLevel, string> = {
  cold: "bg-teal-200/80 text-teal-900 dark:bg-teal-900/40 dark:text-teal-200",
  low: "bg-teal-300/80 text-teal-900 dark:bg-teal-800/50 dark:text-teal-200",
  mid: "bg-teal-500 text-white dark:bg-teal-600",
  warm: "bg-teal-700 text-white dark:bg-teal-500",
  hot: "bg-amber-500 text-white ring-2 ring-amber-300/50 dark:bg-amber-500",
};

// SAU (chung 1 hue amber cho cả 4 game — Mega645/Power655/Lotto535/Keno)
const HEAT_BADGE_STYLES: Record<HeatLevel, string> = {
  cold: "bg-amber-100/80 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  low: "bg-amber-200/80 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200",
  mid: "bg-amber-400 text-amber-950 dark:bg-amber-600 dark:text-white",
  warm: "bg-amber-600 text-white dark:bg-amber-500",
  hot: "bg-amber-500 text-white ring-2 ring-amber-300/50 dark:bg-amber-500",
};
```

**Lưu ý bắt buộc:** đọc đúng comment gốc `HEAT_BADGE_STYLES` của TỪNG game trước khi sửa (5 bậc,
contrast text sáng/tối khác nhau theo nền) — không copy máy móc 1 file rồi paste sang 4 file, vì
dark mode text color (`text-teal-900` vs `text-teal-200`...) phải tính lại đúng contrast cho amber
ở mỗi bậc, không phải suy từ file gốc của game khác.

## 3. Phạm vi cần sửa (4 file, mỗi game 1 file)

- `apps/backoffice/src/app/(main)/games/mega645/operations/_lib/sections/analytics/number-heatmap.tsx`
- `apps/backoffice/src/app/(main)/games/power655/operations/_lib/sections/analytics/number-heatmap.tsx`
- `apps/backoffice/src/app/(main)/games/lotto535/operations/_lib/sections/analytics/number-heatmap.tsx`
- `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/analytics/number-heatmap.tsx`

Mỗi file: đổi `HEAT_BADGE_STYLES` sang amber scale (mục 2) — **không đổi** `MEGA_HEX`/tương đương
(vẫn dùng cho các chỗ khác như icon header, giữ nguyên theo P1-01) và **không đổi** cấu trúc
`getHeatLevel()` (logic tính level giữ nguyên, chỉ đổi màu hiển thị).

## 4. Cell background tinting (mid/warm/hot) — cùng nguyên tắc

`operations-page-ui.mdc` §4 còn nhắc "Cell background: subtle tinting cho mid/warm/hot" — audit
riêng từng file xem tinting này viết ở đâu (có thể trong cùng file hoặc file cell riêng), đổi theo
cùng amber scale, đồng bộ với badge.

## 5. Cập nhật `operations-page-ui.mdc` (bắt buộc, cùng PR)

Sau khi code 4 file xong và được duyệt ảnh, sửa `operations-page-ui.mdc` §4:

```diff
- Badge: gradient từ `{game}-300` (cold) → `{game}-700` (warm) → `amber-500` (hot).
- Hot level: **amber cross-game** + `ring-2 ring-amber-300/50`.
+ Badge: gradient amber DUY NHẤT cho mọi game — `amber-100/80` (cold) → `amber-600` (warm) →
+ `amber-500` (hot), KHÔNG còn per-game hue (đã hợp nhất 19/09/2026, xem
+ `backoffice-visual-color-redesign/p1-05-heatmap-hue-unification.md`).
```

Nêu rõ trong PR description đây là thay đổi rule, không chỉ thay đổi code — để reviewer biết cần
đọc lại rule mới, không chỉ diff `.tsx`.

## 6. Quy trình rollout + review ảnh

Giống P1-03: bắt đầu từ **Keno** (mật độ cao nhất, 80 số) để verify contrast amber trên lưới dày
nhất trước, rồi lan sang Mega645/Power655/Lotto535.

1. Chụp ảnh heatmap Keno hiện tại (light + dark).
2. Đổi `HEAT_BADGE_STYLES` (+ cell tinting nếu có) sang amber scale.
3. Chụp lại, so sánh, **trình user duyệt** — đặc biệt kiểm tra: badge "hot" trước đây nổi bật vì
   amber tương phản với hue game khác (teal/red/sky) — khi cả scale đều amber, "hot" có còn NỔI
   RÕ so với "warm"/"mid" không (dùng `ring-2` để giữ phân biệt, nhưng verify bằng ảnh thật).
4. Sau duyệt Keno: áp cho Mega645/Power655/Lotto535.
5. Sửa `operations-page-ui.mdc` theo mục 5.
6. Cập nhật/thêm Playwright screenshot spec (Ops Hub Keno/Bingo18 sẵn có — verify heatmap nằm
   trong vùng chụp của `ops-hub-visual.spec.ts`, nếu có thì bước này tự động là regression test).

## 7. Rủi ro cụ thể

- Mất khả năng "nhìn màu biết game" khi xem heatmap — chấp nhận theo quyết định user, nhưng cần
  đảm bảo icon header (P1-01, vẫn giữ per-game) đủ để nhận diện game đang xem, vì heatmap không
  còn đóng vai trò đó.
- Contrast light/dark: amber ở mid-tone (`amber-400`/`amber-500`) có độ sáng cao — cần kiểm tra
  text màu tối (`text-amber-950`) đủ contrast trên nền `amber-400` theo WCAG, không chỉ nhìn "có
  vẻ ổn" trên màn hình 1 điều kiện sáng.
</contents>
