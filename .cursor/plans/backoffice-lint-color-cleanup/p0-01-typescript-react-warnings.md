# P0-01 — TypeScript/React warnings (không đụng UI)

**Mục tiêu:** xử lý ~1.370 warning không thuộc `@shadcn/lint` — hoàn toàn không ảnh hưởng render.
Làm trước tiên vì không cần lo lệch UI, và dọn sạch giúp diff của các phase sau (P0-03, P0-04)
dễ review hơn (không bị nhiễu bởi warning không liên quan).

Lấy danh sách file/line chính xác bằng:
```bash
./node_modules/.bin/oxlint apps/backoffice --format=unix 2>&1 > /tmp/oxlint-full.txt
rg 'typescript\(no-unnecessary-condition\)' /tmp/oxlint-full.txt
rg 'typescript\(no-non-null-assertion\)' /tmp/oxlint-full.txt
rg 'react\(no-array-index-key\)' /tmp/oxlint-full.txt
rg 'typescript\(no-explicit-any\)' /tmp/oxlint-full.txt
rg 'react\(refs\)|react\(set-state-in-effect\)|react\(incompatible-library\)|react\(static-components\)' /tmp/oxlint-full.txt
rg 'typescript\(no-floating-promises\)' /tmp/oxlint-full.txt
rg 'typescript\(no-base-to-string\)' /tmp/oxlint-full.txt
rg 'react-hooks\(exhaustive-deps\)' /tmp/oxlint-full.txt
rg 'typescript\(require-array-sort-compare\)|react\(purity\)|react\(preserve-manual-memoization\)|typescript\(unbound-method\)|typescript\(no-redundant-type-constituents\)|next\(no-img-element\)|next\(no-html-link-for-pages\)|eslint\(no-unused-vars\)' /tmp/oxlint-full.txt
```

## Thứ tự xử lý (từ rủi ro thấp nhất, nhiều nhất, đến cần đọc kỹ nhất)

### 1. `typescript(no-unnecessary-condition)` — 560 warning

Optional chain / conditional trên giá trị TypeScript đã biết là non-nullish. Fix = bỏ `?.` thừa
hoặc bỏ `if` luôn đúng/luôn sai. Đây thuần compile-time — kết quả runtime không đổi (giá trị vốn
đã non-nullish nên `?.` với `.` cho cùng kết quả).

```typescript
// SAI (warning) — a đã được TS narrow non-null ở scope này
const x = a?.b;

// ĐÚNG
const x = a.b;
```

**Rủi ro cần lưu ý:** nếu oxlint báo "unnecessary" nhưng thực tế có đường runtime khác khiến giá
trị CÓ THỂ null (type annotation sai, cast ẩn) — xoá `?.` sẽ crash. Với mỗi warning: đọc type của
biến tại điểm đó (hover trong IDE hoặc đọc khai báo), xác nhận đúng là TypeScript biết chắc
non-null trước khi xoá. Nếu nghi ngờ (biến đến từ `any`/`as`/external API chưa validate) — bỏ qua,
để lại, ghi vào danh sách "cần review tay" cuối phase.

### 2. `typescript(no-non-null-assertion)` — 206 warning

`x!` → thay bằng guard rõ ràng hoặc `??`. KHÔNG đơn giản xoá `!` (khác hành vi runtime nếu giá trị
thực sự có thể null — `!` chỉ tắt compiler check, không đổi giá trị; xoá `!` mà không thêm gì thì
type lỗi, phải xử đúng bằng 1 trong 2 cách):

```typescript
// SAI
const draw = draws.find((d) => d.id === id)!;

// ĐÚNG — throw rõ ràng nếu business logic đảm bảo phải tồn tại
const draw = draws.find((d) => d.id === id);
if (!draw) {
  throw AppException.notFound("Không tìm thấy kỳ quay.");
}

// ĐÚNG — fallback nếu có giá trị mặc định hợp lý
const draw = draws.find((d) => d.id === id) ?? DEFAULT_DRAW;
```

Ưu tiên pattern "throw rõ ràng" cho code có business meaning (repo/use-case), pattern "fallback"
chỉ khi thực sự có giá trị mặc định hợp lệ về nghiệp vụ.

### 3. `typescript(no-explicit-any)` — 128 warning

Theo `entity-typesafe-mongodb.mdc`/`code-quality-standards.mdc`: `any` chỉ hợp lệ ở
`*-application/src/infras/**` và test. Với warning trong `apps/backoffice/src` (không phải infra
package): thay `any` bằng type cụ thể (đọc API response/DTO thật để suy ra type), hoặc `unknown`
+ narrow nếu type thực sự không biết trước (VD: JSON.parse kết quả, error catch).

```typescript
// SAI
function handleError(err: any) { ... }

// ĐÚNG
function handleError(err: unknown) {
  if (err instanceof ApiClientError) { ... }
}
```

### 4. `react(no-array-index-key)` — 178 warning

`key={index}` trên list — đổi sang key ổn định (`item.id`, `item.drawId`, …). Đây có ảnh hưởng
React reconciliation (không phải pixel tĩnh) nhưng KHÔNG đổi giao diện đã render — chỉ đổi cách
React re-order/re-mount khi list thay đổi thứ tự. An toàn cho track này vì screenshot tại 1 thời
điểm cố định (state ổn định) sẽ giống nguyên. Kiểm tra riêng: nếu danh sách có thể có key trùng
(2 item cùng id do bug data) — giữ index làm fallback: `key={item.id ?? index}`.

### 5. `react(refs)` / `react(set-state-in-effect)` / `react(incompatible-library)` / `react(static-components)` — 164 warning

Đọc từng warning cụ thể (React Compiler / React 19 rule):
- `refs`: truy cập `ref.current` lúc render → chuyển vào effect/event handler.
- `set-state-in-effect`: setState đồng bộ trong effect gây cascading render → dùng derived state
  (tính trong render) theo `vercel-react-best-practices` §5.1, hoặc chuyển logic vào event handler.
- `incompatible-library`: thư viện dùng API không tương thích React Compiler — đọc message cụ thể,
  thường cần `"use no memo"` hoặc bỏ qua nếu third-party.
- `static-components`: định nghĩa component trong thân component khác (component tạo lại mỗi
  render) → hoist ra ngoài.

Đây là warning về **cấu trúc code**, không đổi output render khi state ổn định — an toàn cho track
này, nhưng đọc kỹ từng case vì đa dạng, không áp 1 công thức chung.

### 6. `typescript(no-floating-promises)` — 55 warning

Theo `oxlint-lint-conventions.mdc` §d: thêm `await` hoặc `void` tường minh. KHÔNG dùng cho code
tài chính (không áp dụng ở backoffice UI layer, nhưng vẫn nên `await` đúng chứ không chỉ `void`
nếu có thể):

```typescript
// SAI
mutation.mutate(values);

// ĐÚNG — nếu không cần chờ kết quả trước khi tiếp tục (UI đã handle qua onSuccess/onError)
void mutation.mutate(values);

// ĐÚNG — nếu logic sau đó cần đợi
await someAsyncFn();
```

### 7. `typescript(no-base-to-string)` — 33 warning

`String(obj)`/`` `${obj}` `` trên object không có `toString()` có nghĩa → sửa để pick field cụ thể
hoặc `JSON.stringify`.

### 8. `react-hooks(exhaustive-deps)` — 26 warning

Đọc từng case: thêm dependency thiếu, hoặc nếu dependency đó cố tình bỏ qua (VD callback ref ổn
định) — dùng `useEffectEvent` (theo `vercel-react-best-practices` §8.3) thay vì disable rule.

### 9. Còn lại (~24: `require-array-sort-compare`, `purity`, `preserve-manual-memoization`,
`unbound-method`, `no-redundant-type-constituents`, `next(no-img-element)`,
`next(no-html-link-for-pages)`, `eslint(no-unused-vars)`)

Xử theo từng warning cụ thể — số lượng nhỏ, đọc message + context trực tiếp:
- `no-img-element`: `<img>` → `next/image` (đổi rendering — CHỈ làm nếu xác nhận kích thước ảnh
  cố định khớp, nếu không chắc → để track VISUAL).
- `no-html-link-for-pages`: `<a href="/...">` nội bộ → `next/link`.
- Còn lại: sửa trực tiếp theo gợi ý message của oxlint.

## Quy trình thực hiện

1. Xử theo từng rule (không theo file) — dễ áp cùng 1 pattern fix cho nhiều chỗ, dễ review.
2. Sau mỗi rule: `./node_modules/.bin/oxlint apps/backoffice -W 'typescript(<rule>)'` (dùng
   `-A all -W '<rule>'` để chỉ hiện đúng rule đang xử) để xác nhận về 0.
3. Sau khi xử hết TS/React: `pnpm --filter @megawin/backoffice check-types` phải xanh.
4. `prettier --write apps/backoffice/src` một lần cuối phase.
5. Không chạy e2e visual ở bước này (không cần — track này không đổi DOM/class), nhưng chạy
   `pnpm --filter @megawin/backoffice test:e2e` (behaviour spec: `ops-hub-behaviour`,
   `navigation-regression`, `rbac`, `auth-guard`, `determinism`) để bắt hồi quy logic/hành vi nếu
   lỡ đổi sai khi sửa `no-non-null-assertion`/`no-unnecessary-condition`.

## Output mong đợi

- `oxlint apps/backoffice` không còn warning nhóm TypeScript/React kể trên.
- `check-types` xanh.
- `test:e2e` behaviour xanh (không chạy visual — không cần).
- Danh sách "cần review tay" (nếu có, từ mục 1 — case nghi ngờ null runtime) báo lại cho user,
  KHÔNG tự quyết định xoá `?.`/`!` khi không chắc.
</contents>
