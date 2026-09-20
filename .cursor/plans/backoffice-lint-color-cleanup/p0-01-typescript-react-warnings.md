# P0-01 — TypeScript/React warnings (không đụng UI) — plan chi tiết

> Track AN TOÀN (`backoffice-lint-color-cleanup`). **Không** thuộc visual track.
> Cập nhật 2026-09-20 sau đo lại + audit pattern thật trong `apps/backoffice`.

## Status

| Mục | Giá trị |
|---|---|
| Baseline đo 20/09 | xem bảng §1 |
| Đã xong trước đó | `no-floating-promises` → **0** (commit `a947d859`) |
| **S1 DONE** (20/09) | `requireDrawId` helper + thay 32× `drawId!` trong `use-operations` ×7; `no-non-null-assertion` 206→**174**; `check-types` xanh |
| **S2 DONE** (20/09) | `exhaustive-deps` **26→0**: EMPTY_DRAWS / useMemo ổn định array; hub destructure query; tenant `existingSet` memo; players bỏ effect thừa |
| **S3a DONE** (20/09) | `lib/*` unnecessary-condition **18→0** (auth narrow, hasOwn lookup, nav for…of, theme matchMedia). Tổng rule 562→**544** |
| **S3b DONE** (20/09) | Keno `no-unnecessary-condition` **64→1** (giữ AudioContext `?? webkit` Safari). `check-types` xanh |
| Còn lại | ~1.135 warning (ước) |
| Visual track | **TẠM DỪNG** — làm P0-01 trước (ít rủi ro, nhanh) |

## 1. Baseline đo thật (2026-09-20)

```bash
pnpm exec oxlint apps/backoffice --format=unix 2>/dev/null | tee /tmp/oxlint-bo.txt
# Đếm theo rule:
rg -o 'Warning/[^\]]+' /tmp/oxlint-bo.txt | sort | uniq -c | sort -rn
```

| Rule | Số | Độ an toàn | Ưu tiên |
|---|---:|---|---|
| `typescript(no-unnecessary-condition)` | **562** | Cao nếu làm đúng quy trình §2.1 | **P0** — nhiều nhất, hầu hết máy móc |
| `typescript(no-non-null-assertion)` | **206** | Trung bình — phải narrow đúng | **P0** |
| `react(no-array-index-key)` | **178** | Cao (screenshot tĩnh không đổi) | P1 |
| `typescript(no-explicit-any)` | **128** | Trung bình — cần type thật | P1 |
| `react(refs)` | **57** | Trung bình — đọc từng case | P2 |
| `react(set-state-in-effect)` | **54** | Trung bình–cao — dễ đổi timing | P2 (cẩn thận) |
| `typescript(no-base-to-string)` | **33** | Cao | P1 |
| `react-hooks(exhaustive-deps)` | **26** | Thấp–trung bình — dễ loop/stale | **P0** (số ít, pattern lặp ×7 game) |
| `react(static-components)` | **15** | Cao | P1 |
| `typescript(require-array-sort-compare)` | **12** | Cao | P1 |
| `react(purity)` / `preserve-manual-memoization` | **8** | Trung bình | P2 |
| `next(no-img-element)` / `no-html-link-for-pages` / `no-unused-vars` / … | ~5 | Tuỳ case | P2 / bỏ qua nếu đổi pixel |

**Nguyên tắc vàng:** mọi sửa phải **giữ runtime behavior**. Nếu không chứng minh được → skip,
ghi vào §7 "cần review tay". **CẤM** `oxlint-disable` hàng loạt để "cho qua".

---

## 2. Quy trình an toàn chung (áp dụng MỌI rule)

1. **Một rule / một PR slice** (hoặc 1 commit rõ ràng) — dễ revert.
2. Trước khi sửa: đọc type tại điểm warning (IDE hover / khai báo). Không tin message oxlint một
   mình khi biến đến từ `any` / `as` / external API.
3. Sau mỗi nhóm file (≤20): `pnpm exec oxlint <paths>` — warning rule đó giảm, **không** sinh
   error mới.
4. Cuối slice: `pnpm --filter @megawin/backoffice check-types` phải xanh.
5. Behaviour e2e (không visual): `pnpm --filter @megawin/backoffice test:e2e` các spec
   `ops-hub-behaviour` / `navigation-regression` / `rbac` / `auth-guard` nếu đụng
   draw-context / use-operations / auth.
6. **KHÔNG** chạy `test:e2e:update` — track này không được đổi baseline ảnh.

---

## 3. Recipe theo rule — pattern thật trong repo

### 3.1 `no-unnecessary-condition` (562) — ưu tiên #1

**Phân loại đo được:**

| Subtype | ~Số | Fix |
|---|---:|---|
| Unnecessary optional chain (`?.` trên non-nullish) | **532** | Đổi `a?.b` → `a.b` khi type đã non-null |
| Always truthy / always falsy / no overlap / literal compare | **30** | Xoá nhánh chết hoặc sửa type/logic nếu nhánh chết là bug |

**Pattern A — optional chain thừa (máy móc, an toàn nếu type đúng):**

```typescript
// Trước (warning) — TS đã biết `raw[ClaimKey.Sub]` sau cast vẫn có thể… nhưng oxlint
// báo non-nullish tại chỗ cụ thể — ĐỌC type trước khi xoá
sub: (raw[ClaimKey.Sub] as string) ?? undefined;

// Chỉ xoá ?. khi base object đã narrowed, VD sau `if (!x) return;`
const name = user?.name; // nếu user: User (non-null) → user.name
```

Hotspot mẫu: `lib/auth.ts`, `lib/audit-actor.ts`, `lib/nav-registry.ts`,
`create-draw-action.tsx` / `publish-result-action.tsx` × nhiều game (cùng pattern lặp).

**Pattern B — nhánh luôn truthy/falsy (30 case — ĐỌC KỸ):**

```typescript
// Nếu oxlint nói "always falsy" — có thể là dead code (xoá an toàn)
// HOẶC type quá hẹp so với runtime (sửa type, GIỮ check)
if (status === "impossible") { ... } // → xoá hoặc sửa union Status
```

**CẤM:** xoá `?.` trên giá trị từ network/Mongo chưa validate chỉ vì oxlint bảo unnecessary —
ưu tiên sửa type cho đúng optional hơn là bỏ guard.

**Cách làm nhanh:** group theo file hotspot (publish-result / create-draw lặp ×7) — sửa 1 game
làm mẫu, diff sang game còn lại bằng cùng patch.

---

### 3.2 `no-non-null-assertion` (206) — ưu tiên #2

**Pattern A — React Query `enabled` + `drawId!` (~32 trong `use-operations.ts` × 7 game):**

```typescript
// Hiện tại (warning)
queryFn: () => apiClient.get(..., { params: { drawId: drawId! } }),
enabled: !!drawId,

// SAU — narrow tường minh, runtime giống hệt (enabled=false thì queryFn không chạy)
queryFn: () => {
  if (!drawId) {
    throw new Error("drawId required"); // unreachable khi enabled đúng
  }
  return apiClient.get(..., { params: { drawId } });
},
enabled: !!drawId,
```

Hoặc helper dùng chung:

```typescript
function requireDrawId(drawId: string | undefined): string {
  if (!drawId) {
    throw new Error("drawId required when query enabled");
  }
  return drawId;
}
```

**Rủi ro:** 0 nếu `enabled` luôn khớp — đây là pattern chuẩn React Query. Làm 1 file mega645
trước, verify, rồi lan 6 game còn lại (cùng shape).

**Pattern B — `find(...)!` / index `arr[0]!`:**

```typescript
const draw = draws.find((d) => d.id === id);
if (!draw) {
  return null; // hoặc throw AppException — theo ngữ cảnh UI
}
```

**CẤM:** thay `x!` bằng `x as NonNullable<typeof x>` — chỉ tắt type, không an toàn hơn.
**CẤM:** `x ?? ""` khi `""` không hợp lệ nghiệp vụ (drawId rỗng gửi API).

---

### 3.3 `react-hooks(exhaustive-deps)` (26) — ưu tiên #3 (số ít, pattern ×7)

**Pattern A — `availableDraws` mới mỗi render trong `create-draw-action.tsx` (7 game):**

```
React hook useMemo depends on `availableDraws`, which changes every render
```

Nguyên nhân: parent truyền `availableDraws={[...]}` hoặc derive array inline → identity đổi mỗi
render → useMemo vô nghĩa / có thể recompute thừa (không crash).

**Fix an toàn (chọn 1):**
1. Parent: `useMemo(() => computeSlots(...), [deps ổn định])` rồi truyền xuống; **hoặc**
2. Child: phụ thuộc primitive — `availableDraws.length` + serialized key
   (`availableDraws.map(s => s.drawNo).join()`) thay vì cả array nếu chỉ slice theo length; **hoặc**
3. Nếu thật sự cần identity: `useMemo` ở chỗ tạo array.

**CẤM:** thêm `availableDraws` vào deps rồi coi xong trong khi parent vẫn tạo array mới mỗi
render — warning hết nhưng perf/loop rủi ro không hết. **CẤM** eslint-disable deps.

**Pattern B — `draws` trong `use-draw-context.tsx` `onSelectDraw` (7 game):**

```typescript
const onSelectDraw = useCallback((drawId: string) => {
  const activeDrawId =
    draws.find(...)?.drawId || ...;
  void setSelectedDrawId(...);
}, [draws, setSelectedDrawId]);
```

Nếu `draws` là array mới mỗi render từ selector → callback mới mỗi lần (không sai logic, chỉ
re-render thừa). Fix: ổn định `draws` ở nguồn, hoặc đọc `draws` qua ref
(`useEffectEvent` / ref cập nhật mỗi render) nếu callback chỉ dùng trong event.

**Pattern C — missing dep thật (`query` trong hub-context, `activeSearch` trong players):**

Thêm dep **sau khi** đọc effect — nếu thêm gây loop → ổn định giá trị (memo/ref), không disable.

---

### 3.4 `no-array-index-key` (178)

```tsx
// Trước
{items.map((item, i) => <Row key={i} />)}

// Sau — ưu tiên id nghiệp vụ
{items.map((item) => <Row key={item.id} />)}
// Fallback khi không có id ổn định (skeleton tĩnh):
{items.map((item, i) => <Row key={item.id ?? `row-${i}`} />)}
```

Hotspot: `entry-detail-dialog`, `draw-history-section`, `draw-timeline`, skeletons.

**An toàn screenshot:** state tĩnh không đổi. **Rủi ro thật:** list reorder/insert giữa chừng —
đúng là lý do cần id. Skeleton tĩnh không reorder → `key={\`sk-${i}\`}` chấp nhận được (vẫn
warning nếu chỉ dùng index — dùng prefix string ổn định theo slot).

---

### 3.5 `no-explicit-any` (128)

```typescript
// catch
} catch (err: unknown) {
  if (err instanceof ApiClientError) { ... }
}

// JSON / tool payload chưa biết shape
const data: unknown = await res.json();
```

Hotspot: bingo18/keno `operations/.../result/index.tsx`, `active-draw-card`, draw-command-center.

**CẤM:** `as any` thay `any`. **CẤM** đổi sang `unknown` rồi cast thẳng không narrow.

---

### 3.6 `no-base-to-string` (33) / `require-array-sort-compare` (12)

```typescript
// to-string: không `${obj}` — lấy field
String(payload.playType ?? "") // nếu playType là object → payload.playType.code

// sort: luôn truyền compare
arr.sort((a, b) => a.localeCompare(b));
arr.sort((a, b) => a.drawNo - b.drawNo);
```

---

### 3.7 `react(refs)` / `set-state-in-effect` / `static-components` / `purity` — P2

| Rule | Cách làm an toàn | Tránh |
|---|---|---|
| `refs` | Đọc `ref.current` trong effect/event, không lúc render | Gán state từ ref trong render body |
| `set-state-in-effect` | Derive trong render (§5.1 Vercel) hoặc event handler | Xoá effect mà không thay bằng derive → mất sync |
| `static-components` | Hoist component ra module scope | Để nguyên + disable |
| `purity` | Không gọi `Date.now()`/`Math.random()` lúc render — `useState(() => ...)` | — |

**Làm sau** các rule P0/P1 — mỗi case đọc riêng, không bulk.

---

## 4. Thứ tự slice đề xuất (nhanh → chậm, an toàn → cần review)

| Slice | Rule | Ước lượng | Cách làm |
|---|---|---|---|
| **S1** | `no-non-null-assertion` — chỉ `use-operations.ts` × 7 | ~32 | Pattern React Query §3.2A — 1 helper hoặc copy patch |
| **S2** | `exhaustive-deps` — `create-draw-action` + `use-draw-context` × 7 | ~21 | Ổn định array / ref — **không** disable |
| **S3** | `no-unnecessary-condition` — optional chain ở file `lib/*` + 1 game mẫu | ~100–150 | Bỏ `?.` sau xác nhận type |
| **S4** | `no-unnecessary-condition` — lan `publish-result` / `create-draw` × 7 | phần còn lại của 532 | Diff giống S3 |
| **S5** | `no-non-null-assertion` còn lại (ngoài use-operations) | ~174 | Guard/`??` theo ngữ cảnh |
| **S6** | `no-array-index-key` | 178 | Đổi key ổn định theo file hotspot |
| **S7** | `no-explicit-any` + `no-base-to-string` + `require-array-sort-compare` | ~173 | Type/narrow/compare |
| **S8** | `refs` / `set-state-in-effect` / `static-components` / `purity` | ~130 | Case-by-case |
| **S9** | Nhánh always-truthy/falsy (30) + next/* | ~35 | Review tay — có thể phát hiện bug type |

Mỗi slice = 1 commit message dạng:
`refactor(backoffice): P0-01 S1 — drop drawId! in use-operations via narrow`.

---

## 5. Checklist Definition of Done (toàn P0-01)

- [ ] Các rule §1 (trừ next/img nếu cố ý giữ) về **0** trên `apps/backoffice`, hoặc còn lại chỉ
      nằm trong §7 với lý do cụ thể.
- [ ] `pnpm --filter @megawin/backoffice check-types` xanh.
- [ ] Behaviour e2e xanh (không update visual baseline).
- [ ] Không thêm `oxlint-disable` trừ ngoại lệ §d (`oxlint-lint-conventions.mdc`) có lý do nghiệp
      vụ 1 dòng.
- [ ] Visual track (`no-raw-colors` / `no-restyle`) **không** đụng trong các commit này.

---

## 6. Ranh giới — KHÔNG làm trong P0-01

- `shadcn(no-raw-colors)` / `no-restyle` / heatmap / status badge màu → visual track.
- Đổi semantics API / Zod schema / financial path.
- Suppress hàng loạt để đếm warning về 0.

---

## 7. Danh sách "cần review tay" (điền khi làm)

| File:line | Rule | Lý do giữ / cần hỏi user |
|---|---|---|
| `keno/operations-hub/_lib/hub-alert-banner.tsx:69` | `no-unnecessary-condition` | `window.AudioContext ?? webkitAudioContext` — DOM lib đánh dấu `AudioContext` luôn có; Safari cũ vẫn cần webkit. **Không xoá** — đổi runtime Safari. |

---

## 8. Liên kết

- Overview track: [`00-overview.md`](00-overview.md) §3 mục 1
- Visual (làm sau): [`../backoffice-visual-color-redesign/00-overview.md`](../backoffice-visual-color-redesign/00-overview.md)
- Commit P1-05 vừa xong (không thuộc phase này): `2d6fdbff` trên `visual/p1-05-heatmap`
