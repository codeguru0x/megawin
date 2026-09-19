# P1-01 — Đơn giản hoá màu theo game (hero card, draw-action panel)

**Quyết định đã chốt ở** [`backoffice-lint-color-cleanup/00-overview.md`](../backoffice-lint-color-cleanup/00-overview.md)
§2.3: **GIỮ** màu game làm token nhận diện (badge, icon, chart, border) — **BỎ** lớp gradient
trang trí đa-tầng đa-hue (3-6 stop, mỗi stop 1 màu Tailwind palette khác nhau × light/dark) trên
hero/jackpot card và draw-action panel.

**Quyết định bổ sung (19/09/2026 — đã chốt với user):** thay vì phẳng hoàn toàn `bg-card`, dùng
**gradient mono-tone** (1 hue duy nhất, fade dần bằng opacity) tái sử dụng token `--game-*-muted`
**đã có sẵn** trong `globals.css` — không khai thêm CSS variable nào. Đây tận dụng đúng tính năng
Tailwind v4: mọi color khai trong `@theme` được tự sinh **toàn bộ họ utility** (`bg-*`, `text-*`,
`border-*`, và cả `from-*`/`via-*`/`to-*` gradient stop) — nên `from-game-mega645-muted/80` là
utility hợp lệ ngay bây giờ, không cần thêm gì vào `globals.css`.

## 1. Phạm vi

3 file `jackpot-overview-section.tsx` (chỉ game **có Jackpot**: mega645, power655, lotto535 —
theo `operations-page-ui.mdc` §1, 4 game còn lại không có Zone 2/Jackpot Hero Card) và 7 file
`create-draw-action.tsx` dưới
`apps/backoffice/src/app/(main)/games/<game>/operations/_lib/sections/draw-management/draw-actions/`.
Sau khi track an toàn (P0-04) đã swap phần khớp token — phần còn lại ở đây là những gradient/màu
**không** khớp token có sẵn (lệch opacity/stop) hoặc **có khớp nhưng chính là thứ cần đơn giản
hoá** (bản thân gradient 3-6 màu là vấn đề, không phải việc gọi đúng token).

## 2. Pattern thay thế (áp dụng đồng nhất 7 game)

```tsx
// TRƯỚC — gradient 3 stop riêng theo game, mỗi stop 1 hue Tailwind palette khác nhau,
// light+dark = 6 giá trị màu phải nhớ, không liên quan gì tới token --game-* đã khai
<div
  className={cn(
    "relative overflow-hidden rounded-2xl border-2 p-6",
    "bg-linear-to-br from-red-50/90 via-orange-50/70 to-amber-50/50",
    "dark:from-red-950/50 dark:via-orange-950/40 dark:to-amber-950/30",
    "border-red-300 dark:border-red-700/60",
  )}
>
  <IconIcon className="text-red-700/70 dark:text-red-400/60" />
  ...
</div>

// SAU — gradient mono-tone: 1 hue duy nhất (chính token brand color của game), fade qua
// opacity, KHÔNG cần thêm CSS variable nào (Tailwind v4 tự sinh from-*/to-* cho mọi color
// đã khai trong @theme — --color-game-mega645-muted đã tồn tại từ trước)
<div
  className={cn(
    "relative overflow-hidden rounded-2xl border p-6",
    "bg-linear-to-br", c.gradientMutedFrom, "to-transparent",
    c.twBorder + "/40",
  )}
>
  <div className={cn("inline-flex rounded-xl p-2", c.twBgMuted)}>
    <IconIcon className={c.twText} />
  </div>
  ...
</div>
```

Trong đó `c = GAME_COLORS[gameProduct]`. Field gradient MỚI cần trong `GameColorTokens` (thay
toàn bộ `gradientFrom/Via/To/*Dark` cũ — xoá 6 field, thêm 1 field):

```typescript
/** Gradient mono-tone (fade từ muted color về transparent), dùng cho hero/jackpot card. */
gradientMutedFrom: string; // VD: "from-game-mega645-muted/80" — KHÔNG cần biến thể riêng
                            // cho dark mode, vì --game-mega645-muted TỰ ĐỘNG đổi giá trị ở
                            // .dark (đã định nghĩa sẵn trong globals.css) — token,
                            // không phải literal, nên "kế thừa" dark mode miễn phí.
```

Đây là điểm khác biệt cốt lõi so với cách viết cũ: `from-teal-50/90` là **literal Tailwind
palette**, đứng yên bất kể light/dark (phải viết thêm dòng `dark:from-teal-950/50` riêng để đổi).
`from-game-mega645-muted/80` là **token custom property**, `--game-mega645-muted` tự đổi giá trị
giữa `:root` và `.dark` trong `globals.css` — 1 class duy nhất tự đúng ở cả 2 theme, không cần
khai `dark:` gì thêm.

**Với draw-action panel** (nút hành động chính của kỳ quay — "Mở bán", "Đóng bán", "Settle"):
tương tự, border/icon dùng accent game, nền panel dùng `bg-card`/`bg-muted` theo trạng thái hành
động (không theo game) — không cần gradient ở đây (panel hành động, không phải hero card).

## 3. Có cần thêm field mới vào `GameColorTokens`?

**Có, đúng 1 field** (`gradientMutedFrom`, xem mục 2) thay cho 6 field gradient cũ
(`gradientFrom/Via/To` + 3 biến thể dark) — đây là ĐƠN GIẢN HOÁ interface, không phải mở rộng.
Không cần khai thêm gì trong `globals.css` vì `--game-*-muted` đã tồn tại sẵn.

Nếu sau pattern trên vẫn cần 1 giá trị khác (VD viền nhấn đậm hơn `twBorder` cho trạng thái "cần
hành động gấp") — dùng token semantic có sẵn (`border-warning`, `border-destructive`) THEO Ý
NGHĨA TRẠNG THÁI, không phải thêm biến thể màu game mới.

## 4. Quy trình rollout (mỗi game riêng, có review ảnh)

Tách 2 nhánh vì phạm vi khác nhau (mục 1):

- **Jackpot hero card** — chỉ 3 game: Lotto535 → Mega645 → Power655.
- **Draw-action panel** — cả 7 game: Max3D → Max3DPro → Lotto535 → Mega645 → Power655 → Keno →
  Bingo18 (2 game cuối có baseline Ops Hub, làm sau cùng khi pattern đã ổn định qua 5 game trước).

Với mỗi game:
1. Chụp ảnh trang jackpot + operations hiện tại (viewport chuẩn, cả light/dark nếu áp dụng).
2. Áp pattern mục 2 cho `jackpot-overview-section.tsx` và `create-draw-action.tsx` của game đó.
3. Chụp ảnh lại, so sánh cạnh nhau, **trình user duyệt**.
4. Sau duyệt: `oxlint <file>` xác nhận giảm `no-raw-colors`, `prettier --write`.
5. Thêm/update Playwright screenshot spec cho page đó (nếu là page quan trọng theo §3 overview).
6. Merge, qua game tiếp theo — KHÔNG làm song song nhiều game (khó review, khó revert đúng phạm
   vi nếu 1 game bị lỗi).

## 5. Rủi ro cụ thể cần lưu ý

- Gradient mono-tone dùng opacity `/80` trên `-muted` token — cần verify contrast ở CẢ light/dark
  vì `--game-*-muted` dark (VD teal-950) đã tối sẵn, `/80` trên nền tối có thể làm card gần như
  đen thay vì "gradient nhẹ" như ý đồ. Nếu quá tối ở dark mode, thử opacity thấp hơn (`/40`-`/60`)
  — nhưng dùng CÙNG 1 con số opacity cho cả 7 game (không tự chọn số khác nhau mỗi game).
- Card nền gradient mono-tone nhạt có thể làm dashboard tổng hợp (nhiều game cạnh nhau) MẤT khả
  năng phân biệt nhanh nếu accent quá nhạt — kiểm tra riêng contrast của `twBgMuted`/`twText` khi
  đặt cạnh nhau ở dashboard, không chỉ xem từng page đơn lẻ.
- Dark mode: `twBgMuted` dark (VD `--game-mega645-muted` dark = teal-950) có thể quá tối để làm
  icon background nổi rõ — test riêng dark mode mỗi game, không suy từ light mode.
</contents>
