# System — Migration Biome → Oxlint/Oxfmt + tích hợp `@shadcn/lint`

> Status: **discussing** — chưa approved.
> Ngày: 17/09/2026.
> Nguồn tham chiếu: `.cursor/rules/biome-lint-conventions.mdc`, `biome.json`, lịch sử migration
> `.cursor/plans/biome-monorepo-migration/` (ESLint → Biome, hoàn tất 08/08/2026), research web
> Oxlint/Oxfmt/`@shadcn/lint` thực hiện 17/09/2026 (xem trích dẫn nguồn ở từng mục).

## 1. Bối cảnh & mục tiêu

User muốn: (1) nghiên cứu chuyển đổi từ Biome sang Oxlint (hoặc kết hợp) cho **toàn bộ** nhu cầu
format + lint + type-check của monorepo; (2) tích hợp [`shadcn-ui/lint`](https://github.com/shadcn-ui/lint)
(`@shadcn/lint`) — linter thiết kế hệ thống Tailwind cho AI agent.

Điểm mấu chốt cần nói rõ ngay: **`@shadcn/lint` chỉ chạy trên Oxlint hoặc ESLint — không hỗ trợ
Biome** (không có cơ chế JS-plugin/AST-visitor mở cho bên thứ ba, chỉ có GritQL — không đủ mạnh để
implement rule cần đọc `components.json`, theme Tailwind, contracts, placeholder message). Do đó
hai mục tiêu của user **ràng buộc lẫn nhau**: muốn có `@shadcn/lint` bắt buộc phải có Oxlint (hoặc
khôi phục ESLint — repo đã retire ESLint có chủ đích ở `p0-05`, xem §2).

Repo **đã từng làm migration ngược lại** (ESLint → Biome) cách đây ~1 tháng (hoàn tất 08/08/2026),
với đầy đủ đo lường, khảo sát số liệu, và ghi nhận quyết định trong `.cursor/plans/biome-monorepo-migration/`.
Phân tích này phải đối chiếu với quyết định đó — không lặp lại sai lầm, không bỏ qua bài học đã có.

## 2. Hiện trạng đã đọc (không phỏng đoán)

### 2.1. Cấu hình Biome hiện tại (`biome.json`, root)

- Biome **2.5.13** (`package.json` devDependencies), 1 file config duy nhất ở root.
- **Formatter**: bật cho `.ts/.tsx/.js/.mjs/.json/.jsonc/.css/.html`; `lineWidth: 120`, double quote,
  trailing comma `all`, semicolons always.
- **Assist `organizeImports`**: custom group order
  `react → react/** → :BLANK_LINE: → next/** → :BLANK_LINE: → :PACKAGE: → :BLANK_LINE: → :ALIAS: → :BLANK_LINE: → :PATH:`
  — sort statement order **và** specifier trong `{ }` cùng lúc.
- **Linter**: `recommended: true` + domains `test/project/types: recommended` (type-aware bật toàn repo).
  27 rule khai báo tường minh (style/suspicious/correctness/performance/complexity/nursery), trong đó
  4 rule type-aware còn ở `nursery` Biome (`noFloatingPromises`, `noMisusedPromises`,
  `useAwaitThenable`, `useExhaustiveSwitchCases`) + `useSortedClasses` (Tailwind class sort, nursery).
- **1 GritQL plugin** (`tooling/biome-plugins/no-unscoped-db-mutation.grit`) — chặn `deleteMany({})`,
  `updateMany({}, ...)`, `.drop()`... không scope trong file test (bài học từ sự cố xoá staging thật
  05/08/2026). Scope qua `plugins[].includes`.
- **9 `overrides[]`** theo glob archetype: config files, test files, `packages/*/src` (library
  named-export), `*-application/src/infras` (cho phép `any`), `apps/api-*`/`apps/worker-*` (cho phép
  `console`), `apps/backoffice/src/app` (Next.js App Router), `apps/backoffice` nói chung (JSX rules),
  `apps/*/agent`, `packages/ui/components/ui` (tắt hẳn lint — generated shadcn components),
  `packages/*/test/html`.
- **Script**: `pnpm lint` = `biome check .`, `pnpm lint:fix`, `pnpm format`, `pnpm ci` = `biome ci .`
  (không ghi file). `pnpm format:docs` dùng **Prettier** riêng cho `.md/.yml/.yaml` (Biome chưa hỗ
  trợ 2 định dạng này). `lint-staged` chạy `biome check --write` cho code, `prettier --write` cho docs.
- **Type-check**: `pnpm check-types` = `turbo run check-types` — dùng `tsc` (TypeScript `^6.0.3`),
  KHÔNG qua Biome. Đây là tool tách biệt hoàn toàn với Biome hiện tại.

### 2.2. Quy mô monorepo

- 14 apps (`api-player`, `api-resultfeed`, `api-tenant`, `backoffice`, 8 `worker-*`, …), 34 packages,
  3 tooling package (`typescript-config`, `vitest-config`, `biome-plugins`).
- Khảo sát cũ (p0-06, 01/08/2026): **3.122 file `.ts/.tsx`**.
- `tooling/typescript-config/base.json`: đã bật `strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
  **Không** dùng `baseUrl` ở base/nextjs/serverless config.
- 3 app có `paths` riêng trong `tsconfig.json` (`apps/backoffice`, `apps/api-player`,
  `apps/api-tenant`) — dùng `paths` **không kèm `baseUrl`** (style TS hiện đại, `moduleResolution:
  "Bundler"`).
- **Không có** decorator (`experimentalDecorators`), không dùng `reflect-metadata`/`tsyringe`/`typedi`,
  không dùng TS Compiler API trực tiếp (`ts-morph`, `typescript.createProgram`) ở bất kỳ đâu trong
  repo (`rg` xác nhận 0 kết quả) — rủi ro tương thích TypeScript 7 do đó **thấp** ở khía cạnh này.
- **1 script dùng `ts-node`** (`apps/backoffice/package.json`:
  `generate:presets`: `ts-node --compiler-options '{"module":"CommonJS"}' ...`) — đã được p1-01 gắn
  cờ là điểm cần theo dõi (khuyến nghị chuyển sang `tsx`, backoffice đã có `tsx` trong devDependencies).
  Đây là điểm va với TypeScript 7 (xem §4.4).
- **Không** có `.github/workflows` (CI chưa setup — theo p1-02, hoãn Phần 2/3). Lint hiện tại chạy
  qua pre-commit hook (`husky` + `lint-staged`) và chạy tay `pnpm lint`.

### 2.3. Lịch sử quyết định liên quan (từ `.cursor/plans/biome-monorepo-migration/`)

Đây là dữ liệu **quan trọng nhất** để không lặp lại phân tích cũ hoặc bỏ sót bài học:

- Repo đã dùng ESLint (chỉ 10 file `packages/ui`) trước 08/2026, retire hoàn toàn vì "ESLint chỉ có 1
  consumer, ứng dụng ~0% coverage thực tế trên 3.122 file". Quyết định chuyển hẳn sang Biome vì
  "một binary, không xung đột formatter/linter, GritQL đủ cho 1 rule nội bộ cần".
- Từng có nhận định SAI ban đầu rồi tự đính chính: "Biome không có `noImportCycles`" (SAI — có),
  "type-aware chỉ 75-85%" (đã đạt ~75% parity, backend từ 0% → có), "không có tương đương
  `turbo/no-undeclared-env-vars`" (SAI). Bài học: **luôn verify bằng đọc doc/changelog thật, không
  suy đoán từ kiến thức cũ** — áp dụng đúng cho vòng nghiên cứu Oxlint lần này.
- Đã đo hiệu năng thật khi bật domain `project`/`types` (type-aware): baseline 0.55s → 2.1s cho toàn
  repo (dưới ngưỡng 10s chấp nhận). Đây là **baseline hiệu năng Biome hiện tại** để so sánh với Oxlint.
- Đã triage toàn bộ diagnostic type-aware mới phát sinh (16 `noFloatingPromises`, 2 `useAwaitThenable`,
  1 `noMisusedPromises`, 297 `noUnnecessaryConditions` backlog ở mức `warn`) — nghĩa là **repo hiện
  đang sạch** theo các rule đó; khi đổi sang Oxlint/tsgolint phải re-verify không có false-negative
  mới hoặc regression.
- 9 parameter property đã refactor thủ công để bật `erasableSyntaxOnly`; 37 method thêm `override` để
  bật `noImplicitOverride`. Đây là chi phí **đã trả rồi** — không liên quan Oxlint nhưng là context về
  mức đầu tư đã có vào tsconfig hiện tại.
- **Kết luận rõ trong `00-overview.md` §7 mục 9**: "Mỗi lần bump minor Biome sau này: check mục
  'Promoted rules' trong changelog trước khi bump" — nguyên tắc này áp dụng tương tự cho Oxlint
  (rule mới thêm ở minor release có thể phát sinh diagnostic mới, xem §4.1 versioning policy).

## 3. Nghiên cứu Oxlint / Oxfmt / tsgolint — hiện trạng thật tại 17/09/2026

> Toàn bộ mục này lấy từ web search + đọc trực tiếp docs `oxc.rs`, GitHub releases, npm registry —
> KHÔNG suy đoán từ kiến thức huấn luyện cũ (đã có bài học ở §2.3). Ngày publish của từng nguồn được
> ghi kèm để đánh giá độ mới.

### 3.1. Oxlint — linter

- **Bản stable hiện tại: v1.81.0** (phát hành 01/09/2026). Oxlint đạt **1.0 stable từ 19/06/2025**,
  đã dùng production ở Shopify, Airbnb, Mercedes-Benz (theo VoidZero/InfoQ). Versioning theo semver:
  patch = bugfix, **minor = có thể thêm rule mới** (có thể làm CI đỏ thêm mà không đổi config — cùng
  rủi ro như "promoted rules" của Biome ở §2.3, phải review changelog mỗi lần bump).
- **865+ rule built-in** (Rust), bao phủ ESLint core + các plugin phổ biến: React (kèm
  `react-hooks`), TypeScript (`@typescript-eslint`), Import, Unicorn, jsx-a11y, Next.js, Jest, Vitest,
  Promise, Node, Vue. Các plugin gốc này **là tên plugin dành riêng (reserved)** — không thể ghi đè
  bằng JS plugin cùng tên (phải đặt alias khác).
- **JS Plugins** (tương thích ESLint plugin API v9+) — trạng thái chính thức vẫn ghi **"alpha"** trên
  docs (`oxc.rs/docs/guide/usage/linter/js-plugins`) dù đã phát hành từ 11/03/2026 (~6 tháng). Cho phép
  chạy hầu hết ESLint plugin JS không sửa gì, hoặc viết custom rule bằng AST visitor (giống ESLint
  `create(context)`, hoặc API tối ưu hơn `createOnce(context)` qua `@oxlint/plugins`).
  **Không có DSL kiểu GritQL** — mọi custom rule phải viết bằng AST traversal JS/TS thủ công.
- **Type-aware linting: STABLE từ 22/07/2026** (blog "Type-Aware Linting Stable", tsgolint v7).
  Cơ chế: Oxlint (Rust) xử lý file traversal/rule thường; **tsgolint (Go)**, dựng trên
  `typescript-go`, chạy riêng các rule cần type info, trả diagnostic ngược cho Oxlint.
  59/61 rule type-aware của `typescript-eslint` đã có (thiếu 2). Bật bằng `--type-aware` (CLI) hoặc
  `options.typeAware: true` (**chỉ ở root config** — xem giới hạn monorepo bên dưới).
  **Yêu cầu TypeScript 7.0+**; không hỗ trợ tsconfig legacy (ví dụ `baseUrl`) — xem §4.4.
- **Giới hạn monorepo đã xác nhận bằng issue thật** (`oxc-project/oxc#21426`, còn mở): nếu chạy
  `turbo run lint` gọi `oxlint` riêng ở từng package, config package con đặt `options.typeAware` sẽ
  bị Oxlint **báo lỗi cấu hình** ("only supported in the root config"). Rule bắt buộc: chỉ 1 lệnh
  `oxlint` chạy ở **root**, quét toàn repo — đúng với convention hiện tại của repo này
  (`biome-lint-conventions.mdc` mục b: "KHÔNG dùng `turbo run lint`") → **không bị ảnh hưởng bởi gap
  này nếu giữ đúng convention khi migrate**.
- Docs Oxlint còn ghi rõ cho monorepo: nên `pnpm -r build` trước khi lint type-aware (để có `.d.ts`
  cho package phụ thuộc), và root `tsconfig.json` (nếu dùng project-references) nên có `"files": []`
  để tránh include trực tiếp source. Repo này **không có `tsconfig.json` ở root** — mỗi app/package tự
  có tsconfig riêng `extends` từ `tooling/typescript-config`, cần thiết kế lại cách tsgolint discover
  tsconfig cho toàn bộ 34 package (xem §4.4).

### 3.2. Oxfmt — formatter

- **Bản hiện tại: v0.66.0** (đi kèm release Oxlint v1.81.0, 01/09/2026) — **vẫn ở giai đoạn BETA**,
  ghi rõ trong docs chính thức (`oxc.rs/blog/2026-02-24-oxfmt-beta.html`, chưa có blog "stable" tính
  đến thời điểm nghiên cứu) và trong README `biome-to-oxc`: *"Oxfmt is in beta; review formatting
  changes before replacing the existing formatter"*.
- Tuyên bố **100% conformance với Prettier test suite JS/TS**. Hỗ trợ định dạng rộng hơn Biome:
  JS/JSX/TS/TSX/JSON/JSONC/JSON5/**YAML**/TOML/HTML/Angular/Vue/Svelte/CSS/SCSS/Less/**Markdown**/MDX/
  GraphQL/Ember/Handlebars — nghĩa là Oxfmt **có thể thay thế cả Prettier** (hiện dùng riêng cho
  `.md/.yml/.yaml`) chứ không chỉ thay Biome formatter. Nếu chuyển, `pnpm format:docs` (Prettier) có
  thể gộp về 1 lệnh `oxfmt` duy nhất — giảm số tool từ 2 xuống 1.
  Nhưng Biome đang không ignore markdown, oxfmt lại đè quyền — cần review đối chiếu output thật với
  Prettier hiện tại trước khi gộp (rủi ro thấp nhưng chưa verify bằng cách chạy thật).
- **Built-in sort**: import sorting, Tailwind class sorting, `package.json` field sorting —
  tương đương `assist.organizeImports` + `useSortedClasses` của Biome, nhưng **kiến trúc khác**:
  - Import sort dựa theo `eslint-plugin-perfectionist/sort-imports` (groups: `type-import`,
    `value-builtin`, `value-external`, `type-internal`, `value-internal`, `customGroups` với
    `elementNamePattern` (glob theo import source), `internalPattern` cho alias (vì **không** resolve
    alias qua `tsconfig.json` — phải khai tay prefix, khác Biome vốn cũng không cần tsconfig).
  - **GAP xác nhận qua issue GitHub còn mở** (`oxc-project/oxc#20160`, 09/03/2026, chưa fix tính đến
    17/09/2026): Oxfmt `sortImports` **không sort specifier trong `{ }`**
    (`import { useState, useEffect, useRef }` giữ nguyên thứ tự khai báo), khác Biome
    `organizeImports` sort **cả statement order và specifier trong 1 lần**. Muốn có lại hành vi cũ
    phải bật thêm rule lint `eslint/sort-imports` ở Oxlint với `ignoreDeclarationSort: true` —
    **2 tool phải phối hợp** cho 1 concern duy nhất (đúng công thức mà chính issue mô tả).
  - Tailwind sort dựa theo `prettier-plugin-tailwindcss`, nhận `functions`/`attributes` dạng chuỗi
    (không dùng regex) — khớp với cách khai báo hiện tại của Biome (`"attributes": ["className"],
    "functions": ["clsx","cva","cn","twMerge"]`), map 1-1 được.
- **Không hỗ trợ nested config** (mỗi package con không thể có `.oxfmtrc.json` riêng) — dùng
  `overrides[].files` ở root để khác biệt hoá, giống Biome hiện tại (đã dùng đúng pattern 1-file-root).

### 3.3. Công cụ migrate Biome → Oxc

- **`biome-to-oxc`** (npm, GitHub `entro314-labs/biome-to-oxc`, tác giả Dominikos Pritis) — **CÓ TỒN
  TẠI**, là công cụ community (KHÔNG chính thức của Oxc team). Bản mới nhất **3.0.0** (20/08/2026).
  Chỉ 2 star GitHub, 215 lượt tải/tuần npm, 1 contributor duy nhất — **độ trưởng thành thấp, rủi ro
  bus-factor cao**, nhưng có test suite (`pnpm test`) + "conformance test" đảm bảo tên rule Biome dùng
  để map vẫn tồn tại thật (theo changelog v3.0.0), và tự sync inventory rule từ chính package
  `@biomejs/biome`/`oxlint`/`oxfmt` đã cài (`pnpm docs:sync`) — thiết kế nghiêm túc hơn một script
  một lần.
  - Đọc `biome.json`, resolve `extends`, sinh `.oxlintrc.json` + `.oxfmtrc.jsonc`, map ~80+ rule Biome
    → Oxlint, có cờ `--turborepo` (cập nhật `turbo.json`), `--eslint-bridge`, `--prettier`.
  - **Giới hạn tự khai trong README**: không phải rule nào cũng map được (in cảnh báo); preset
    `recommended`/`all` + severity theo nhóm chỉ **approximate** (không giống 100% giữa 2 tool); GritQL
    plugin **không tự động migrate được** — phải viết lại tay thành JS plugin (đúng dự đoán ở §3.1);
    `overrides` không tự migrate hoàn chỉnh, cần review tay; **Oxfmt đang beta nên phải tự review** kết
    quả format trước khi thay hẳn.
  - Kết luận dùng công cụ này: **hữu ích để có bản nháp đầu (first-pass draft) rồi review tay từng
    dòng**, tuyệt đối không chạy rồi tin dùng ngay — đúng tinh thần "review từng file được đổi" mà repo
    này đã áp dụng ở p0-06.
- `@oxlint/migrate` (chính thức của Oxc team) **chỉ hỗ trợ ESLint flat config → Oxlint**, KHÔNG hỗ trợ
  Biome. Đã có issue chính thức yêu cầu hỗ trợ Biome (`oxlint-migrate#454`) — Oxc team **từ chối nhận
  việc này**, nói rõ lý do (phải track rule mapping Biome, dễ vỡ khi Biome đổi format file mapping nội
  bộ) và để ngỏ cho ai muốn tự làm — đây chính là chỗ `biome-to-oxc` (bên thứ 3) lấp vào.

### 3.4. TypeScript 7 / tsgo — điều kiện bắt buộc cho type-aware Oxlint

- **TypeScript 7.0 đã GA từ 08/07/2026** (`devblogs.microsoft.com`) — bản port native sang Go, nhanh
  hơn ~10x. Từ bản GA, binary vẫn tên **`tsc`** (không phải `tsgo` — tên đó chỉ dùng ở bản preview
  `@typescript/native-preview`). Cài `typescript@latest`/`^7` qua npm là có ngay.
  Type system **không đổi** giữa 6.x và 7.x — chỉ đổi *implementation* (Go thay JS) → rủi ro breaking
  chủ yếu nằm ở: (a) tool dựa vào TS Compiler API JS-based (repo này **không có**, đã xác nhận §2.2),
  (b) tsconfig dùng option đã deprecated/removed (baseUrl legacy — repo không dùng), (c) **ts-node**
  (dựa vào hook runtime vào TS Compiler API JS) — repo có **1 chỗ dùng** (`generate:presets`,
  `apps/backoffice`), rủi ro thật, cần chuyển sang `tsx` (đã sẵn trong devDependencies) **trước khi**
  bump TypeScript lên 7.x, không phải sau.
- Repo hiện khai `"typescript": "^6.0.3"` — **cần bump lên `^7.x` để dùng tsgolint** (type-aware Oxlint
  yêu cầu tường minh "TypeScript 7.0+"). Đây là **thay đổi major dependency ảnh hưởng toàn repo**
  (mọi package `tsc --noEmit` qua `turbo run check-types`), không phải chỉ là đổi lint config — phải
  coi là 1 plan riêng, độc lập rủi ro với phần đổi linter/formatter.
- **Lợi ích phụ nếu bump**: `pnpm check-types` (dùng trực tiếp `tsc`) tự động nhanh hơn ~8-12x do dùng
  chung engine Go — không cần đổi lệnh gì, chỉ cần bump version. Đây là lý do độc lập, đáng làm dù
  không đụng gì đến Oxlint/Biome.

### 3.5. Verify thật bằng cách chạy `oxlint` (không suy đoán) — 17/09/2026

Đã cài `oxlint@1.83.0` (bản mới hơn cả bản 1.81.0 tìm thấy qua web search 2 ngày trước — xác nhận
tốc độ release rất nhanh, ~1 bản/tuần) vào thư mục tạm, dump catalog rule thật bằng
`oxlint --print-config -D all -D nursery <plugins bật>` (deny toàn bộ category để mọi rule đã cài của
plugin đó hiện ra, thay vì chỉ tập rule mặc định). Đây là **dữ liệu thực đo, không phải tra docs**:

- Base (không bật plugin gì thêm): **203 rule** đăng ký (unicorn + typescript + oxc, mặc định).
- Với `--import-plugin --react-plugin --jsx-a11y-plugin --nextjs-plugin --promise-plugin --node-plugin`
  + `-D all -D nursery`: **691 rule**.
- Thêm `--jest-plugin --vitest-plugin --vue-plugin`: **641 rule** riêng phần jest+vitest+vue (không
  cộng dồn vì lần dump khác nhau, nhưng đủ cho thấy quy mô — tổng toàn bộ plugin dễ vượt 900).

**Kết quả grep tên rule thật** (không suy đoán) — dùng để chốt bảng mapping ở §4:

| Tìm | Rule tồn tại thật trong catalog |
|---|---|
| ban `enum` | **KHÔNG có** — chỉ có rule chất lượng enum (`no-duplicate-enum-values`, `no-mixed-enums`, `prefer-enum-initializers`...), không có rule cấm khai báo `enum` như Biome `noEnum` |
| `as const` | `typescript/prefer-as-const` ✅ |
| `import type` | `typescript/consistent-type-imports` ✅ |
| `export type` | `typescript/consistent-type-exports` ✅ |
| `namespace` | `typescript/no-namespace` ✅ |
| inferrable types | `typescript/no-inferrable-types` ✅ |
| useless else | `no-else-return` ✅ (gần tương đương) |
| param reassign | `no-param-reassign` ✅ |
| non-null assertion | `typescript/no-non-null-assertion` ✅ |
| `process.env` | `node/no-process-env` ✅ (cần `--node-plugin`) |
| filename kebab-case | `unicorn/filename-case` ✅ |
| `any` | `typescript/no-explicit-any` ✅ |
| constant binary expr | `no-constant-binary-expression` ✅ |
| empty block | `no-empty` ✅ |
| `==` | `eqeqeq` ✅ |
| import cycle | `import/no-cycle` ✅ (cần `--import-plugin`) |
| unnecessary condition | `typescript/no-unnecessary-condition` ✅ |
| unused vars/imports/params | **1 rule duy nhất** `no-unused-vars` (options `args`/`varsIgnorePattern`) — Biome tách 3 rule riêng, Oxlint gộp 1 rule cấu hình option |
| `delete obj.x` | **KHÔNG có** — chỉ có `no-delete-var` (khác mục đích: cấm `delete` biến, không phải property) |
| useless ternary | `no-unneeded-ternary` ✅ |
| optional chain | `typescript/prefer-optional-chain` ✅ |
| floating promises | `typescript/no-floating-promises` ✅ (cần `--type-aware` lúc chạy để có type info thật) |
| misused promises | `typescript/no-misused-promises` ✅ |
| await thenable | `typescript/await-thenable` ✅ |
| exhaustive switch | `typescript/switch-exhaustiveness-check` ✅ |
| exhaustive deps (hook) | `react/exhaustive-deps` ✅ (cần `--react-plugin`) |
| rules of hooks | `react/rules-of-hooks` ✅ |
| Next `<img>` | `nextjs/no-img-element` ✅ |
| Next `<head>` | `nextjs/no-head-element` ✅ |
| array index key | `react/no-array-index-key` ✅ |
| CommonJS | `import/no-commonjs` ✅ (khớp `style/noCommonJs` override backoffice) |
| barrel file | `oxc/no-barrel-file` ✅ **CÓ TỒN TẠI** và **bật theo mặc định trong plugin `oxc`** (plugin `oxc` nằm trong nhóm bật sẵn) → **PHẢI tường minh set `"oxc/no-barrel-file": "off"`** khi cấu hình, nếu không 275 barrel file hợp lệ của repo sẽ thành lỗi mới ngay khi bật Oxlint — rủi ro "vỡ trận" ngay từ ngày đầu nếu quên |
| Tailwind class sort | **KHÔNG có rule lint nào** — xác nhận đây thuần là tính năng format-time của Oxfmt, không phải diagnostic lint |
| `noUndeclaredEnvVars` (Turbo domain) | **KHÔNG có** equivalent — gap thật, nhưng giá trị thực tế đã thấp từ trước (turbo.json có `globalPassThroughEnv: ["*"]`) |
| generic AST-restriction (vd cấm indexed-access `T["field"]`) | **KHÔNG có** `no-restricted-syntax` kiểu ESLint core — phải viết JS plugin custom nếu muốn enforce bằng máy |

> Lưu ý phương pháp: `--print-config` chỉ liệt kê rule đang **được kích hoạt** ở mức severity nào đó,
> không tự liệt kê rule "off" — nên phải ép bật `-D all -D nursery` + toàn bộ cờ `--*-plugin` để rule
> nào cũng lộ ra trong catalog rồi mới grep. Cách làm này đáng tin hơn đọc docs suông, và đã lộ ra
> đúng 2 gap quan trọng docs không nói rõ (`noEnum` không có equivalent, `oxc/no-barrel-file` bật theo
> mặc định) — khẳng định giá trị của việc verify bằng lệnh thật thay vì chỉ tra tài liệu, đúng bài học
> đã ghi ở §2.3.

## 4. Sổ rủi ro & gap tổng hợp (Biome → Oxlint/Oxfmt)

Xếp theo mức độ nghiêm trọng với riêng repo này (không phải mức độ chung của Oxc project).

### 4.1. 🔴 Nghiêm trọng — phải xử lý trước khi coi migration là an toàn

| # | Rủi ro | Chi tiết | Hướng xử lý |
|---|---|---|---|
| R1 | `@shadcn/lint` cần JS Plugin API — vẫn "alpha" | Docs Oxc và README `@shadcn/lint` đều tự ghi "currently in alpha" tại 17/09/2026, dù đã public ~6 tháng. Hành vi có thể đổi ở minor release. | Pin version chặt (không `^`/`~`) cho `oxlint` + `@shadcn/lint`; test lại mỗi lần bump. Không phải blocker cứng — README chính chủ nói "dùng được", chỉ chưa semver-stable. |
| R2 | GritQL plugin `no-unscoped-db-mutation.grit` KHÔNG tự migrate được | `biome-to-oxc` tự nhận không migrate GritQL; Oxlint không có DSL tương đương. | Viết lại tay bằng JS plugin (`@oxlint/plugins`, `defineRule`) — 10 pattern AST. Phải pass lại đủ ma trận 14 probe đã dùng để verify bản Biome gốc (`p2-01-test-data-safety-guard.plan.md`), không coi là xong nếu thiếu bước này. |
| R3 | `oxc/no-barrel-file` bật mặc định, sẽ báo lỗi ngay trên 275 barrel file hợp lệ | Xác nhận bằng lệnh thật ở §3.5 — rule tự bật theo default của plugin `oxc` (native, không cần cờ). | Set tường minh `"oxc/no-barrel-file": "off"` trong `.oxlintrc.json` ngay từ bản config đầu tiên, không phải "phát hiện sau khi CI đỏ". |
| R4 | Bump TypeScript `^6.0.3` → `^7.x` là điều kiện bắt buộc cho `--type-aware` | tsgolint yêu cầu tường minh TS 7.0+. Đây là major bump ảnh hưởng toàn bộ 34 package + 14 app, tách biệt hoàn toàn khỏi việc đổi linter/formatter. | Coi là plan độc lập, làm/verify TRƯỚC phần đổi linter. Chuyển `generate:presets` từ `ts-node` sang `tsx` (đã có sẵn devDependency) trước khi bump — ts-node có rủi ro vỡ thật với TS7 (dựa vào TS Compiler API JS-based). |
| R5 | Không có công cụ chính thức migrate Biome → Oxlint | `@oxlint/migrate` (Oxc team) chỉ nhận ESLint. `biome-to-oxc` là tool bên thứ 3: 2 star GitHub, 1 người maintain, ~215 tải/tuần. | Dùng `biome-to-oxc` chỉ để có bản nháp đầu, sau đó review tay từng dòng đối chiếu với đúng 27 rule + 9 override + 1 GritQL plugin hiện có — không tin severity/preset tự map. |

### 4.2. 🟡 Trung bình — mất tính năng hoặc đổi hành vi, cần quyết định đánh đổi

| # | Vấn đề | Đánh đổi |
|---|---|---|
| G1 | Oxfmt vẫn ở bản BETA (khác `oxlint` đã 1.0 stable) | Formatter chạm 100% file mỗi lần save/commit — sai thì đổi code thật, rủi ro cao hơn linter. Phải chạy song song Oxfmt + Biome formatter, diff từng file, review bằng mắt trước khi thay hẳn (tinh thần p0-06). |
| G2 | `oxfmt sortImports` không sort specifier trong `{ }` (issue #20160 còn mở) | Biome `organizeImports` sort cả statement order và specifier trong 1 lần. Muốn giữ hành vi cũ phải phối hợp thêm rule lint `sort-imports` (đã xác nhận tồn tại ở §3.5) với `ignoreDeclarationSort: true` — 2 tool phải đồng bộ cho 1 concern. |
| G3 | Custom group ordering của `organizeImports` (`react → react/** → next/** → package → alias → path`, có `:BLANK_LINE:`) phải viết lại bằng cú pháp khác (`customGroups` + `elementNamePattern` + `internalPattern`, style `eslint-plugin-perfectionist`) | Không phải mapping 1-1 — cần viết lại từ đầu và test bằng mắt trên ít nhất 1 file mỗi archetype (game package, Next.js app, worker Lambda). |
| G4 | `useSortedClasses` chuyển từ LINT rule (có diagnostic review được trong PR) sang FORMAT-time tự sửa lặng lẽ | Không mất tính năng nhưng đổi UX — dev không còn thấy diagnostic trước khi format, cần thông báo team. |
| G5 | `noEnum`, `noDelete` (property), rule AST-restriction chung (§5.4 `code-quality-standards.mdc` — cấm indexed-access `T["field"]`) không có equivalent | Không có rule tương đương lẫn cơ chế `no-restricted-syntax` để cấu hình nhanh — phải viết JS plugin riêng hoặc tiếp tục dựa Cursor rule + review tay (đúng hiện trạng §5.4 vốn "chưa có rule sẵn"). Rủi ro thấp vì 0 vi phạm `enum` hiện tại. |
| G6 | `noUndeclaredEnvVars` (Turbo domain) không có equivalent | Giá trị thực tế đã thấp (turbo.json `globalPassThroughEnv: ["*"]` làm rule gần vô dụng ngay ở Biome). Không đáng chặn migration. |
| G7 | Oxlint type-aware + Turborepo: nested config không được set `options.typeAware` (issue #21426 còn mở) | Không ảnh hưởng nếu giữ nguyên convention hiện tại (1 lệnh `oxlint` chạy ở root, không wrap qua `turbo run lint`) — phải ghi rõ trong Cursor rule mới để không ai "tiện tay" đổi sang chạy qua Turbo. |
| G8 | Nested `.oxfmtrc.json` không được hỗ trợ (giống Oxlint) | Không phải gap mới — Biome hiện tại cũng dùng đúng 1 file root + `overrides[]`. Chỉ đổi cú pháp, không đổi tư duy kiến trúc. |

### 4.3. 🟢 Thấp / trung tính

- Oxlint nhanh hơn ESLint 4x-100x theo benchmark công khai của Oxc team; **không tìm được benchmark
  Oxlint-vs-Biome trực tiếp đáng tin** trong nghiên cứu này — không khẳng định số cụ thể để tránh lặp
  lỗi suy đoán như §2.3.
- Oxfmt hỗ trợ Markdown/YAML — có thể gộp `pnpm format:docs` (Prettier) vào 1 lệnh, giảm 1 tool khỏi
  devDependencies nếu chấp nhận rủi ro beta ở G1.
- Oxlint có nhiều rule khả dụng hơn Biome rất nhiều (đo thật ≥691 rule khi bật đủ plugin cần) — nhưng
  **không nên bật tất cả cùng lúc**, giữ nguyên nguyên tắc đã áp dụng với Biome: chỉ bật rule có số
  liệu khảo sát ripgrep chứng minh giá trị thật trên repo này (`00-overview.md` §4).
- Editor/IDE support (VS Code extension + LSP riêng) chưa kiểm chứng sâu trong phạm vi nghiên cứu này
  — cần dev tự cài thử trước khi rollout toàn team.

## 5. Tích hợp `@shadcn/lint`

### 5.1. Bản chất công cụ (đã đọc README chính thức, không suy đoán)

- Package `@shadcn/lint`, launch ~15/09/2026 (rất mới — 2 ngày trước phiên nghiên cứu này).
- Không phải "lint code shadcn/ui components" theo nghĩa best-practice (khác hẳn
  `eslint-plugin-shadcn` của `kamiya4047` — 1 star, plugin community nhỏ, tập trung rule kiểu
  `data-icon-attribute`, `components-path`). `@shadcn/lint` là **design-system contract enforcement**:
  định nghĩa component nào được đổi style gì qua `className`, phần còn lại báo lỗi kèm hướng dẫn sửa
  đọc trực tiếp từ variant/theme/`components.json` của chính project — định vị rõ ràng là **agent-first**
  (tối ưu cho coding agent tự sửa, không phải chỉ cảnh báo con người).
- 6 rule: `no-restyle` (chặn override style qua `className` ngoài "contract" cho phép),
  `no-raw-colors` (chặn `bg-pink-500` — bắt buộc dùng theme token), `no-arbitrary-values` (chặn
  `p-[13px]`), `no-inline-styles` (chặn `style={{}}`), `no-unknown-classes` (chặn class Tailwind
  không tồn tại), `require-static-classes` (chặn class dựng động không đọc được bằng máy, vd
  `` `bg-${color}` ``).
- **Chạy được trên cả Oxlint và ESLint** — nhưng theo `README` mục "Get started": Oxlint cần
  **≥1.80** (`jsPlugins`), ESLint cần **≥9.30** + `@typescript-eslint/parser`. Repo này hiện **không
  có ESLint** (đã retire hẳn ở p0-05) — dùng nhánh ESLint nghĩa là **khôi phục lại đúng thứ vừa dứt
  bỏ 1 tháng trước**, đi ngược quyết định đã ghi trong `00-overview.md`. Nhánh Oxlint hợp lý hơn nhiều.

### 5.2. Mức độ khớp với repo này

- `apps/backoffice` dùng Next.js + Tailwind v4 + `packages/ui` (chứa component shadcn/ui đã generate
  — chính khu vực đang **tắt hẳn lint/format** trong `biome.json` override
  `"apps/backoffice/src/components/ui/**"`). README có mục **Monorepos** mô tả đúng pattern này: đặt
  `settings.shadcn.ui` trỏ vào prefix import component chung (ví dụ `@/components/ui`), rồi override
  tắt riêng `shadcn/no-restyle` cho chính thư mục chứa component gốc (vì component gốc được sửa style
  hợp pháp, chỉ nơi *dùng* component mới bị giới hạn).
- Cần xác nhận: `apps/backoffice` có `components.json` (chuẩn shadcn CLI) để `@shadcn/lint` tự
  discover theme/component không, hay phải khai `settings.shadcn` tay. **Đã xác nhận: CÓ** —
  `apps/backoffice/components.json` tồn tại, `style: "new-york"`, `tailwind.css:
  "src/app/globals.css"`, `aliases.ui: "@/components/ui"` — khớp chính xác pattern README mô tả
  ("shadcn/ui projects get automatic component and theme discovery via `components.json`"). Nghĩa là
  **không cần khai `settings.shadcn.ui` tay** cho `apps/backoffice` — `@shadcn/lint` tự đọc được
  `@/components/ui` làm prefix component gốc.
- Giá trị nghiệp vụ cụ thể với repo: ngăn AI agent (chính là các phiên làm việc như phiên này) tự tiện
  thêm `className="p-4"` đè lên `<Button>`/`<Card>` khi implement UI mới cho 7 game — đúng nỗi đau mà
  README mô tả ("agents routinely litter frontends with arbitrary utility classes").

### 5.3. Kiến trúc tích hợp đề xuất (không phải plan chi tiết — chỉ hướng)

```
apps/backoffice/.oxlintrc.json (hoặc root .oxlintrc.json với overrides["apps/backoffice/**"])
  jsPlugins: ["@shadcn/lint"]
  settings.shadcn.ui: "@/components/ui"   (hoặc theo components.json nếu có)
  rules["shadcn/no-restyle"]: ["warn", { allow: ["layout"], contracts: [...] }]  ← bắt đầu ở "warn"
  overrides: [{ files: ["apps/backoffice/src/components/ui/**"], rules: { "shadcn/no-restyle": "off" } }]
```

- Chỉ áp dụng cho `apps/backoffice` (app Next.js + Tailwind duy nhất có UI) — **không** áp cho backend
  (`api-*`, `worker-*`) vì không có JSX/Tailwind.
- Bắt đầu ở `"warn"` + `no-restyle`/`no-raw-colors` trước, đo số lượng vi phạm thật (ripgrep-style
  khảo sát, đúng phương pháp `00-overview.md` §4) rồi mới quyết định `"error"` — không bật `"error"`
  ngay cho rule có contract phức tạp (`no-restyle`) vì rất dễ tạo backlog lớn ngay lần đầu chạy trên
  1.103 file `apps/backoffice` hiện có.

## 6. So sánh phương án tổng thể

| Nhu cầu | Biome (hiện tại) | Oxlint + Oxfmt (đề xuất) | ESLint + Prettier (không đề xuất) |
|---|---|---|---|
| Lint | ✅ 1 binary, ổn định 2.5.13 | ✅ Oxlint 1.x stable, nhiều rule hơn | ✅ chuẩn công nghiệp nhưng chậm hơn nhiều |
| Format | ✅ 1 binary, ổn định | 🟡 Oxfmt **beta** | ✅ Prettier stable |
| Type-aware lint | ✅ đã bật, ~75% parity | ✅ 59/61 rule, cần TS7 | ✅ typescript-eslint đầy đủ nhất nhưng chậm |
| Type-check (`tsc`) | Tách biệt (tsc) | Tách biệt (tsc, có thể lên TS7 nhanh hơn) | Tách biệt (tsc) |
| Custom rule nội bộ (test-data-safety) | ✅ GritQL, đã chạy | 🟡 phải viết lại JS plugin | ✅ ESLint custom rule (AST, tương tự effort) |
| `@shadcn/lint` | ❌ không hỗ trợ | ✅ hỗ trợ (alpha JS plugin) | ✅ hỗ trợ (ESLint 9.30+) |
| Công cụ migrate có sẵn | — | 🟡 `biome-to-oxc` (bên thứ 3, non-official) | — |
| Độ trưởng thành tổng thể | Cao (đã đầu tư 1 tháng, đo đạc kỹ) | Trung bình-cao (lint stable, fmt beta, JS-plugin alpha) | Cao nhưng **đã bị retire có chủ đích** |
| Organize imports 1-pass (statement + specifier) | ✅ | ❌ (gap G2, cần 2 tool) | 🟡 (`eslint-plugin-simple-import-sort` + Prettier, cũng 2 tool) |
| Chi phí migration | — | Cao: viết lại GritQL, TS7 bump, review format toàn repo | Rất cao: **đảo ngược quyết định đã làm 1 tháng trước, mất lý do đã ghi ở p0-05** |

**Phương án "giữ Biome, chỉ thêm `@shadcn/lint` qua ESLint song song"** cũng được cân nhắc nhưng **loại
bỏ**: chạy 2 linter cùng lúc (Biome cho phần chung + ESLint chỉ cho `shadcn/*`) tạo 2 nguồn diagnostic,
2 config, đúng kiểu phân mảnh mà chính `00-overview.md` liệt kê là vấn đề cần giải quyết khi retire
ESLint ("một binary, không xung đột"). Nếu đã phải thêm 1 tool ngoài Biome để có `@shadcn/lint`, chọn
Oxlint (đường duy nhất tương thích Biome-adjacent — Rust, nhanh, không quay lại ESLint) hợp lý hơn.

## 7. Đề xuất đã re-review

**Verdict: MIGRATE THEO HƯỚNG TỪNG BƯỚC (phased), KHÔNG "big-bang" — và tách rõ 3 trục độc lập.**

1. **Trục lint** (Biome linter → Oxlint): khả thi, có ROI rõ (mở khoá `@shadcn/lint` + nhiều rule
   hơn). Rủi ro chính là R2 (GritQL rewrite) + R3 (barrel-file default-on) — cả 2 đều **biết trước,
   xử lý được**, không phải rủi ro mù.
2. **Trục format** (Biome formatter + Prettier docs → Oxfmt): **hoãn lại, KHÔNG làm cùng lúc với trục
   lint**. Lý do: Oxfmt còn beta (G1), và formatter đổi sai ảnh hưởng 100% file. Đề xuất: giữ Biome
   formatter thêm 1-2 minor version Oxfmt nữa (chờ tín hiệu "stable" chính thức từ Oxc blog, tương tự
   cách chờ Oxlint 1.0 mới coi là production-ready), hoặc chạy Oxfmt ở nhánh thử nghiệm riêng
   (không merge) để lấy dữ liệu diff thật trước khi quyết định ngày chuyển.
3. **Trục type-check** (TypeScript 6→7): độc lập hoàn toàn, có lợi ích riêng (tsc nhanh hơn 8-12x)
   không phụ thuộc Oxlint. Có thể làm **trước** cả 2 trục trên, làm nền cho type-aware Oxlint sau này.

**Không đề xuất**: quay lại ESLint (mâu thuẫn trực tiếp với quyết định đã có bằng chứng số liệu ở
p0-05); bật toàn bộ 691+ rule Oxlint ngay từ đầu (lặp lại đúng sai lầm đã tránh được khi làm Biome —
chỉ bật rule có khảo sát ripgrep chứng minh giá trị); coi `biome-to-oxc` là nguồn chân lý (chỉ là bản
nháp, luôn phải review tay).

**`@shadcn/lint`**: tích hợp **sau khi** trục lint (Oxlint) đã ổn định trên toàn repo — không tích hợp
trước, vì `@shadcn/lint` phụ thuộc hạ tầng `jsPlugins` của Oxlint, không nên là lý do đầu tiên kéo theo
toàn bộ migration lint nếu chưa cân nhắc đủ 3 trục.

## 8. Câu hỏi mở — cần user quyết trước khi lên plan chi tiết

1. **Chấp nhận bump TypeScript `^6.0.3` → `^7.x` cho toàn monorepo** (34 package + 14 app) như một
   plan riêng, làm trước phần đổi linter? Hay giữ TS6, chỉ dùng Oxlint ở non-type-aware mode (mất hết
   lợi ích tsgolint, chỉ còn phần lint thường)?
2. **Chấp nhận rủi ro Oxfmt beta** để đổi cả formatter, hay giữ Biome-formatter + Prettier(docs), chỉ
   đổi phần **linter** sang Oxlint (kiến trúc lai: Oxlint lint + Biome format)? Biome hỗ trợ chạy độc
   lập từng phần (`biome format` riêng, tắt `linter.enabled`) — khả thi kỹ thuật, cần xác nhận không
   xung đột cache/ignore giữa 2 tool.
3. **`@shadcn/lint` áp dụng ngay từ rule nào** — chỉ `no-restyle` (giá trị cao nhất, rủi ro backlog
   cũng cao nhất) hay bắt đầu từ `no-raw-colors`/`no-arbitrary-values` (an toàn hơn, ít backlog hơn)?
4. **GritQL rewrite (R2) có phải điều kiện chặn (blocker)** hay có thể tạm chấp nhận lớp bảo vệ còn
   lại (Cursor rule `test-data-safety.mdc`) trong giai đoạn chuyển tiếp, viết JS plugin sau?
5. **Ai/khi nào review 100% diff format** nếu vẫn quyết định đổi cả Oxfmt (không chỉ Oxlint)? Repo có
   ~3.122 file — review tay toàn bộ là chi phí thật, cần lên kế hoạch thời gian cụ thể (giống p0-06
   đã làm với Biome).

## 9. Plans phái sinh (khi approved)

Đề xuất tách theo đúng 3 trục ở §7 + phần `@shadcn/lint`, đặt trong
`.cursor/plans/oxlint-migration/` (thư mục riêng vì ≥2 plan phái sinh, theo `.cursor/plans/README.md`):

1. `p0-01-typescript-7-upgrade.plan.md` — bump TS 6→7 toàn repo, chuyển `generate:presets` sang `tsx`
   trước, verify `pnpm check-types` xanh + đo tốc độ trước/sau.
2. `p0-02-oxlint-root-config.plan.md` — cài Oxlint, dùng `biome-to-oxc` lấy bản nháp, review tay 27
   rule + 9 override, xử lý R3 (`oxc/no-barrel-file off`) ngay từ đầu.
3. `p0-03-rewrite-gritql-as-js-plugin.plan.md` — viết lại `no-unscoped-db-mutation` bằng
   `@oxlint/plugins`, pass lại ma trận 14 probe cũ.
4. `p0-04-oxlint-vs-eslint-cutover.plan.md` — tắt Biome linter, bật Oxlint làm nguồn lint chính thức,
   cập nhật `pnpm lint`/`lint-staged`/`biome-lint-conventions.mdc` (đổi tên/nội dung rule).
5. `p1-01-shadcn-lint-integration.plan.md` — tích hợp `@shadcn/lint` cho `apps/backoffice`, bắt đầu ở
   `warn`, khảo sát số lượng vi phạm thật trước khi lên `error`.
6. `p2-01-oxfmt-evaluation.plan.md` (KHÔNG cam kết) — chạy Oxfmt song song, so sánh diff toàn repo,
   quyết định cutover format khi Oxfmt công bố stable.

Mỗi plan PHẢI mở đầu bằng `> Nguồn: .cursor/analysis/system-oxlint-migration.analysis.md` theo quy
ước `.cursor/analysis/README.md`.
