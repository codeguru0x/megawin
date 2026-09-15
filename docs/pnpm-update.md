# pnpm — Update dependency trong monorepo

Repo MegaWin dùng **pnpm workspace** (không dùng catalog). Mỗi package khai báo version riêng trong
`package.json`. Muốn nâng một dependency lên cùng một range ở **toàn monorepo**, dùng `pnpm update -r`.

## Update một package lên version cụ thể (khuyến nghị)

```bash
pnpm update -r vitest@^4.1.11
```

- `-r` / `--recursive`: chạy trên mọi workspace package (apps + packages + root).
- Ghi range vào `package.json` **và** cập nhật `pnpm-lock.yaml`.
- Chỉ đụng những package nào đang phụ thuộc `vitest`.

Tương đương:

```bash
pnpm -r up vitest@^4.1.11
```

## Update nhiều package cùng lúc

```bash
pnpm update -r vitest@^4.1.11 @vitest/coverage-v8@^4.1.11
```

## Chỉ một số workspace

```bash
# Chỉ apps + packages (bỏ root)
pnpm update -r --filter "./apps/**" --filter "./packages/**" vitest@^4.1.11

# Một package cụ thể
pnpm update --filter @megawin/backoffice vitest@^4.1.11
```

## Update lên latest trong range hiện có

Không đổi range trong `package.json`, chỉ kéo bản mới nhất thỏa `^` / `~` hiện tại:

```bash
pnpm update -r vitest
```

## Update lên latest (đổi range)

```bash
pnpm update -r --latest vitest
```

`--latest` có thể bump major — review diff `package.json` trước khi commit.

## Major bump (VD Vitest 4 → 5)

`pnpm update -r` chỉ đổi version — **không** thay breaking behavior. Với major:

1. Đọc [migration guide](https://vitest.dev/guide/migration/) của package đó.
2. Đồng bộ `peerDependencies` trong shared config (VD `@megawin/vitest-config`).
3. Smoke trước các package mock-heavy (`api-player`, `player-sdk`, `cache`, `backoffice`) rồi mới `pnpm test` toàn monorepo.
4. Không “vá” bằng tắt default mới toàn repo (VD `clearMocks: false`) trừ khi có lý do rõ.

## Sau khi update

1. Xem diff: `git diff -- package.json '**/package.json' pnpm-lock.yaml`
2. Chạy smoke: `pnpm check-types` / `pnpm test` theo phạm vi bị ảnh hưởng
3. Commit cả `package.json` đã đổi **và** `pnpm-lock.yaml`

## Lưu ý

| Việc | Không dùng |
|---|---|
| Sửa tay từng `package.json` rồi `pnpm install` | Chậm, dễ lệch range giữa các package |
| `npm update` / `yarn upgrade` | Sai package manager của repo (`packageManager`: pnpm) |
| Catalog (`pnpm-workspace.yaml` → `catalog:`) | Repo hiện **chưa** dùng |

Engine yêu cầu: Node `>=22.12.0`, pnpm `>=10` (xem root `package.json`).
