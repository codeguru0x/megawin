# p2-02 — Mở rộng phạm vi + đưa vào CI

> **✅ Quyết định (18/09/2026):** **A trước** — E2E chỉ chạy local tay. **C (GitHub Actions) để
> các ngày sau** khi user nâng cấp. **B (pre-push) không chọn.**
>
> Phần A coi là **đã áp dụng** (script + quy ước local sẵn). Phần C + mở rộng phạm vi (§5) vẫn
> **chưa thi hành** — đợi ổn định + quyết định dựng CI.

Sau khi [p1-01](p1-01-ops-hub-e2e.plan.md) và [p1-02](p1-02-navigation-regression-e2e.plan.md) chạy
xanh ổn định **ít nhất 1 tuần trên máy local**, mới mở rộng phạm vi (§5) hoặc dựng CI (§3). Làm
sớm hơn = đưa test flaky vào gate, và hệ quả là cả team học cách bỏ qua CI đỏ.

---

## 1. Hiện trạng hạ tầng

```bash
$ ls .github/workflows/
# → không tồn tại. Không có .github/ nào cả.
```

Chỉ có Husky local:

| Hook | Nội dung |
|---|---|
| `.husky/pre-commit` | `pnpm exec lint-staged` |
| `.husky/post-commit` | `gitnexus` graph sync |

Root `package.json` có `"ci": "oxlint . && prettier --check ."` — chạy tay, **không** tự động.

Không thể "thêm E2E vào CI hiện có" — khi làm C phải **dựng CI từ đầu** (ảnh hưởng mọi PR).

## 2. Ba phương án — đã chọn A

| # | Phương án | Quyết định |
|---|---|---|
| **A** | **Chỉ local, chạy tay** (không CI) | ✅ **CHỌT — đang dùng** |
| **B** | `.husky/pre-push` | ❌ không chọn (E2E ~1–3 phút/push → dễ `--no-verify`) |
| **C** | GitHub Actions | 🅿️ **để sau** — user sẽ nâng cấp các ngày tới |

### 2.1 Phương án A — đã có gì / chạy thế nào

| Việc | Lệnh / chỗ |
|---|---|
| Chạy full suite | `pnpm --filter @megawin/backoffice test:e2e` |
| Update baseline (chỉ sau khi user xác nhận diff) | `pnpm --filter @megawin/backoffice test:e2e:update` |
| Mint session | `globalSetup` + `BETTER_AUTH_SECRET` từ env / 1 key `.env.local` ([p0-02](p0-02-auth-storage-state.plan.md)) |
| Guardrail agent | `.cursor/rules/e2e-baseline-and-flaky.mdc` ([p1-03](p1-03-review-workflow-and-guardrail.plan.md)) |
| Viewport cố định | `1920×1080` trong `playwright.config.ts` (ghi đè sau `Desktop Chrome`) |
| Baseline platform | PNG **gitignore** — chỉ local máy dev; `CI=true` skip visual |

**Không thêm hook tự động** ở bước A. Gate = kỷ luật chạy tay trước PR đụng UI/ops-hub.

## 3. Phương án C — phác thảo workflow (CHƯA thi hành — làm sau)

```yaml
# .github/workflows/e2e-backoffice.yml
name: E2E Backoffice
on:
  pull_request:
    paths:
      - "apps/backoffice/**"
      - "packages/ui/**"
      - ".github/workflows/e2e-backoffice.yml"

jobs:
  e2e:
    runs-on: ubuntu-latest
    # Image có sẵn browser + font khớp baseline (xem §4)
    container:
      image: mcr.microsoft.com/playwright:v1.63.0-noble
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @megawin/backoffice test:e2e
        env:
          # Cần cho globalSetup mint session cookie — xem p0-02 §3
          AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: apps/backoffice/playwright-report/
          retention-days: 14
```

**Chưa xác minh, phải kiểm trước khi dùng:**
- Version tag của Playwright image phải **khớp chính xác** version `@playwright/test` trong
  `package.json`, nếu không browser/lib lệch.
- `mcr.microsoft.com/playwright:v1.63.0-noble` có tồn tại hay không — kiểm bằng
  `docker manifest inspect` trước.
- Action version (`checkout@v5`, `setup-node@v5`) — kiểm major mới nhất lúc thi hành.

## 4. Vấn đề font/OS — **phải giải trước khi có bất kỳ CI nào**

Screenshot phụ thuộc font rendering của OS. Baseline chụp trên **macOS** sẽ lệch khi chạy trên
**Linux CI** — gần như 100% fail, không phải bug UI.

Ba cách xử, chọn 1:

| Cách | Làm gì | Đánh giá |
|---|---|---|
| **Sinh baseline trong Docker** | Chạy `test:e2e:update` bên trong đúng image CI dùng | ✅ Khuyến nghị. 1 nguồn chân lý duy nhất |
| Baseline theo platform | Playwright tự thêm suffix `-darwin`/`-linux` | ⚠️ Nhân đôi số baseline, phải maintain 2 bộ |
| Nới `maxDiffPixelRatio` | Nâng lên ~0.02 | ❌ Che luôn bug thật. KHÔNG làm |

Lệnh sinh baseline trong Docker (kiểm image tồn tại trước):

```bash
docker run --rm -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -lc "corepack enable && pnpm install --frozen-lockfile && \
            pnpm --filter @megawin/backoffice test:e2e:update"
```

Sau đó commit baseline `-linux`. Dev trên macOS sẽ **không** chạy được visual test local nữa (chỉ
chạy được behaviour test) — đây là đánh đổi thật, cần user biết trước khi chọn.

Cách tách để dev macOS vẫn dùng được:

```bash
# Chỉ chạy test hành vi (không screenshot) — chạy local mọi OS
pnpm --filter @megawin/backoffice test:e2e -g "hành vi"
```

## 5. Mở rộng phạm vi — thứ tự ưu tiên

Chỉ mở rộng khi tập hiện tại đã ổn định. Ưu tiên theo **thiệt hại nếu vỡ**, không theo dễ viết:

| Ưu tiên | Trang | Vì sao | Số baseline dự kiến |
|---|---|---|---|
| 1 | `/dashboard` | Trang đầu tiên mọi người thấy; có `draw-timeline` phụ thuộc thời gian → cần `page.clock` | 1–2 |
| 2 | `games/<game>/operations` (7 game) | Trang vận hành thật; **dùng generic component** → 1 lỗi vỡ cả 7 | 7 (dùng chung 1 spec, loop qua game) |
| 3 | `games/<game>/jackpot` (4 game có jackpot) | Hiển thị **số tiền** — sai là sự cố tài chính | 4 |
| 4 | `games/<game>/game-config` | Form dài, nhiều field; test hành vi giá trị hơn screenshot | 0 screenshot, ~5 behaviour |
| 5 | Empty state / error state của các trang trên | Bị bỏ quên nhiều nhất khi refactor | ~5 |

**Trần cứng: ≤ 40 baseline screenshot cho toàn bộ backoffice.** Vượt mức đó thì thời gian review
diff lớn hơn giá trị bắt bug, và người ta bắt đầu duyệt mù. Nếu cần phủ nhiều hơn: viết **behaviour
test** (không sinh baseline, không cần review ảnh).

Với 7 game dùng generic component: **1 spec loop qua danh sách game**, không copy 7 file.

## 6. Trước khi mở rộng — kiểm 3 điều

1. Tập `p1-01`/`p1-02` chạy `--repeat-each=5` **xanh hết**. Còn 1 test flaky → sửa flaky trước, cấm
   mở rộng (flaky nhân theo số spec).
2. Tổng thời gian `test:e2e` < 3 phút. Vượt → tách project (`behaviour` / `visual`) chạy song song.
3. Rule `e2e-baseline-and-flaky.mdc` ([p1-03](p1-03-review-workflow-and-guardrail.plan.md) §3) đã
   tồn tại và đã có người đọc — nếu không, mở rộng chỉ tạo thêm chỗ để agent tự update baseline.

## Verify

### A (đã chốt — checklist vận hành local)

- [x] Script `test:e2e` / `test:e2e:update` có trong `apps/backoffice/package.json`.
- [x] Rule `e2e-baseline-and-flaky.mdc` tồn tại; agent không tự `--update-snapshots`.
- [x] Suite admin chạy xanh trên máy local (viewport `1920×1080`, baseline `-darwin`).
- [ ] (tuỳ chọn trước khi mở rộng §5) `test:e2e --repeat-each=5` 3 lần, khác giờ trong ngày.

### C (khi user mở lại — chưa làm)

- [ ] Mở PR rỗng chỉ có workflow → CI chạy + upload artifact, **trước** `required check`.
- [ ] Chốt font/OS (§4) — khuyến nghị sinh baseline trong Docker image CI.
- [ ] Secret mint session (`BETTER_AUTH_SECRET` / `AUTH_SECRET`) vào GitHub Secrets.
- Đếm baseline sau mỗi lần mở rộng: `find apps/backoffice/test/e2e -name '*.png' | wc -l` ≤ 40 (§5).

## Không làm

- Không dựng GitHub Actions **ở lượt A** — để user làm C sau.
- Không thêm `.husky/pre-push` E2E (phương án B đã loại).
- Không đặt E2E làm **required check** ngay lần đầu C — chạy báo cáo vài PR trước.
- Không nới `maxDiffPixelRatio` để vượt vấn đề font (§4).
- Không copy spec cho từng game — loop qua danh sách (§5).
- Không thêm secret vào CI khi chưa chốt cách mint session ([p0-02](p0-02-auth-storage-state.plan.md)).
- Không dựng CI cho **riêng** E2E nếu đang có ý định dựng CI cho cả repo — làm 1 lần, đúng thứ tự.
