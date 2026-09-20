# Backoffice Oxlint/`@shadcn/lint` Cleanup — Overview

> Tạo 19/09/2026. Đo thật trên `apps/backoffice` bằng
> `./node_modules/.bin/oxlint apps/backoffice --format=unix` (không tin số liệu "done" cũ trong
> `.cursor/plans/oxlint-migration/p1-01-shadcn-lint-integration.plan.md` — plan đó ghi
> `no-raw-colors` còn ~14, đo lại thực tế là **~4045**, và `globals.css` **chưa có** `--warning`/
> `--info` như plan đó khẳng định đã thêm).

**Bối cảnh:** `frontend-dev.mdc` đã bị xoá. E2E/visual regression hiện chỉ che được **Ops Hub
Keno + Bingo18** (`apps/backoffice/test/e2e/ops-hub-visual.spec.ts`, baseline PNG local-only,
CI skip). Toàn bộ phần còn lại của backoffice (7 game × draws/config/jackpot/reports/operations)
**không có lưới an toàn pixel nào**. Vì vậy chia làm 2 track bắt buộc tách biệt:

| Track | Thư mục | Rủi ro lệch UI | Khi nào làm |
|---|---|---|---|
| **AN TOÀN** | [`backoffice-lint-color-cleanup/`](.) (plan này) | ~0 — mọi bước có bằng chứng output giữ nguyên | Làm ngay, không cần duyệt ảnh |
| **VISUAL** | [`backoffice-visual-color-redesign/`](../backoffice-visual-color-redesign/00-overview.md) | Thật — đổi màu/size nhìn thấy được | Làm sau, per-game, có review ảnh từng bước |

---

## 1. Đo hiện trạng (oxlint, 19/09/2026)

Exit code 0 (không có `error`, chỉ `warning`) — 8.481 warning, 0 chặn CI hiện tại.

| Rule | Số lượng | Loại |
|---|---:|---|
| `shadcn(no-raw-colors)` | 4045 | Màu |
| `shadcn(no-restyle)` | 2039 | Style/spacing/typography override |
| `shadcn(no-arbitrary-values)` | 648 | Chủ yếu `text-[11px]`/`text-[10px]` (~578) |
| `typescript(no-unnecessary-condition)` | 560 | **Không liên quan UI** |
| `shadcn(no-inline-styles)` | 288 | `style={{...}}` |
| `typescript(no-non-null-assertion)` | 206 | **Không liên quan UI** |
| `react(no-array-index-key)` | 178 | **Không liên quan UI** (đúng ra là bug key, không phải style) |
| `typescript(no-explicit-any)` | 128 | **Không liên quan UI** |
| `shadcn(require-static-classes)` | 86 | Cấu trúc code, output không đổi nếu làm đúng |
| `react(refs)` / `react(set-state-in-effect)` / `react(incompatible-library)` / `react(static-components)` | 164 | **Không liên quan UI** (logic/perf bug) |
| `typescript(no-floating-promises)` | 55 | **Không liên quan UI** |
| `typescript(no-base-to-string)` | 33 | **Không liên quan UI** |
| `react-hooks(exhaustive-deps)` | 26 | **Không liên quan UI** |
| Còn lại (require-array-sort-compare, purity, unbound-method, …) | ~24 | **Không liên quan UI** |

→ **~1.370 warning (TypeScript/React) hoàn toàn không đụng pixel** — đây là nhóm ưu tiên #1 theo
đúng yêu cầu "sửa những gì không ảnh hưởng UI trước".

→ Trong ~7.111 warning còn lại (shadcn), chỉ một phần thực sự "an toàn" — chi tiết §3.

---

## 2. Nghiên cứu: có nên bỏ màu riêng theo game không?

### 2.1 Bằng chứng: màu theo game đang được dùng ĐÚNG chỗ ở đâu

Grep `getGameHex|getGameColors|GAME_COLORS` → 39 file. Trong đó có các chỗ dùng **có giá trị
thật** — phân biệt nhiều game cùng lúc trên 1 view:

- [`dashboard/_components/jackpot-pools.tsx`](../../../apps/backoffice/src/app/(main)/dashboard/_components/jackpot-pools.tsx) —
  card jackpot Mega645/Power655/Lotto535 xếp cạnh nhau, màu giúp phân biệt ngay không cần đọc label.
- [`dashboard/_components/game-performance.tsx`](../../../apps/backoffice/src/app/(main)/dashboard/_components/game-performance.tsx),
  `draw-timeline.tsx`, `reports/settle/_lib/tabs/by-game.tsx` — chart/bar nhiều game, màu là
  **series key** để đọc chart, không phải trang trí.
- [`components/game-badge.tsx`](../../../apps/backoffice/src/components/game-badge.tsx) — badge
  tên game trong list/table (VD outstanding cross-game), 12 dòng code, đã dùng đúng
  `getGameColors()` (twBgMuted/twText/twBorder) — đây là hình mẫu ĐÚNG, không phải vấn đề.

**Kết luận nghiên cứu:** màu theo game **có giá trị chức năng thật** ở các view gộp nhiều game
(dashboard, reports tổng, badge cross-game). Xoá hẳn để dùng 1 màu trung tính sẽ làm mất khả năng
phân biệt nhanh ở đúng những chỗ cần nó nhất.

### 2.2 Bằng chứng: nguồn phức tạp THẬT không phải "có màu theo game", mà là DUPLICATE thủ công

`game-colors.ts` **đã là single source of truth** (đúng theo `code-quality-standards.mdc` §5) —
đây không phải vấn đề. Vấn đề là nhiều component **không dùng nó**, tự chép lại y nguyên giá trị:

- [`power655/jackpot/_lib/jackpot-overview-section.tsx`](../../../apps/backoffice/src/app/(main)/games/power655/jackpot/_lib/jackpot-overview-section.tsx)
  dòng 50-52 hardcode `"bg-linear-to-br from-red-50/90 via-orange-50/70 to-amber-50/50"` +
  `"dark:from-red-950/50 dark:via-orange-950/40 dark:to-amber-950/30"` — **trùng khớp byte-for-byte**
  với `GAME_COLORS[Power655].gradientFrom/gradientVia/gradientTo/gradientFromDark/...` đã định nghĩa
  sẵn trong `game-colors.ts`. Cùng pattern lặp lại ở `lotto535` và `mega645` jackpot-overview-section.
- 7 file `create-draw-action.tsx` (mỗi game 1 file, dưới `operations/_lib/sections/draw-management/
  draw-actions/`) đều tự viết lại gradient/border/text theo game — không gọi `getGameColors()`.
- **Status badge lặp lại độc lập theo game** — bằng chứng rõ nhất: `components/games/{game}/
  ticket-status-badge.tsx` tồn tại **7 lần** (mega645, power655, lotto535, keno, max3d, max3dpro,
  bingo18), mỗi file tự định nghĩa `STATUS_MAP: Record<string, {label, className}>` với raw
  Tailwind riêng. Cùng khái niệm "Hoàn tất" nhưng **label lệch nhau** giữa game
  (max3d: "Đang hoạt động"/"Chờ xử lý"; mega645: "Đã thanh toán"/"Nháp") — tức đây không chỉ là
  trùng màu, mà là **7 bản cùng logic phân rã dần theo thời gian, không đồng bộ**. Tương tự cho
  `draw-status-badge.tsx` (7 file) và `entry-status-badge.tsx` (7 file) = **21 file** riêng cho
  đúng 3 khái niệm status.

**Đây mới là "phức tạp hoá hệ thống" theo đúng nghĩa user nói** — không phải việc Power655 có màu
đỏ còn Mega645 có màu xanh ngọc, mà là **1 khái niệm (trạng thái vé/kỳ quay) bị viết lại 7 lần**,
mỗi lần chọn màu/label hơi khác, không ai còn nhớ bản nào là "chuẩn".

### 2.3 Quyết định (áp dụng cho track VISUAL — không đổi gì ở track AN TOÀN này)

**GIỮ** `game-*` làm token nhận diện (đã centralize, có giá trị thật ở view cross-game) —
**KHÔNG** thay bằng 1 màu trung tính xuyên suốt. Nhưng **THU HẸP phạm vi dùng**:

1. Màu game **chỉ** còn dùng ở: badge tên game, icon/border header trang game, chart series key,
   card jackpot cross-game. **KHÔNG** dùng để tô nền gradient trang trí đa-tầng (3-6 stop màu ×
   light/dark) cho hero card / panel riêng từng game — đây là lớp trang trí không mang thông tin,
   chỉ tạo 7 phiên bản CSS khác nhau cho cùng 1 loại card.
2. Hero/jackpot card đổi sang: nền `bg-card` trung tính (đồng nhất 7 game) + 1 điểm accent duy nhất
   (icon nền `bg-game-*-muted`, border `border-game-*`) — dùng token có sẵn, không raw class.
3. Semantic status (thắng/thua/cảnh báo/info) **tuyệt đối không** dùng màu game — chỉ dùng
   `profit`/`loss`/`warning`/`info`/`destructive`. Đây đã đúng ở phần lớn code (`text-profit`,
   `text-loss` đã xuất hiện nhiều nơi) — track AN TOÀN sẽ nhân rộng pattern này ở chỗ còn raw.
4. `DrawStatusBadge`/`TicketStatusBadge`/`EntryStatusBadge`: hợp nhất **màu** (theo tone chuẩn:
   xanh=tích cực, đỏ=huỷ/lỗi, vàng/cam=chờ/cảnh báo, xám=trung lập, xanh dương=info) vào 1 bảng
   tone dùng chung — **giữ nguyên** label + status key của từng game (không đổi nghiệp vụ). Việc
   tone dùng chung — **giữ nguyên** label + status key của từng game (không đổi nghiệp vụ). Phần
   centralize (gom 17 file về 1 nơi, giữ đúng literal) đã tách sang track AN TOÀN
   ([`p0-05-status-badge-tone-centralize.md`](p0-05-status-badge-tone-centralize.md)) — chỉ phần
   ĐỔI SANG token opacity mới thuộc track VISUAL (đổi pixel thật), xem
   [`p1-02-status-badge-unification.md`](../backoffice-visual-color-redesign/p1-02-status-badge-unification.md).

---

## 3. Track AN TOÀN — thứ tự thực hiện (không đổi pixel)

Nguyên tắc chọn vào track này: **mọi thay đổi phải có bằng chứng output y nguyên** (literal-for-
literal, hoặc hoàn toàn không liên quan render). Nếu không chứng minh được → đẩy sang track VISUAL.

| # | Việc | File plan | Ảnh hưởng pixel |
|---|---|---|---|
| 1 | TypeScript/React warnings (~1.370) | [`p0-01-typescript-react-warnings.md`](p0-01-typescript-react-warnings.md) | Không (logic/type only) — **ƯU TIÊN TIẾP (20/09):** `no-floating-promises` đã 0; còn ~1.275. Visual track tạm dừng. |
| 2 | Thêm token `--warning`/`--info` vào `globals.css` | [`p0-02-token-additions.md`](p0-02-token-additions.md) | Không (thuần additive, chưa ai dùng) |
| 3 | `no-inline-styles` (~288) — chuyển `style={{...}}` sang CSS custom property/class | [`p0-03-inline-styles-and-static-classes.md`](p0-03-inline-styles-and-static-classes.md) | Không (computed style giữ nguyên) |
| 4 | `require-static-classes` (~86) — className động → tĩnh | [`p0-03-inline-styles-and-static-classes.md`](p0-03-inline-styles-and-static-classes.md) §2 | Không (cùng class cuối cùng) |
| 5 | Audit + swap gradient/màu hardcode trùng khớp `game-colors.ts` | [`p0-04-gradient-token-swap-audit.md`](p0-04-gradient-token-swap-audit.md) | Không (byte-identical literal → token) |
| 6 | Centralize literal màu status badge (17 file → 1 file, DRY thuần) | [`p0-05-status-badge-tone-centralize.md`](p0-05-status-badge-tone-centralize.md) | Không (giữ đúng literal cũ) |
| 7 | `text-[11px]`/`text-[10px]` → named token `text-2xs`/`text-3xs` (~578, hầu hết `no-arbitrary-values`) | [`p0-06-typography-named-tokens.md`](p0-06-typography-named-tokens.md) | Không (giữ đúng pixel 11px/10px, chỉ đổi cú pháp) |

**Kết quả kỳ vọng sau track này:** giảm `no-raw-colors` xuống còn phần thực sự cần đổi màu
(status badge → token semantic, KPI icon, hero card) — số còn lại được liệt kê rõ trong
[`backoffice-visual-color-redesign/00-overview.md`](../backoffice-visual-color-redesign/00-overview.md).
Giảm `no-inline-styles` → ~0, `require-static-classes` → ~0. TS/React warnings → 0.
`no-arbitrary-values` → chỉ còn phần non-typography (border/ring/shadow, nhỏ). `no-restyle` giữ
nguyên, tách hết sang track VISUAL.

## 3b. Tiến độ thực thi (branch `chore/backoffice-lint-color-cleanup`, 19/09/2026)

| Commit | Phase | Nội dung |
|---|---|---|
| `cb1c22cd` | P0-02 | Thêm `--warning` / `--info` vào `globals.css` (additive) |
| `69c11e21` | P0-04 | Swap gradient jackpot hero Mega645/Power655/Lotto535 → `GAME_COLORS` (byte-identical) |
| `a947d859` | P0-01 + P0-03 | `no-floating-promises` → 0; bulk `style={{…}}` → CSS custom property |
| `9b438b4c` | P0-03 | Status-badge `cn()` literal tĩnh + tiếp CSS var |
| `678381df` | P0-03 | ai-panel / shimmer / layout-controls CSS vars |
| `29959920` | P0-06 | `text-[11px]`/`text-[10px]` → `text-2xs`/`text-3xs` (đúng 11px/10px) |
| `743325c2` | P0-05 | Centralize status-badge tones (`status-badge-tone.ts`) |

**Đo sau P0-05/P0-06 (oxlint unix):** `no-arbitrary-values` ~715→**137** (hết `text-[11px]`/`text-[10px]`) ·
`no-raw-colors` ~4507→**4027** · `require-static-classes` ~69→**86** (dùng `config.className` —
cảnh báo tĩnh tăng, pixel không đổi) · `no-inline-styles` **81**.

**Restore:** `git revert <commit>` từng bước, hoặc `git checkout <parent> -- <paths>` nếu chỉ
1 UI hỏng. Base trước track: parent của `cb1c22cd`.

**E2E Ops Hub:** tắt `next dev` đang lock project rồi
`pnpm --filter @megawin/backoffice test:e2e` để xác nhận screenshot không lệch.

---

## 4. Checklist chung mỗi bước (áp dụng mọi phase track này)

- [ ] Trước khi sửa file: `git diff` sau khi sửa phải chỉ đổi **string constant / cấu trúc code**,
      không đổi bất kỳ số/token màu nào chưa được verify literal-for-literal ở bước audit.
- [ ] Sau mỗi nhóm file (10-20 file): `oxlint <paths>` xem đúng warning đã hết, không sinh warning
      mới.
- [ ] `prettier --write <paths>` theo `oxlint-lint-conventions.mdc` §g.
- [ ] KHÔNG chạy `pnpm --filter @megawin/backoffice test:e2e:update` ở track này — track này không
      được phép đổi baseline vì không được phép đổi pixel.
- [ ] Cuối track: chạy `pnpm --filter @megawin/backoffice test:e2e` (Ops Hub Keno/Bingo18) — PHẢI
      xanh nguyên trạng, không có screenshot diff nào (nếu có diff = đã lỡ đổi pixel, dừng và xem
      lại bước nào vi phạm).
</contents>
