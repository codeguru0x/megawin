# P0-02 — `ts-node` → `tsx` (script `generate:presets`)

> Nguồn: [`00-overview.md`](00-overview.md) §1. Độc lập hoàn toàn — không phụ thuộc và không chặn
> phase nào khác trong migration này.

## Bằng chứng đã verify

`rg "ts-node" -g '!node_modules'` toàn repo → **đúng 1 nơi duy nhất**:
[`apps/backoffice/package.json`](../../../apps/backoffice/package.json):

```json
"generate:presets": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' src/scripts/generate-theme-presets.ts",
...
"ts-node": "^10.9.2",
"tsx": "^4.23.13",
```

`tsx@^4.23.13` **đã có sẵn** trong devDependencies — không cần cài thêm.

## Việc cần làm

### 1. Đọc script để hiểu output trước khi đổi

```bash
cat apps/backoffice/src/scripts/generate-theme-presets.ts
```

Xác nhận script này ghi ra file gì (theme presets JSON/TS), để biết cách diff output ở bước verify.

### 2. Chạy bằng `ts-node` (baseline), lưu output để so sánh

```bash
cd apps/backoffice
pnpm generate:presets
git diff --stat   # xem file nào bị thay đổi/ghi ra
git stash          # tạm lưu output baseline để so sánh, hoặc copy file ra /tmp
```

Nếu output là file được commit (không phải file tạm/gitignore), dùng `git diff` trực tiếp là đủ để
so sánh baseline vs sau khi đổi tool — không cần copy ra ngoài.

### 3. Đổi script trong `package.json`

```json
"generate:presets": "tsx src/scripts/generate-theme-presets.ts",
```

Xoá `"ts-node": "^10.9.2"` khỏi `devDependencies`.

### 4. Chạy lại bằng `tsx`, diff với baseline

```bash
pnpm generate:presets
git diff   # phải KHÔNG có thay đổi nội dung file output so với baseline (bước 2)
```

**Điểm cần chú ý kỹ:** cờ `--compiler-options '{"module":"CommonJS"}'` của `ts-node` không có tương
đương trực tiếp ở `tsx` (tsx dùng esbuild transform từng file, không đọc `--compiler-options` theo
cách này). Nếu script `generate-theme-presets.ts` có logic phụ thuộc vào module format lúc runtime
(ví dụ `require()` động, `__dirname`, `module.exports` thay `export default`), file này có thể chạy
khác hành vi dưới `tsx`. Đọc kỹ nội dung script ở bước 1 để xác nhận trước khi coi diff rỗng là đủ.

### 5. `pnpm install` để cập nhật lockfile sau khi xoá `ts-node`

```bash
pnpm install
```

## Verify hoàn tất

- [x] `apps/backoffice/package.json`: script đổi thành `tsx ...`, `ts-node` đã xoá khỏi
      devDependencies.
- [x] `pnpm --filter @megawin/backoffice generate:presets` chạy thành công, output file **giống
      byte-for-byte** với bản committed (MD5 `5c45bbe68c7c84e9b04cf59d681f1d77`). Baseline `ts-node`
      không chạy được với TS7 (`Cannot read properties of undefined (reading 'fileExists')`) — đây
      chính là lý do cần migrate.
- [x] `rg "ts-node"` toàn repo → 0 kết quả ngoài file `.plan.md` / `pnpm-lock` lịch sử.
- [x] `pnpm-lock.yaml` đã cập nhật (đã gỡ `ts-node`).

## Rollback nếu output khác biệt

```bash
git checkout -- apps/backoffice/package.json pnpm-lock.yaml
pnpm install
```
