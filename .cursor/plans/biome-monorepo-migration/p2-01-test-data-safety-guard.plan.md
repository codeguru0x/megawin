# p2-01 — GritQL guard: cấm lệnh xoá/sửa DB không-scope trong test

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md).
> Chỉ làm SAU khi P0/P1 của Biome migration đã xong (root `biome.json` tồn tại + `plugins` khả dụng).
> Nguồn gốc: tách ra từ kế hoạch test-setup (`.cursor/plans/monorepo-test-setup/`) — enforce Cursor
> rule `.cursor/rules/test-data-safety.mdc` ở tầng lint/CI.

## Mục tiêu

Chốt chặn TĨNH ở lint/CI cho quy tắc "không xoá/sửa dữ liệu không do test sinh ra". Đây là lớp thứ
2 trong mô hình 3 lớp phòng thủ (đặc biệt quan trọng vì DB test = staging chung):

```mermaid
flowchart LR
  ai["Cursor rule test-data-safety.mdc (luc viet code)"] --> tinh[Tinh]
  lint["Biome GritQL (luc lint / CI) - PLAN NAY"] --> tinh
  guard["db-guard runtime (luc chay test)"] --> dong[Dong]
```

- Cursor rule: ngăn AI/người sinh code sai từ đầu (đã có).
- Biome GritQL (plan này): chặn khi lint/CI kể cả code viết tay không đọc rule.
- db-guard runtime (`@megawin/vitest-config/setup-db-guard`): chốt cuối lúc chạy, chặn cả filter
  build động thành `{}`.

## Phụ thuộc

- Cần `p0-01-root-biome-config` (root `biome.json` với field `plugins`).
- GritQL plugin của Biome 2.5.x — xác minh cú pháp theo docs bản đang dùng.

## Pattern cần bắt (chỉ trong file test)

Scope: `**/*.test.ts`, `**/*.test.tsx`, `**/test/**/*.ts`, `**/test/**/*.tsx`.

- `deleteMany({})`, `deleteMany()`
- `deleteOne({})`
- `updateMany({}, ...)`, `updateOne({}, ...)` (đối số filter rỗng)
- `findOneAndDelete({})`, `findOneAndUpdate({}, ...)`
- `drop()`, `dropDatabase()`, `dropCollection(...)`

## Kế hoạch thực thi

1. Tạo plugin GritQL, VD `tooling/biome-plugins/no-unscoped-db-mutation.grit`:

```grit
`$coll.deleteMany($args)` where {
  $args <: contains `{}`
}
```

   (Cú pháp trên là phác thảo — cần kiểm chứng GritQL match call-expression với empty-object
   argument theo docs Biome. Bổ sung các mẫu cho `updateMany`/`drop`/`deleteOne`.)

2. Wire plugin vào root `biome.json` field `plugins`, dùng `overrides[].includes` giới hạn glob
   test để không ảnh hưởng source thật (source layer CÓ QUYỀN dùng các lệnh này hợp pháp).

3. Severity `error` → CI đỏ khi vi phạm.

4. Chạy thử trên toàn repo: đảm bảo 0 false-positive ở source, bắt đúng nếu cố tình thêm
   `deleteMany({})` vào 1 file test scratch.

## Acceptance criteria

- [x] Plugin bắt đúng anti-pattern trong `*.test.ts`, KHÔNG bắt ở source layer. **Đã verify** (ma trận dưới).
- [~] Wire vào CI (`biome ci`) theo `p1-02-ci-and-git-hooks` — **HOÃN** cùng Phần 2 p1-02 (GitHub Actions chưa setup). Nhưng plugin ĐÃ active qua `pnpm lint`/`biome check` + pre-commit hook nên vẫn chặn thực tế lúc dev/commit.
- [x] Ghi kết quả verify + hạn chế GritQL vào file này (dưới đây).

## Kết quả thực thi (08/08/2026)

**File tạo:** `tooling/biome-plugins/no-unscoped-db-mutation.grit` (10 pattern, top-level `or`, directive `engine biome(1.0)` + `language js(typescript, jsx)`).

**Wire vào `biome.json`:** field `plugins` dạng object với `includes` scope glob test:

```json
"plugins": [
  {
    "path": "./tooling/biome-plugins/no-unscoped-db-mutation.grit",
    "includes": ["**/*.test.ts", "**/*.test.tsx", "**/test/**/*.ts", "**/test/**/*.tsx"]
  }
]
```

Dùng `plugins[].includes` (Biome 2.4+, [PR #6117](https://github.com/biomejs/biome/pull/6117)) thay vì `overrides[].plugins` — gọn hơn, một chỗ khai báo scope. Path relative CWD (root khi chạy `biome check .`).

**Ma trận test (probe scratch, đã cleanup sau verify):**

| Probe | Đặt tại | Kỳ vọng | Kết quả |
|---|---|---|---|
| `coll.deleteMany()` | `packages/shared/test/*.test.ts` | error | ✅ bắt |
| `coll.deleteMany({})` | test | error | ✅ bắt |
| `coll.deleteOne({})` | test | error | ✅ bắt |
| `coll.updateMany({}, {...})` | test | error | ✅ bắt |
| `coll.updateOne({}, {...})` | test | error | ✅ bắt |
| `coll.findOneAndDelete({})` | test | error | ✅ bắt |
| `coll.findOneAndUpdate({}, {...})` | test | error | ✅ bắt |
| `db.dropDatabase()` | test | error | ✅ bắt |
| `db.dropCollection("foo")` | test | error | ✅ bắt |
| `coll.drop()` | test | error | ✅ bắt |
| `coll.deleteMany({ drawId: TEST_ID })` | test | 0 lỗi | ✅ không bắt |
| `coll.deleteMany({ _id: { $in: seededIds } })` | test | 0 lỗi | ✅ không bắt |
| `coll.updateMany({ tenantId }, {...})` | test | 0 lỗi | ✅ không bắt |
| `coll.deleteMany({})` + `coll.drop()` | `packages/shared/src/**` (source) | 0 lỗi | ✅ không bắt (ngoài glob) |

**Quét toàn repo:** `biome check .` → **0 hit** `test-data-safety` trên file test thật hiện có (không false-positive). Plugin load & fire xác nhận qua probe. `await` wrapper không cản match (GritQL match subtree call-expression). Total errors toàn repo giữ nguyên backlog p0-06 (plugin không thêm lỗi mới ở code hiện hữu).

**Hạn chế GritQL phát hiện:**
- Pattern `$coll.drop()` match MỌI `.drop()` (kể cả `.drop()` không phải Mongo). Chấp nhận vì đã scope test-only + lớp db-guard runtime bù. Rất hiếm trong file test.
- Chỉ bắt **empty-object literal `{}`** hoặc **thiếu đối số**. Filter build động thành rỗng lúc runtime (VD `deleteMany(buildFilter())` → `{}`) GritQL KHÔNG thấy — đúng như thiết kế, lớp 3 **db-guard runtime** chịu trách nhiệm case này. Không hạ chuẩn db-guard để bù.

## Phương án review sau thực thi

**1. Diff review — file được phép đổi:** `biome.json` (field `plugins` + override) và `tooling/biome-plugins/*.grit` (mới).

**2. Ma trận negative/positive test (chạy đủ, dán kết quả vào đây):**

| Probe | Đặt tại | Kỳ vọng |
|---|---|---|
| `coll.deleteMany({})` | `packages/shared/test/probe.test.ts` | **error** từ plugin |
| `coll.deleteMany()` | file test | **error** |
| `coll.updateMany({}, { $set: { x: 1 } })` | file test | **error** |
| `db.dropDatabase()` | file test | **error** |
| `coll.deleteMany({ drawId: TEST_ID })` | file test | **0 lỗi** (filter có scope) |
| `coll.deleteMany({})` | `packages/*/src/**` (source) | **0 lỗi** (ngoài scope glob test) |

**3. Kiểm tra tương thích version:** plugin viết cho GritQL của đúng bản Biome đang pin (2.5.7) — chạy `pnpm exec biome check --verbose` xem plugin được load, không warning parse.

**4. Đối chiếu lớp runtime:** chạy 1 test cố tình vi phạm với db-guard bật — cả 2 lớp (lint + runtime) cùng chặn. Nếu GritQL miss case nào mà db-guard bắt được → ghi vào "hạn chế GritQL" bên trên.

**5. Rollback:** xoá field `plugins` khỏi `biome.json` — 2 lớp còn lại (Cursor rule + db-guard) vẫn bảo vệ, đúng thiết kế 3 lớp.

## Ghi chú

Nếu GritQL của bản Biome đang dùng chưa match được empty-object argument đủ tin cậy, chấp nhận
tạm dừng lớp lint này — 2 lớp còn lại (Cursor rule + db-guard runtime) vẫn bảo vệ. Không hạ chuẩn
db-guard để bù.
