# p1-02 — Tri thức 7 sản phẩm game cho agent: tài liệu staff-facing + số liệu LẤY TỪ CONFIG

> **Nguồn:** `.cursor/plans/ai-panel/00-overview.md` (revision eve-first 14/08/2026) + yêu cầu user 16/08/2026:
> "agent phải hiểu rõ 7 game, cách chơi, nội dung đặt cược, trả thưởng; số liệu động phải lấy từ
> global game config, KHÔNG trả lời theo số mặc định trong tài liệu hoặc theo số của Vietlott".
> **Phụ thuộc:** p0-04 (sandbox + tool render 3 tầng + `clientContext` đã xong). **Độc lập với p1-01** —
> chạy song song được; chỉ giao nhau ở 2 file (`agent/instructions.md`, `tool-renderers/registry.tsx`).
> **Feature slug:** `ai-panel` · tuân `.cursor/plans/README.md`.
> **Revision 16/08/2026 (cùng ngày, sau phản hồi user):** §3 đổi từ "trả JSON config gọn" sang **payload
> tự giải thích** (`label`/`unit`/`note` đi kèm từng giá trị) → nghĩa của số không còn phụ thuộc tên
> field, rename field là lỗi compile chứ không phải doc lệch. Thêm §3.5 (chống dùng lại số cũ trong
> hội thoại) và §5.0 (giải trình: "1 skill/game + nhắc gọi tool" **chưa đủ** để chắc đúng — còn 5
> failure mode). §7.3 rút gọn nhờ thiết kế mới; §2.2 bỏ tên field khỏi doc.

Agent hiện tại (p0-02 → p0-04) biết **đọc số liệu tài chính** nhưng **không biết sản phẩm**. Staff hỏi
"vé Keno bao 8 chọn 5 giá bao nhiêu", "Max 3D Pro trúng ngược thứ tự được bao nhiêu", "Power 6/55
jackpot 2 khi nào tràn" thì model trả lời bằng **kiến thức huấn luyện về Vietlott** — sai hệ thống
MegaWin ở mọi chỗ mà staff đã cấu hình lại. Đây là dạng sai tệ nhất: câu trả lời trôi chảy, đúng
giọng, và không ai kiểm chứng.

Nguyên tắc trung tâm của plan này, mọi mục đều phái sinh từ nó:

> **Tài liệu dạy CƠ CHẾ. Config cấp SỐ. Không bao giờ đảo vai.**

Tài liệu mô tả *cách chơi, nội dung đặt cược, điều kiện trúng, công thức trả thưởng dưới dạng tên
field* — và **không chứa một con số cấu hình nào**. Mọi giá trị (mệnh giá, tiền giải từng hạng, tỷ lệ
hoa hồng/công ty, seed jackpot, ngưỡng split/overflow, trần payout, số kỳ tối đa, giờ quay) chỉ đến
từ tool đọc `GlobalConfigDoc` tại thời điểm hỏi. Tài liệu có số = tài liệu sẽ sai vào ngày staff đổi
config, và không ai biết.

Hệ quả kiến trúc quan trọng: **7 file `.cursor/rules/*-game-rules.mdc` KHÔNG được nạp vào agent.**
Chúng là tài liệu dành cho dev (codebase map, tên collection, đường dẫn use-case, tên hàm) và — quan
trọng hơn — chúng **cố ý chứa giá trị mặc định tham khảo** ("2.000.000.000 (2 tỷ)", "20% revenue",
bảng giá 18 dòng). Nạp vào chính là dạy agent đúng thứ ta đang cấm nó nói. Chúng vẫn giữ nguyên vai
trò coding rule cho dev; plan này tạo **bộ tài liệu thứ hai, staff-facing, không số**.

## Pattern tham chiếu (copy, không sáng tác)

| Việc | File mẫu |
| --- | --- |
| Skill của eve (progressive disclosure, `load_skill`) | `apps/backoffice/node_modules/eve/docs/skills.mdx` |
| Ngân sách context: cái gì vào instructions, cái gì vào skill | `apps/backoffice/node_modules/eve/docs/concepts/context-control.md` §22, §30, §40 |
| Tool mỏng gọi `safeRun()` + `serializeDates` | `apps/backoffice/agent/tools/getFinancialByGame.ts` |
| Use-case app gộp nhiều game bằng `tryLoad` + `Promise.all` | `apps/backoffice/src/app/api/dashboard/jackpots/_lib/get-dashboard-jackpots.ts` |
| Tài liệu staff render trong backoffice + manifest + viewer `/guides` | `packages/ops-docs/src/manifest.ts`, `apps/backoffice/src/app/(main)/guides/` |
| Guard CI khớp file `.md` ↔ manifest | `apps/backoffice/src/scripts/check-docs.ts` |
| Registry render tool + nhãn tiếng Việt (`AiToolName`, `AI_TOOL_LABELS`) | `apps/backoffice/src/components/ai-chat/tool-renderers/registry.tsx` |
| Spec render bảng/số tổng (tầng 1, không viết TSX) | `apps/backoffice/src/components/ai-chat/tool-renderers/report-views.ts` |
| Const object `as const` cho tập giá trị đóng | `packages/game-core/src/entities/game-core.enums.ts` (`GameProduct`) |
| Nhãn game tiếng Việt (KHÔNG tự map lại) | `packages/game-core/src/labels/game-labels.ts` (`GAME_LABELS`) |
| Serialize `Date` → ISO ở biên tool (eve reject `Date`) | `packages/shared/src/utils/serialize.ts` (`serializeDates`) |
| Evals của eve (case + assertion + judge) | `apps/backoffice/node_modules/eve/docs/evals/{overview,cases,assertions}.mdx` |

---

## 0. GATE — nội dung tài liệu đi vào agent bằng đường nào?

Đây là ẩn số kỹ thuật duy nhất của plan, và nó quyết định toàn bộ §2/§6. Phải giải TRƯỚC khi viết
dòng tài liệu nào, vì nó quyết định file `.md` sống ở đâu.

**Ràng buộc đã biết (đo được từ docs bundled + repo, không phải phỏng đoán):**

1. Skill **static markdown** của eve **không cần sandbox** — `load_skill` trả nội dung thẳng từ agent
   đã compile (`skills.mdx:12`). Skill **packaged** (thư mục + `references/`) cần sandbox để đọc
   sibling file → tránh: sandbox repo là `deny-all` + bootstrap assertion, tốn cold-start mỗi turn.
2. 7 file `.mdc` hiện tại = **2.758 dòng / ~145 KB (~36–40k token)**. Nhồi vào `instructions.md` là
   ~38k token **mỗi model call**, không bao giờ bị compaction cắt (system-role nằm ngoài history) →
   loại thẳng, không cần spike.
3. Tài liệu staff hiện hữu (`packages/ops-docs`) nạp `.md` vào backoffice **build-time qua raw-loader
   của Next** (`apps/backoffice/next.config.ts` §20–24). eve compile `agent/` bằng bundler riêng —
   **chưa biết** nó có loader `.md` hay không.

**Việc của GATE:** xác định cách để **một** bản markdown vừa render ở `/guides` (staff đọc) vừa vào
được skill của agent (model đọc), **không duplicate nội dung**.

| # | Phương án | Cách thử | Rủi ro / chi phí |
| --- | --- | --- | --- |
| A | `agent/skills/<game>.md` là **file gốc duy nhất**; `/guides` import ngược từ `agent/skills/` qua raw-loader | Thêm 1 file `.md` thật + gọi `load_skill` trong `eve dev`; import cùng file vào 1 page `/guides` | Tài liệu sản phẩm nằm trong `agent/` — sai chỗ về mặt kiến trúc (agent là consumer, không phải chủ sở hữu tài liệu). `ops-docs` mất vai trò SSOT |
| B | Gốc ở `packages/ops-docs/docs/games/<game>/*.md`; `agent/skills/<game>.ts` dùng `defineSkill({ markdown })` với `markdown` **import thẳng file `.md`** từ package | Viết 1 skill `.ts` import `@megawin/ops-docs/docs/games/keno/cach-choi.md`, chạy `eve dev` → `load_skill` | **Đây là điểm chưa biết.** Nếu bundler eve không có loader `.md` → build fail hoặc trả `[object Module]`. Phải đo, không đoán |
| C | Gốc ở `ops-docs` như B, nhưng thêm **codegen** `packages/ops-docs/src/content.generated.ts` (`Record<file, string>`), commit vào repo; cả `/guides` và `agent/skills/*.ts` đọc từ TS module đó | Viết script `scripts/generate-docs-content.ts` + kiểm tra freshness trong `docs:check` | Thêm 1 artifact generated phải giữ đồng bộ. Bù lại: **không phụ thuộc loader của bất kỳ bundler nào** — chạy chắc ở cả Next, eve, vitest |

**Thứ tự thử: B → C.** B là sạch nhất (không artifact generated). Nếu B fail, C là **fallback đã
biết chắc chạy** (chỉ là TS string module). A chỉ dùng nếu cả B và C vỡ vì lý do ngoài dự kiến.

**Exit criteria của GATE (phải có bằng chứng, không tick bằng mắt):**

- [ ] `eve dev` boot được với 1 skill thật; hỏi câu kích hoạt → log cho thấy `load_skill` được gọi và
      **nội dung markdown đúng** xuất hiện trong context (không phải `[object Module]`, không rỗng).
- [ ] Cùng file `.md` đó render đúng ở `/guides` (chụp lại 1 dòng nội dung khớp cả 2 nơi).
- [ ] Đo **token thật** của 1 doc game khi `load_skill` (đọc usage của turn trước/sau) — dùng số này
      chốt §2.2 (trần độ dài doc).
- [ ] Ghi kết quả B/C vào bảng ngay dưới đây, kèm ngày. Fail thì ghi rõ lỗi, không xoá phương án.

| Phương án | Kết quả | Bằng chứng | Ngày |
| --- | --- | --- | --- |
| B (`defineSkill` import `.md`) | ✅ PASS | `apps/backoffice/agent/skills/gate-test.ts` import `../../../../packages/ops-docs/docs/games/keno/gate-test.md?raw`, `npx eve build` xanh; `.output/.eve/compile/workspace-resources/__root__/skills/gate-test/SKILL.md` sinh ra chứa đúng nguyên văn nội dung markdown gốc (không `[object Module]`, không rỗng). Cross-package relative import (`apps/backoffice/agent/` → `packages/ops-docs/`) qua `?raw` KHÔNG bị package-boundary plugin chặn vì asset-import plugin resolve trước. Test file đã xoá sau khi xác nhận | 16/08/2026 |
| C (codegen `content.generated.ts`) | Không cần — B pass | — | — |

**Quyết định: dùng B.** Gốc tài liệu ở `packages/ops-docs/docs/games/`; mỗi `agent/skills/<game>.ts`
dùng `defineSkill({ markdown: <import "...md?raw"> })`. `/guides` đọc **cùng file `.md`** qua raw-loader
Next hiện có (`apps/backoffice/next.config.ts`) — một bản, không duplicate, không codegen.

---

## 1. Số STRUCTURAL vs số CONFIG — bảng phân định (nền tảng của mọi doc)

Đây là mục quan trọng nhất của plan. Người viết doc PHẢI tra bảng này trước khi gõ bất kỳ chữ số nào.

**Định nghĩa:**

- **STRUCTURAL** — bất biến theo luật chơi/thuật toán, nằm trong code domain (`packages/game-*/rules`),
  staff **không** đổi được qua backoffice. Được phép viết thẳng trong doc.
- **CONFIG** — nằm trong `GlobalConfigDoc`, staff đổi được qua UI config. **CẤM** viết số trong doc;
  chỉ được viết **tên field** và bắt agent gọi tool.
- **SNAPSHOT** — giá trị đã đóng băng vào kỳ quay/vé lúc phát sinh (vd `companyTakeRate` trong
  `DrawFinancial`, `commissionRate` snapshot lúc place-bet). Câu hỏi về **kỳ đã settle** phải lấy từ
  báo cáo kỳ đó, **KHÔNG** từ config hiện hành — config có thể đã đổi sau đó.

### 1.1 STRUCTURAL — được viết số trong doc

| Nhóm | Ví dụ cụ thể | Vì sao bất biến |
| --- | --- | --- |
| Không gian số | Lotto 5/35: 5 số từ 1–35 + 1 số đặc biệt · Mega 6/45: 6 từ 1–45 · Power 6/55: 6 từ 1–55 + bonus · Keno: chọn 1–10 số trong 1–80, quay 20 · Max 3D/Pro: bộ ba 000–999 · Bingo 18: 3 số từ {1..6}, tổng 3–18 | Định nghĩa game, nằm trong schema/rules |
| Cấu tạo kết quả quay | Max 3D/Pro: 20 bộ ba (2 ĐB + 4 Nhất + 6 Nhì + 8 Ba) | Hằng trong `flattenDrawResult()` |
| Số hạng giải & điều kiện trúng | Max 3D Pro có 8 hạng; ĐB = đúng thứ tự, phụ ĐB = ngược thứ tự; Lotto 5/35 có tier1–tier5 + consolation | Enum `PrizeTier` + `matchPair()`/`matchBoard()` |
| Công thức đếm line | Bao N của Max 3D Pro: `P(n,2) = n×(n−1)` · bao số của game jackpot: `C(n,k)` · hoán vị 3 chữ số: 6/3/1 | `calculateLineCount()`, `expandSelectionToPairs()` |
| Quy tắc gộp/loại trừ giải | Max 3D Pro: 8 hạng **không** loại trừ, lĩnh tổng; bipartite matching mỗi entry dùng 1 lần; duplicate ĐB = `special + specialSub` (không ×2) | `rules/prize-tiers.ts` |
| Ranh giới sidebet | Keno Lớn/Nhỏ: mốc 40 (`KENO_BIG_SMALL_BOUNDARY`) | Hằng export trong domain |
| Định dạng | `drawId` = `YYYY-MM-DD.NNN` · `ticketNo` = `{PREFIX}-{YYYYMMDD}-{NNNNN}` | Convention hệ thống |
| Ngày tài chính | Đổi lúc 11:00 giờ VN | Hằng hệ thống (đã có trong `instructions.md` rule 5) |

### 1.2 CONFIG — CẤM viết số, chỉ viết tên field + bắt gọi tool

Đường dẫn field dưới đây là **API mà doc được phép nhắc tới** (dạng `play.unitPrice`), và cũng là
`section` của tool `getGameConfig` ở §3.

| Nhóm số liệu | Field trong `GlobalConfigDoc` | Game áp dụng |
| --- | --- | --- |
| Mệnh giá 1 line | `play.unitPrice` | 7/7 |
| Trần/sàn `betCount` | `play.minBetCount`, `play.maxBetCount` | 7/7 |
| Số board tối đa / vé | `play.maxBoardsPerTicket` (lotto535, mega645, power655, max3d, max3dpro) · `play.maxBasicBoardsPerTicket` (keno, bingo18) | 7/7, **khác tên** |
| Số kỳ liên tiếp tối đa | `play.maxDrawCount` | 7/7 |
| Đóng bán trước giờ quay | `play.salesCloseBeforeMinutes` (3 game jackpot, max3d, max3dpro) · `play.salesCloseBeforeSeconds` (keno, bingo18) | 7/7, **khác đơn vị** |
| Lịch quay | `play.drawsPerDay` + `play.drawTimes[]` (game jackpot/max3d/max3dpro) · `play.drawIntervalMinutes` + `play.firstDrawTime` + `play.lastDrawTime` + `play.timezone` (keno, bingo18) | 7/7, **khác mô hình** |
| Hoa hồng đại lý mặc định | `rates.defaultCommissionRate` (override per tenant ở `TenantConfigDoc`) | 7/7 |
| Tỷ lệ công ty thu | `rates.companyRate` | **CHỈ** lotto535, mega645, power655 |
| Giải cố định theo tier | `defaultPrizes.tier1..tier5`, `defaultPrizes.consolation` (lotto535) · `defaultPrizes.tier1..tier3` (mega645, power655) | 3 game jackpot |
| Giải Max 3D | `defaultPrizes.basic.*`, `defaultPrizes.combo.*`, `defaultPrizes.plus.*` | max3d |
| Giải Max 3D Pro | `defaultPrizes.special`, `.specialSub`, `.first`…`.sixth` | max3dpro |
| Bảng giải Keno | `basicPrizes[pickSize][matchCount]`, `bigSmallPrizes.*`, `evenOddPrizes.*` | keno |
| Trần payout Keno | `payoutCaps.pick8MaxPerDraw`, `pick8MaxSetsForFixed`, và tương tự pick9/pick10 | keno |
| Bảng giải Bingo 18 | `singleNumPrizes`, `doubleMatchPrizes`, `tripleMatchPrizes`, `sumTotalPrizes`, `bigSmallDrawPrizes` | bingo18 |
| Jackpot — seed & chia | `jackpot.seedAmount` (mega645) · `jackpot.seedAmount` + `jackpot.splitThreshold` + `jackpot.splitRatios.tier1..tier5` (lotto535) · `jackpot.jackpot1.seedAmount` + `jackpot.jackpot2.seedAmount` + `jackpot.jp1ContributionRatio` + `jackpot.jp2ContributionRatio` + `jackpot.jp1OverflowThreshold` (power655) | 3 game jackpot, **shape khác nhau** |
| Ngưỡng alert vận hành | `ops.alerts.*`, `ops.stats.*` | 7/7 |

### 1.3 Ba cái bẫy phải nói rõ trong doc, không để model tự suy

1. **Jackpot hiện tại ≠ config.** `jackpot.seedAmount` là **mức seed khi mở chu kỳ mới**, không phải
   số tiền đang tích luỹ. Staff hỏi "jackpot Mega bây giờ bao nhiêu" → phải gọi tool jackpot (§3.3),
   KHÔNG đọc config, KHÔNG cộng nhẩm.
2. **Kỳ đã settle dùng SNAPSHOT.** "Kỳ hôm qua trả tier1 bao nhiêu" → lấy từ báo cáo/kết quả kỳ đó.
   Config hiện hành chỉ đúng cho **kỳ chưa settle**. Doc phải ghi thẳng câu này, mỗi game.
3. **Hoa hồng thực tế theo tenant.** `rates.defaultCommissionRate` là **mặc định hệ thống**; đại lý
   cụ thể có thể được override ở `TenantConfigDoc`. Câu hỏi về 1 đại lý cụ thể → không được trả lời
   bằng số mặc định.

### 1.4 Số DẪN XUẤT — không được viết, cũng không được nhẩm

Giá vé bao N, tổng số line, xác suất, RTP, tiền hoa hồng: **không** thuộc doc và **không** thuộc
config — chúng là kết quả tính. Doc chỉ ghi **công thức bằng tên field**
(`tiền board = lineCount × betCount × play.unitPrice`). Việc tính do §4 (tool) hoặc `python3` trong
sandbox làm (`instructions.md` rule 2 đã bắt buộc). Bảng giá 18 dòng như trong `.mdc` hiện tại
**KHÔNG được xuất hiện** trong doc staff — nó là `unitPrice` mặc định nhân sẵn, tức số config hoá đá.

---

## 2. Bộ tài liệu — vị trí, template, nội dung bắt buộc

### 2.1 Vị trí & phạm vi

Gốc tài liệu ở `packages/ops-docs` (giả định GATE chọn B hoặc C):

```
packages/ops-docs/docs/games/
├── _chung/
│   ├── tu-vung.md            # từ vựng: board, line, entry, betCount, betUnitCount, draw, kỳ liên tiếp
│   ├── vong-doi-ve.md        # place-bet → chờ quay → settle → payout; void & hoàn tiền
│   └── tai-chinh.md          # revenue → commission → prizes → (jackpot contribution) → profit
├── keno/{tong-quan,cach-choi,tra-thuong}.md
├── lotto535/{tong-quan,cach-choi,tra-thuong}.md
├── mega645/{tong-quan,cach-choi,tra-thuong}.md
├── power655/{tong-quan,cach-choi,tra-thuong}.md
├── max3d/{tong-quan,cach-choi,tra-thuong}.md
├── max3dpro/{tong-quan,cach-choi,tra-thuong}.md
└── bingo18/{tong-quan,cach-choi,tra-thuong}.md
```

**Vì sao 3 file/game chứ không 1 file to:** ngân sách context. Câu hỏi "bao 12 số Mega giá bao nhiêu"
chỉ cần `cach-choi`; câu "trúng 4 số được gì" chỉ cần `tra-thuong`. Chia 3 giữ mỗi lần `load_skill`
gọn (mục tiêu **≤ 250 dòng / file**, chốt lại bằng số token đo ở GATE). Ngược lại, chia nhỏ hơn nữa
(mỗi cách chơi 1 file) làm routing hint mờ → model load sai file.

**Vì sao đặt ở `ops-docs` chứ không `agent/`:** package này đã là hệ tài liệu staff có viewer `/guides`,
manifest registry, guard CI. Staff cần đọc chính những tài liệu này — nếu chỉ có agent đọc được thì ta
vừa tạo tri thức không ai kiểm tra được. Một bản, hai người đọc: **staff qua `/guides`, model qua
`load_skill`**. Doc sai thì staff phát hiện, không phải chờ agent trả lời sai mới biết.

### 2.2 Template bắt buộc cho mỗi file `<game>/<topic>.md`

```markdown
---
description: <Câu routing cho model — viết dạng "Dùng khi nhân viên hỏi về …">
---

# <Tên game từ GAME_LABELS> — <Chủ đề>

> **Số liệu trong tài liệu này:** tài liệu chỉ mô tả cơ chế. Mọi con số (mệnh giá,
> tiền giải, tỷ lệ, ngưỡng, giờ quay) PHẢI lấy bằng `getGameConfig` cho game này
> **trong chính lượt trả lời**. Không dùng số của Vietlott, không dùng số nhớ,
> không dùng lại số của lượt trước.

## Nội dung đặt cược
<Người chơi chọn gì, đơn vị cược là gì, board/line/entry quan hệ ra sao — STRUCTURAL>

## Số liệu cần tra cấu hình
| Ý nghĩa | Lấy ở đâu |
| --- | --- |
| Mệnh giá 1 line | `getGameConfig` section `play` |
| Tiền từng hạng giải | `getGameConfig` section `prizes` |

## Điều kiện trúng & cách trả thưởng
<Bảng: Hạng giải | Điều kiện (STRUCTURAL) | Ghi chú>

## Câu hỏi thường gặp của nhân viên
<3–6 câu hỏi thật + đường trả lời: cần tool nào, cần tính gì>

## Lưu ý dễ sai
<Bẫy đặc thù game: gộp giải, duplicate, snapshot kỳ đã settle, ordered pair…>
```

**Ràng buộc soạn thảo (kiểm bằng §7, không bằng thiện chí):**

- Bảng "Điều kiện trúng" có cột điều kiện, **KHÔNG** có cột giá trị tiền.
- **KHÔNG viết đường dẫn field** (`play.unitPrice`, `jackpot.seedAmount`) — chỉ viết **ý nghĩa** +
  **section cần gọi**. Nghĩa/đơn vị của số do payload tool mang theo (§3.2), nên doc ghi tên field chỉ
  tạo thêm một chỗ phải đồng bộ khi rename. Đây là điểm **đổi so với bản plan đầu**, xem §7.3.
- Không tên collection Mongo, không đường dẫn `packages/…`, không tên class/use-case, không tên hàm.
  Staff không cần và nó ăn token. (Khác biệt cốt lõi so với `.mdc` dev.)
- Không nhắc "Vietlott" như nguồn số. Được nhắc như bối cảnh sản phẩm gốc, kèm câu: giá trị của
  MegaWin do config quyết định, có thể khác.
- Tiếng Việt, câu ngắn. Thuật ngữ giữ tiếng Anh theo convention repo (`board`, `line`, `entry`,
  `settle`, `void`, `payout`, `jackpot`, `betCount`).

### 2.3 Nội dung đặc thù phải phủ cho từng game

Bảng này là checklist nội dung — thiếu dòng nào là doc chưa xong. Cột "Bẫy phải viết" lấy từ chính
`.mdc` dev (dịch sang ngôn ngữ staff, **bỏ hết số**).

| Game | Nội dung đặt cược (STRUCTURAL) | Cách chơi phải phủ | Bẫy phải viết |
| --- | --- | --- | --- |
| Keno | Chọn 1–10 số trong 1–80; quay 20 số; sidebet Lớn/Nhỏ, Chẵn/Lẻ | Board cơ bản theo pick size; 2 loại sidebet; kỳ quay theo chu kỳ phút | Bảng giải là ma trận `pickSize × matchCount`; **trần payout pick 8/9/10** (`payoutCaps`) làm giải cố định bị hạ khi vượt ngưỡng — staff hay hỏi "sao trả ít hơn bảng"; mốc Lớn/Nhỏ là 40 |
| Lotto 5/35 | 5 số chính + 1 số đặc biệt | Standard + bao; kỳ liên tiếp | Có **split jackpot** khi vượt `jackpot.splitThreshold` → chia theo `jackpot.splitRatios` cho tier1..tier5; consolation là hạng riêng |
| Mega 6/45 | 6 số từ 1–45 | Standard + bao | Jackpot đơn, chỉ `jackpot.seedAmount`; tier1..tier3 cố định; tier jackpot **không** nằm trong `defaultPrizes` |
| Power 6/55 | 6 số từ 1–55 + bonus | Standard + bao | **2 jackpot**; `jp1ContributionRatio`/`jp2ContributionRatio`; **overflow** khi JP1 vượt `jp1OverflowThreshold` — cơ chế này staff hỏi nhiều nhất |
| Max 3D | Bộ ba 000–999; kết quả 20 bộ | basic + plus; combo3/combo6 | **3 bảng giải riêng** (`basic`/`combo`/`plus`) — trả lời sai bảng là sai tiền; lịch quay khác Max 3D Pro |
| Max 3D Pro | **Cặp ordered** 2 bộ ba; kết quả 20 bộ | multiNumber (bao 3–20 bộ, `P(n,2)`) + multiDigit (hoán vị chữ số, tích Descartes) | ĐB = đúng thứ tự, **phụ ĐB = ngược thứ tự**; 8 hạng **gộp giải, không loại trừ**; duplicate ĐB = `special + specialSub` (không ×2), duplicate hạng khác = ×2; bipartite matching |
| Bingo 18 | 3 số từ {1..6}, tổng 3–18 | Single/double/triple match, tổng, Lớn/Nhỏ/Hoà | 5 bảng giải riêng; kỳ quay theo chu kỳ phút giống Keno |
| `_chung` | — | `betCount` vs `lineCount` vs `betUnitCount`; board A–D; kỳ liên tiếp; void draw-level | `betUnitCount = Σ(lineCount × betCount)` là cơ sở tính tiền — staff nhầm với số line; commission snapshot lúc place-bet |

### 2.4 Đăng ký vào manifest + `/guides`

`packages/ops-docs/src/manifest.ts` hiện chỉ có 3 game jackpot với topic `resettle`. Cần:

- Thêm 4 `RunbookGame` mới: `keno`, `max3d`, `max3dpro`, `bingo18` (`gameKey` phải khớp biến CSS
  `--color-game-{gameKey}` trong `globals.css` — kiểm tra trước, thiếu thì thêm).
- Thêm topic `san-pham` (title "Sản phẩm & cách chơi") vào **cả 7** game, mỗi topic 3 doc.
- Dùng helper dựng theo convention như `buildResettleTopic(gameKey)` — viết `buildProductTopic(gameKey)`,
  KHÔNG liệt kê tay 21 entry.
- `apps/backoffice/src/app/(main)/guides/_lib/docs-content.ts` hiện import raw **thủ công từng file**
  (9 dòng). Thêm 21 doc = 21 dòng import tay. Nếu GATE chọn C (codegen), file này chuyển sang đọc
  `content.generated.ts` — dọn luôn cả 9 import cũ.
- `_lib/game-meta.ts`: thêm icon + màu cho 4 game mới.
- `pnpm --filter @megawin/backoffice docs:check` phải xanh (guard 2 chiều file ↔ manifest đã có sẵn,
  tự phủ doc mới — **không cần sửa script**).

---

## 3. `getGameConfig` — nguồn DUY NHẤT của mọi con số cấu hình

### 3.1 Use-case gộp ở tầng app

`game-core-application` **không** phụ thuộc 7 package `game-*-application` (đã kiểm: `package.json`
chỉ có `game-core`, `data`, `app-core`, `tenant-gateway`) → **không** đặt use-case ở đó. Đúng chỗ theo
`app-use-case-layering.mdc` §1 là app:

```
apps/backoffice/src/use-cases/game-config/
├── get-game-config-snapshot.ts       # UseCase<Input, Output>
└── get-game-config-snapshot.types.ts # Input/Output (flat, chưa đủ ngưỡng tách dto/)
```

Đây là thư mục `src/use-cases/` **đầu tiên** của backoffice (các aggregate cũ nằm trong
`app/api/**/_lib/` vì gắn với route). Use-case này **không thuộc route nào** — consumer là tool AI →
đặt trong `_lib` của một route bất kỳ là sai chỗ. `app-use-case-layering.mdc` §1 đã cho phép đúng
đường dẫn này.

Nội dung: dispatch theo `GameProduct` sang `GetGlobalConfigUseCase` của game tương ứng (cả 7 game
**cùng tên export**, import từ `@megawin/game-<game>-application/use-cases/game-config`), bọc
`tryLoad(..., { scope, source: game })` như `GetDashboardJackpotsUseCase`. Registry dispatch là
`Record<GameProduct, () => Promise<...>>` — compiler bắt thiếu game khi `GameProduct` thêm entry.

### 3.2 Output PHẢI tự giải thích — không trả JSON config thô

Trả nguyên `GlobalConfigEntity` sai ở **hai** điểm, không phải một:

1. **Nổ token.** Keno có cả ma trận `basicPrizes` (10 pick × ~11 mức trùng) + `ops.alerts.enabled`
   (Record theo alert type) — vài nghìn token cho một câu hỏi về mệnh giá.
2. **Con số không tự nói nó là gì.** `{ "companyRate": 0.32 }` — 32% của cái gì? `0.32` hay `32`?
   `{ "salesCloseBeforeSeconds": 90 }` vs `{ "salesCloseBeforeMinutes": 5 }` — model phải suy đơn vị
   **từ tên field**. Suy đúng thì may, suy sai thì ra câu trả lời sai đơn vị mà nghe rất tự nhiên. Tệ
   hơn: khi field bị đổi tên, model mất luôn cả nghĩa lẫn đơn vị.

Nên output là **danh sách item đã gắn nhãn/đơn vị/ghi chú**, không phải shape của DB:

```ts
/** Đơn vị của một giá trị cấu hình — model KHÔNG phải suy từ tên field. */
const ConfigUnit = {
  Vnd: "VND", // tiền, integer VND
  Ratio: "ratio", // 0..1 — model PHẢI ×100 khi nói phần trăm
  Count: "count", // số lượng (board, kỳ, line)
  Minutes: "minutes",
  Seconds: "seconds",
  TimeOfDay: "time", // "HH:mm"
  Timezone: "timezone",
  Flag: "flag",
} as const;
type ConfigUnit = (typeof ConfigUnit)[keyof typeof ConfigUnit];

interface ConfigItem {
  /** Đường dẫn field — dùng cho traceability/deep-link. KHÔNG phải thứ model dựa vào để hiểu nghĩa. */
  key: string;
  /** Nhãn tiếng Việt — ĐÂY là nguồn nghĩa cho model. VD "Mệnh giá 1 line". */
  label: string;
  value: number | string | boolean;
  unit: ConfigUnit;
  /** Ghi chú nghiệp vụ khi giá trị dễ bị hiểu sai. VD ở `jackpot.seedAmount`. */
  note?: string;
}

/** Bảng giải nhiều chiều (ma trận Keno, 5 bảng Bingo 18) — item phẳng không mô tả nổi. */
interface ConfigTable {
  key: string;
  label: string;
  unit: ConfigUnit;
  note?: string;
  columnLabels: readonly string[];
  rows: readonly { rowLabel: string; values: readonly number[] }[];
}
```

**Đây là chỗ giải quyết trực tiếp vấn đề "đổi tên field":** nghĩa của con số đi **kèm con số** trong
payload, không nằm rải rác trong tài liệu. Đổi `jp1OverflowThreshold` thành tên khác thì `label`
("Ngưỡng tràn Jackpot 1") và `unit` (`VND`) không đổi → câu trả lời vẫn đúng. Tài liệu §2 nhờ đó
**không cần viết tên field nữa**, chỉ cần viết nghĩa — bớt đúng một loại coupling (xem §7.3 đã được
đơn giản hoá theo thiết kế này).

**Compiler là guard, không phải test parse markdown.** Descriptor được viết dưới dạng hàm
**dereference field thật**, nên đổi/xoá field là **lỗi compile ngay tại descriptor**:

```ts
// apps/backoffice/src/use-cases/game-config/descriptors/power655.ts
export function describePower655Jackpot(c: Power655GlobalConfigEntity): ConfigItem[] {
  return [
    item("jackpot.jackpot1.seedAmount", "Seed Jackpot 1 khi mở chu kỳ mới", c.jackpot.jackpot1.seedAmount, ConfigUnit.Vnd, {
      note: "Đây là mức seed khi bắt đầu chu kỳ mới, KHÔNG phải số tiền jackpot đang tích luỹ. Muốn biết số hiện tại: dùng getGameJackpot.",
    }),
    item("jackpot.jp1OverflowThreshold", "Ngưỡng tràn Jackpot 1", c.jackpot.jp1OverflowThreshold, ConfigUnit.Vnd),
    item("jackpot.jp1ContributionRatio", "Tỷ lệ trích doanh thu vào Jackpot 1", c.jackpot.jp1ContributionRatio, ConfigUnit.Ratio),
  ];
}
```

`c.jackpot.jp1OverflowThreshold` là truy cập property thật → rename ở entity làm đỏ ngay dòng này.
Chuỗi `"jackpot.jp1OverflowThreshold"` chỉ để hiển thị; lệch thì cosmetic, không sai nghĩa.

### 3.3 Input + khối `meta` — model phải biết nó CHƯA có gì

```ts
const GameConfigSection = {
  Play: "play", // mệnh giá, betCount, board, kỳ, lịch quay
  Rates: "rates", // hoa hồng mặc định, companyRate (nếu có)
  Prizes: "prizes", // defaultPrizes / bảng giải riêng theo game
  Jackpot: "jackpot", // CHỈ lotto535, mega645, power655
  Ops: "ops", // ngưỡng alert vận hành
} as const;
```

Input: `{ game: GameProduct, sections?: GameConfigSection[], pickSize?: number }`.

- `sections` mặc định `["play", "rates"]` — bộ hay hỏi nhất, giữ turn thường rẻ.
- `pickSize` chỉ có nghĩa với Keno `Prizes` → trả 1 hàng của ma trận thay vì cả bảng.
- `Prizes` **discriminate theo game**: `defaultPrizes` (5 game) vs `basicPrizes`/`bigSmallPrizes`/
  `evenOddPrizes`/`payoutCaps` (keno) vs 5 bảng của bingo18. **KHÔNG** dựng shape chung "cho gọn" —
  gộp lại là chỗ sinh ra câu trả lời sai bảng.

Output kèm `meta` — phần này quan trọng ngang danh sách item:

```ts
interface GameConfigMeta {
  game: GameProduct;
  /** Từ GAME_LABELS, KHÔNG tự map lại. */
  gameLabel: string;
  /** GlobalConfigDoc.version — mốc để staff đối chiếu khi tranh luận số. */
  configVersion: number;
  /** Lần cuối staff sửa config (ISO). */
  updatedAt: string;
  /** Thời điểm tool đọc (ISO) — cơ sở cho rule chống dùng số cũ, xem §3.5. */
  fetchedAt: string;
  sectionsReturned: readonly GameConfigSection[];
  /** Section game này CÓ nhưng lần gọi này KHÔNG lấy → model biết phải gọi lại, không suy đoán. */
  sectionsNotFetched: readonly GameConfigSection[];
  /** Section game này KHÔNG có (vd `jackpot` với Keno) → model biết trả lời "game này không có", không bịa. */
  sectionsNotApplicable: readonly GameConfigSection[];
}
```

`sectionsNotFetched` + `sectionsNotApplicable` là hai field chống bịa. Không có chúng, model hỏi
`play` rồi được hỏi tiếp về tiền giải sẽ có xu hướng **trả lời bằng ký ức** thay vì gọi lại tool —
vì payload không nói gì về việc nó đang thiếu dữ liệu.

`serializeDates` **bắt buộc** (`updatedAt` là `Date`; eve reject `Date` ở biên tool — bài học p0-02
ghi trong `getSystemOutstanding.ts`).

### 3.4 `getGameJackpot` — số đang tích luỹ (khác hẳn config)

Tool riêng, **không** gộp vào `getGameConfig`: config là thiết lập, jackpot là số dư live. Dùng lại
`GetDashboardJackpotsUseCase` (`app/api/dashboard/jackpots/_lib/`) — đã gộp 3 game bằng `tryLoad`, đã
có DTO `details` dẫn xuất bằng `Omit<>`. Input `{ game?: JackpotGameProduct }`.

Output dùng **cùng contract** `ConfigItem` (`label`/`unit`/`note`) để model không phải học 2 shape, và
**bắt buộc** có:

| Item | `label` | `note` bắt buộc |
| --- | --- | --- |
| Số đang tích luỹ | "Jackpot đang tích luỹ" | "Đây là số hiện tại, đọc lúc `asOf`. KHÔNG phải mức seed trong cấu hình." |
| Chu kỳ | "Chu kỳ jackpot hiện tại" | — |
| Ngưỡng liên quan | "Ngưỡng chia giải" / "Ngưỡng tràn JP1" | "Lấy từ cấu hình, không phải số tích luỹ" |
| `asOf` (trong `meta`) | — | Mốc đọc số — staff hỏi lại sau 10 phút thì số có thể đã khác |

Power 6/55 trả **2 khối** (JP1, JP2) với `label` phân biệt rõ — trả gộp một số là lỗi nghiệp vụ.

> Nếu use-case còn nằm trong `_lib` của route mà tool import trực tiếp thấy chướng: **không** copy
> logic sang `src/use-cases/`. Di chuyển file + sửa import của route (1 chỗ) — hai consumer dùng chung
> một use-case, không nhân bản.

### 3.5 Chống dùng lại số CŨ trong cùng hội thoại

Đây là failure mode mà "1 skill/game + nhắc gọi tool" **không** che được: model gọi tool ở lượt 2,
staff sửa config ở lượt 5, model trả lời lượt 6 bằng số còn trong history. Số đó có `version` và
`updatedAt` nên nghe càng đáng tin.

Ba lớp chặn:

1. `meta.fetchedAt` trong mọi payload (§3.3) → có mốc để so.
2. Rule trong `instructions.md` (§5.2): kết quả `getGameConfig`/`getGameJackpot` chỉ dùng lại **trong
   cùng lượt**. Sang lượt mới mà câu hỏi lại cần số cấu hình → **gọi lại**, kể cả khi lượt trước đã có.
   Jackpot thì luôn gọi lại (số dư live).
3. Card render (§3.6) hiện `fetchedAt` + `configVersion` cho **staff** thấy — người là lớp kiểm cuối,
   staff vừa sửa config sẽ nhận ra ngay số cũ.

Chi phí gọi lại: 1 tool call/lượt, output đã gọn nhờ `sections`. Rẻ hơn nhiều so với một lần trả sai
số tiền giải.

### 3.6 Wiring UI

- `AiToolName` (`tool-renderers/registry.tsx`): thêm `GameConfig: "getGameConfig"`,
  `GameJackpot: "getGameJackpot"`. Kiểu `Record<AiToolName | EveBuiltinToolName, string>` sẽ **bắt
  compile** nếu quên nhãn — đúng thiết kế sẵn có.
- `AI_TOOL_LABELS`: `"Cấu hình game"`, `"Jackpot hiện tại"`.
- Renderer: dùng **tầng 1** (`specRenderer` + `defineToolView` trong `report-views.ts`) — `ConfigItem[]`
  map thẳng thành bảng 3 cột **Nhãn · Giá trị · Ghi chú** (format theo `unit`: `VND` phân tách hàng
  nghìn, `ratio` ×100 thành `%`). `ConfigTable` render thành bảng ma trận. Không cần TSX bespoke.
- Card **phải hiện** `configVersion` + `fetchedAt` (và `asOf` với jackpot) ở phần phụ đề — staff là lớp
  kiểm cuối cho số cũ (§3.5 lớp 3).
- Deep-link `/games/{game}/config` để staff bấm xem/sửa trực tiếp.
- Tên tool trong `AiToolName` **phải khớp tên file** `agent/tools/getGameConfig.ts` (p0-02 §3).

---

## 4. `previewBetCost` — số DẪN XUẤT do code tính, không do model nhẩm

> **Batch 2 của plan này.** §1–3 + §5–7 đã đủ để agent trả lời đúng mọi câu về cơ chế và giá trị cấu
> hình. §4 giải thêm lớp câu hỏi phổ biến nhất của staff: *"khách chọn thế này thì bao nhiêu line, hết
> bao nhiêu tiền?"* — làm sau, không chặn phần trên.

Hiện agent chỉ có 2 đường tính: nhẩm (bị cấm bởi `instructions.md` rule 2) hoặc `python3` trong sandbox
(đúng nhưng model phải **tự viết công thức đếm line** — `P(n,2)`, `C(n,k)`, hoán vị có lặp, tích
Descartes multiDigit). Model tự dựng lại công thức domain là chỗ sai âm thầm: sai `lineCount` → sai
tiền, mà số vẫn "do máy tính ra" nên nghe rất đáng tin.

**Giải pháp:** tool gọi thẳng hàm domain đã có, mỗi game một hàm:

| Game | Hàm domain (pure, không I/O) |
| --- | --- |
| max3dpro | `calculateLineCount()`, `expandSelectionToPairs()`, `validateSelection()` |
| max3d | `calculateLineCount()` (basic/plus/combo) |
| keno / bingo18 / 3 game jackpot | hàm đếm line tương ứng trong `packages/game-<game>/src/rules/play-types.ts` |

Tool nhận `{ game, playMode, selection, betCount?, drawCount? }`, trả
`{ lineCount, betUnitCount, unitPrice, amountPerDraw, amountTotal, version }`. `unitPrice` **đọc từ
config trong cùng use-case** — tuyệt đối không nhận từ input (nhận từ input là mở đường cho model
truyền số nhớ vào rồi ra kết quả "có tool xác nhận").

Bọc trong `apps/backoffice/src/use-cases/game-config/preview-bet-cost.ts` cùng thư mục §3.1 (khi đó
thư mục có 2 use-case → **thêm `index.ts` barrel**, đúng ngưỡng `app-use-case-layering.mdc` §2).

Ràng buộc: `validateSelection()` phải chạy **trước** khi đếm, và lỗi validate trả về nguyên văn cho
model (vd "multiNumber cần 3–20 bộ ba") — để agent nói đúng lý do sai thay vì tự bịa giới hạn.

---

## 5. Tích hợp vào eve — skills, instructions, và những gì KHÔNG làm

### 5.0 "1 skill/game + nhắc gọi tool" có đủ để KHÔNG BAO GIỜ sai? — KHÔNG

Câu hỏi này phải trả lời thẳng, vì nó là giả định nền của cả plan. **1 skill/game giải quyết ROUTING
(chọn đúng tài liệu), không giải quyết GROUNDING (chắc chắn dùng số mới).** Chúng là hai vấn đề khác
nhau, và chỉ giải cái đầu thì vẫn sai ở 5 chỗ:

| # | Failure mode còn lại | Vì sao "1 skill/game" không chặn được | Chặn ở đâu trong plan |
| --- | --- | --- | --- |
| 1 | **Tài liệu sạch nhưng model tự nhớ số Vietlott** — không gọi tool, trả lời luôn vì "câu này biết rồi" | Skill là *instructions*, không phải *ràng buộc thi hành*. eve không có cơ chế "bắt buộc gọi tool X trước khi trả lời". Nhắc trong description/body chỉ **tăng xác suất**, không đảm bảo | §7.2 evals (đo hành vi thật) + §5.2 rule 10 + `note` trong payload |
| 2 | **Dùng lại số cũ trong cùng hội thoại** — gọi tool lượt 2, staff sửa config lượt 5, trả lời lượt 6 bằng số trong history | Skill body không đổi giữa các lượt, không có tín hiệu nào nói "số này đã cũ" | §3.5 (3 lớp: `fetchedAt`, rule gọi lại mỗi lượt, card hiện version cho staff) |
| 3 | **Suy sai đơn vị/nghĩa** — `companyRate: 0.32` đọc thành 0,32%; `salesCloseBeforeSeconds` tưởng là phút | Số thô không tự nói nó là gì; skill dạy cơ chế chứ không đi kèm từng con số | §3.2 (`unit` + `label` đi kèm giá trị) |
| 4 | **Bịa phần chưa lấy** — hỏi `play`, được hỏi tiếp về tiền giải, trả lời mà không gọi lại | Payload không nói nó đang thiếu section nào | §3.3 (`sectionsNotFetched` / `sectionsNotApplicable`) |
| 5 | **Nhầm nguồn**: dùng config cho kỳ đã settle, hoặc dùng `seedAmount` làm jackpot hiện tại, hoặc dùng `defaultCommissionRate` cho 1 đại lý cụ thể | Đây là lỗi **chọn nguồn**, không phải lỗi thiếu tài liệu — skill đúng vẫn sai nguồn | §1.3 + `note` bắt buộc ở §3.2/§3.4 + rule 10 |

**Vậy cái gì thực sự làm nên độ đúng?** Bốn thứ, xếp theo mức độ chắc chắn giảm dần — và đây là lý do
plan không dừng ở skills:

1. **Tài liệu KHÔNG chứa số** (§2 + lint §7.1) — mạnh nhất, vì nó **loại bỏ khả năng** trả lời sai từ
   tài liệu. Không phải "nhắc model đừng dùng", mà là *không có gì để dùng sai*.
2. **Payload tự giải thích** (§3.2–§3.4) — `label`/`unit`/`note` đi kèm số, nên khi model đã gọi tool
   thì rất khó diễn giải sai; và `note` chủ động cảnh báo đúng 3 bẫy §1.3.
3. **Compiler + test** (§7.3) — đổi/thêm field làm đỏ build, không im lặng.
4. **Evals** (§7.2) — lớp duy nhất đo được failure mode #1. Đây là lý do evals **phải ở trong plan
   này**, không hoãn: nó là thứ duy nhất trả lời được câu "agent có thật sự gọi tool không".

Nói ngắn: **structure + guard làm nên độ đúng, không phải lời nhắc.** Skill/instructions là lớp mềm —
cần, nhưng không được coi là bảo đảm. Nguyên tắc này đã có tiền lệ trong thư mục: p0-04 phát hiện
network allowlist "được khai báo mà không được enforce", và bài học ghi ở `00-overview.md` là *policy
phải được đo, không chỉ được khai báo*. Ở đây policy là "agent không trả số cũ/số nhớ" — nên nó cũng
phải được đo (§7.2), không chỉ được nhắc.

### 5.1 Skills wiring

7 game × 3 topic + 3 doc chung = **24 skill**. Không advertise 24 description mỗi turn — quá nhiễu cho
routing. Gom theo game:

```
apps/backoffice/agent/skills/
├── san-pham-chung.<md|ts>     # _chung/* — từ vựng + vòng đời + tài chính
├── keno.<md|ts>               # gộp 3 topic của keno
├── lotto535.<md|ts>
├── mega645.<md|ts>
├── power655.<md|ts>
├── max3d.<md|ts>
├── max3dpro.<md|ts>
└── bingo18.<md|ts>
```

8 skill, 8 description — model chọn theo tên game trong câu hỏi, rất khó sai. Đuôi `.md` hay `.ts`
(`defineSkill` + `files`) do GATE §0 quyết.

`description` là **routing hint viết dạng nhiệm vụ**, không phải nhãn (`skills.mdx:14`). Mẫu:

```
Dùng khi nhân viên hỏi về sản phẩm Max 3D Pro: cách chơi, nội dung đặt cược,
điều kiện trúng, cách trả thưởng, hoặc giá vé. Tài liệu này KHÔNG chứa con số nào —
mọi số liệu phải lấy bằng getGameConfig cho max3dpro trong chính lượt trả lời.
```

Câu cuối là **cố ý**, và chọn từ rất kỹ: "**KHÔNG chứa con số nào**" (nêu sự thật về tài liệu, model
không thể nghĩ mình đã có số) + "**trong chính lượt trả lời**" (chặn dùng lại số của lượt trước, §3.5).
Đặt trong description để ràng buộc có mặt cả khi model chỉ đọc description mà chưa load body.

**Không dùng dynamic skills theo route** (`defineDynamic`) ở plan này: `DynamicResolveContext` không có
`request`/route, muốn biết staff đang ở trang nào phải parse `ctx.messages` tìm `clientContext` — thêm
điểm vỡ để tiết kiệm 7 dòng description. Đánh giá lại nếu số skill vượt ~20.

### 5.2 `agent/instructions.md` — thêm rule, giữ file ngắn

Instructions **không** chứa tri thức game (đó là việc của skills). Chỉ thêm **1 rule cứng** + 1 mục
"Cách dùng tool" ngắn. Đề xuất chèn thành rule 10 (sau rule 9 hiện có):

```markdown
10. **Số liệu về sản phẩm game PHẢI lấy từ cấu hình, KHÔNG lấy từ tài liệu hay ký ức.** Tài liệu sản
    phẩm (skill `keno`, `max3dpro`, …) chỉ mô tả CƠ CHẾ: người chơi chọn gì, điều kiện trúng, công
    thức tính — và ghi Ý NGHĨA của cấu hình chứ không ghi giá trị. Mọi con số (mệnh giá vé, tiền từng
    hạng giải, tỷ lệ hoa hồng, tỷ lệ công ty, seed/ngưỡng jackpot, trần chi trả, số kỳ tối đa, giờ
    quay) PHẢI đến từ `getGameConfig`. TUYỆT ĐỐI KHÔNG dùng số của Vietlott hay số trong kiến thức
    huấn luyện — hệ thống MegaWin cấu hình riêng và staff đổi được bất cứ lúc nào.

    **Số liệu cấu hình chỉ dùng được trong LƯỢT đã gọi tool.** Sang lượt mới mà câu hỏi lại cần số
    cấu hình → GỌI LẠI `getGameConfig`, kể cả khi lượt trước đã có số đó trong hội thoại: staff có
    thể vừa sửa cấu hình. Với jackpot thì LUÔN gọi lại (số dư thay đổi liên tục).

    **Đọc `label` và `unit` của mỗi giá trị, đừng suy nghĩa từ tên field.** `unit: "ratio"` là số
    0..1 — phải ×100 khi nói phần trăm. `unit: "VND"` là tiền, viết phân tách hàng nghìn. Nếu item có
    `note`, `note` là cảnh báo nghiệp vụ — đọc trước khi trả lời.

    **Nếu `meta.sectionsNotFetched` có phần bạn đang cần → gọi lại tool cho phần đó, KHÔNG suy đoán.**
    Nếu nằm trong `meta.sectionsNotApplicable` → game này không có mục đó, nói rõ như vậy.

    Ba trường hợp KHÔNG dùng `getGameConfig`:
    - "Jackpot đang bao nhiêu" → `getGameJackpot` (config chỉ có mức seed, không phải số đang tích luỹ).
    - Câu hỏi về **kỳ đã kết sổ** → lấy từ báo cáo kỳ đó; cấu hình hiện hành có thể đã đổi sau kỳ đó.
    - Hoa hồng của **một đại lý cụ thể** → là cấu hình riêng của đại lý, không phải mặc định hệ thống;
      nếu chưa có tool đọc được, nói rõ là chưa tra được thay vì trả số mặc định.

    Khi trả lời số cấu hình, ghi kèm mốc tin cậy (`configVersion`/`updatedAt` mà tool trả về).
```

Và bổ sung vào mục "Cách dùng tool" 2 dòng: (a) hỏi về sản phẩm/cách chơi → load skill game tương ứng
trước; (b) tính tiền/số line → `previewBetCost` (§4) nếu đã có, chưa có thì lấy `unitPrice` từ
`getGameConfig` rồi tính bằng `python3`, **không nhẩm**.

Rule 6 hiện tại ("Giới hạn phạm vi") cần nới: hiện nó liệt kê phạm vi là "tài chính, doanh thu, trả
thưởng, hoa hồng, entries chờ settle" — câu hỏi "Keno bao 8 chọn 5 tính sao" có thể bị model tự coi là
ngoài phạm vi và từ chối. Thêm "sản phẩm game và cách chơi" vào danh sách.

### 5.3 Những gì KHÔNG làm (quyết định, không phải bỏ sót)

| Không làm | Vì sao |
| --- | --- |
| Nạp `.cursor/rules/*-game-rules.mdc` vào agent (skill/instructions/sandbox) | Dev-facing (codebase map, collection, path, tên class) + **cố ý chứa giá trị mặc định** → dạy agent đúng thứ đang cấm. Chúng giữ nguyên vai trò coding rule cho dev |
| Nhồi tri thức game vào `instructions.md` | ~36–40k token mỗi model call, nằm ngoài history nên compaction không cắt được (`instructions.mdx:85`); phá prompt-cache economics |
| Seed doc vào `agent/sandbox/workspace/` cho model `grep` | Sandbox `deny-all` + bootstrap assertion → cold-start mỗi lần; discovery kém hơn skill (không có routing hint). `context-control.md:40` khuyên workspace cho **dataset**, không cho tri thức có cấu trúc |
| Dùng `web_fetch` lấy luật game từ vietlott.vn | Số của Vietlott **không phải** số của MegaWin — đây chính là lỗi plan này tồn tại để chặn. `web_fetch` giữ đúng phạm vi p0-04: chỉ đối chiếu **kết quả quay** |
| RAG/embedding | eve không có khái niệm này; 24 doc với routing theo tên game không cần tìm kiếm vector |
| Tool ghi/sửa config | Ngoài scope P0/P1 (`00-overview.md`): mọi tool read-only. Sửa config phải qua UI có audit |

---

## 6. Surface staff `/guides` — dùng lại, không dựng mới

Tài liệu này có **hai** người đọc; viewer đã có sẵn nên chi phí thêm gần bằng 0:

- Landing `/guides` hiện là grid card theo game — 4 game mới tự hiện sau khi vào manifest.
- Route `/guides/{gameKey}/san-pham/{slug}` — không cần code mới (`[...slug]/page.tsx` đã generic).
- `Cmd/Ctrl+K` search (`docs-search.tsx`) tự index doc mới.
- Renderer đã bỏ `href` với link chứa `_developer`/`README` — doc game không có link loại đó, không đụng.

**Việc phải làm ở UI:** chỉ 2 file — `_lib/docs-content.ts` (import raw hoặc đổi sang
`content.generated.ts` theo GATE) và `_lib/game-meta.ts` (icon + màu 4 game mới).

**Lợi ích phụ đáng kể:** doc "không số" cũng là doc **staff mới onboard đọc được** — và vì không có số,
nó không bao giờ lệch với hệ thống. Số staff cần thì có sẵn ở `/games/{game}/config`.

---

## 7. Guard — số không được bò trở lại vào tài liệu

Nguyên tắc của thư mục plan này: **policy phải được đo, không chỉ được khai báo** (bài học p0-04 với
network allowlist). "Doc không chứa số cấu hình" là một policy — nó sẽ bị vi phạm trong 3 tháng nếu chỉ
sống trong plan này. Ba lớp guard:

### 7.1 Lint tài liệu (tĩnh, chạy CI)

Mở rộng `apps/backoffice/src/scripts/check-docs.ts` (đã chạy trong `docs:check`, đã chặn merge) hoặc
thêm script cạnh nó, quét `docs/games/**/*.md`:

| Chặn | Regex/heuristic | Vì sao |
| --- | --- | --- |
| Số tiền | `\d{1,3}([.,]\d{3})+` (vd `2.000.000`), `\d+\s*(tỷ|triệu|nghìn)`, `\d+\s*VND` | Tiền = luôn là config |
| Phần trăm | `\d+([.,]\d+)?\s*%` | Tỷ lệ = luôn là config |
| "Vietlott" đi cùng số | `Vietlott` trong cùng đoạn với một match số ở trên | Chặn đúng lỗi plan này tồn tại để chặn |
| Thiếu banner | File không có blockquote "Số liệu trong tài liệu này" | Banner §2.2 là bắt buộc |
| Thiếu `description` frontmatter | — | Không có routing hint = skill vô dụng |
| Rò rỉ dev | `packages/`, `apps/`, `UseCase`, `Doc`, `_id`, tên collection (`_tickets`, `_draws`) | Doc staff không nhắc code |

**Cho phép có ngoại lệ, nhưng phải tường minh:** số STRUCTURAL hợp lệ (1–80, 6/45, 000–999, `C(n,k)`)
sẽ va vào regex ở mức nào đó. Xử lý bằng **allowlist theo dòng** với comment lý do trong file
(`<!-- structural: không gian số Keno -->`), KHÔNG hạ regex. Y hệt chính sách suppression của Biome
(`biome-lint-conventions.mdc` §d): ngoại lệ phải nêu lý do, không được "fix later".

### 7.2 Eval của eve (động — cái tĩnh không kiểm được)

Lint chỉ chặn số **trong doc**. Nó không chặn model **tự nhớ số Vietlott** rồi trả lời khi tài liệu đã
sạch. Đây là failure mode nguy hiểm nhất và chỉ đo được bằng eval. eve có evals sẵn
(`docs/evals/{overview,cases,assertions,judge}.mdx`) — đây là lý do chính đáng đầu tiên để bật, đúng như
`00-overview.md` đã dự đoán ("evals nên cân nhắc ở P1+ khi system prompt phức tạp hơn").

Bộ case tối thiểu (mỗi game ≥2, tổng ~16):

| Case | Câu hỏi | Assertion |
| --- | --- | --- |
| Giá vé | "1 vé Mega 6/45 chọn 6 số giá bao nhiêu?" | Có tool call `getGameConfig` với `game=mega645`; số trong câu trả lời **khớp `play.unitPrice` thật trong DB test** |
| Chống số Vietlott | "Giải đặc biệt Max 3D Pro bao nhiêu?" | Có `getGameConfig`; **không** xuất hiện chuỗi số mặc định của tài liệu Vietlott nếu config test đã đặt giá trị khác |
| Jackpot ≠ config | "Jackpot Power 6/55 đang bao nhiêu?" | Gọi `getGameJackpot`, **KHÔNG** trả `jackpot.jackpot1.seedAmount` |
| Kỳ đã settle | "Kỳ Keno hôm qua trả cao nhất bao nhiêu?" | Không dùng config làm nguồn; dùng tool báo cáo hoặc nói rõ chưa tra được |
| Cơ chế (không cần tool số) | "Max 3D Pro trúng ngược thứ tự thì sao?" | Load skill `max3dpro`; giải thích đúng phụ ĐB; nếu nêu số tiền thì phải có `getGameConfig` |
| Overflow | "JP1 Power tràn khi nào?" | Nhắc `jp1OverflowThreshold` và lấy giá trị từ config |
| Trần payout | "Keno pick 10 trúng 10 trả bao nhiêu?" | Nhắc `payoutCaps` chi phối, lấy từ config |
| Hoa hồng đại lý | "Đại lý X hoa hồng bao nhiêu?" | **Không** trả `rates.defaultCommissionRate` như thể là của X |
| **Số cũ trong hội thoại** | Lượt 1 hỏi mệnh giá Keno → **sửa config giữa hội thoại** → lượt 3 hỏi lại | Lượt 3 có tool call MỚI; số trả về là số **sau khi sửa**. Đây là case đo §3.5, và là case duy nhất chứng minh "1 skill/game + nhắc gọi tool" chưa đủ |
| **Đơn vị ratio** | "Tỷ lệ công ty thu của Mega là bao nhiêu?" | Nói `%` đúng (0.32 → 32%), không nói "0,32%" |
| **Section chưa lấy** | Hỏi mệnh giá (chỉ lấy `play`) rồi hỏi ngay tiền tier1 | Có tool call **thứ hai** với `sections: ["prizes"]`, không trả lời từ ký ức |
| **Section không áp dụng** | "Jackpot của Keno bao nhiêu?" | Trả lời "Keno không có jackpot" (dựa `sectionsNotApplicable`), KHÔNG bịa số |

Assertion loại "khớp số thật trong DB" là loại có giá trị nhất — nó biến policy thành thứ đo được. Nếu
setup DB test cho eval quá đắt ở batch này, chấp nhận **hạ xuống**: assert có tool call đúng + judge
kiểm "không nêu số nào ngoài số tool trả về". Ghi rõ đã hạ và vì sao.

### 7.3 Guard "đổi field mà tài liệu không biết" — đã được thiết kế §3.2 giải quyết

Rủi ro ban đầu: dev đổi tên field trong `GlobalConfigDoc` (vd `jp1OverflowThreshold`), doc vẫn ghi tên
cũ → agent nói tên field không tồn tại, hoặc tool trả `undefined`. Không compiler nào bắt được vì doc
là markdown.

**Thiết kế §3.2 xoá gốc rủi ro này**, nên guard rút gọn còn 1 dòng thay vì một test parse markdown:

| Trước (thiết kế cũ) | Sau (§3.2 self-describing) |
| --- | --- |
| Doc ghi tên field (`jackpot.jp1OverflowThreshold`); nghĩa nằm trong doc | Doc ghi **nghĩa** ("ngưỡng tràn Jackpot 1"); tên field không xuất hiện trong doc |
| Rename → doc lệch, phải có test parse markdown đối chiếu với default config | Rename → **đỏ compile ngay tại descriptor** (`c.jackpot.jp1OverflowThreshold` là property access thật) |
| Nghĩa/đơn vị model phải suy từ tên field | `label` + `unit` + `note` đi kèm giá trị trong payload |

**Việc còn phải làm ở §7.3:** thêm test **coverage descriptor** trong
`apps/backoffice/src/use-cases/game-config/` — với mỗi game, assert mọi key của `defaultPrizes`/bảng
giải/`play`/`rates`/`jackpot` trong **default config constant** đều xuất hiện trong descriptor. Mục
đích không phải chống rename (compiler làm rồi) mà chống **thêm field mới mà quên mô tả** — field mới
không có descriptor thì agent không bao giờ thấy, im lặng, không ai biết.

> Vị trí hằng default **không đồng nhất** (đã kiểm): `rules/defaults.ts` (max3d, max3dpro),
> `rules/jackpot.ts` (lotto535, mega645, power655), `rules/financials.ts` (keno, bingo18). Đừng giả định
> `defaults.ts`.

Đổi lại, §7.1 (lint doc) **thêm một luật**: doc **không được** chứa đường dẫn field dạng
`play.unitPrice`/`jackpot.seedAmount` nữa — viết nghĩa, không viết tên field. Ngoại lệ duy nhất: bảng
§1.2 trong plan này (là plan, không phải doc staff).

---

## Thứ tự thực thi

```
━━━ BATCH 1 (chặn phần còn lại) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
§0 GATE (0.5 ngày, ĐI ĐẦU — quyết vị trí file .md, sai là sửa 21 doc)
   │ pass
§1 bảng STRUCTURAL/CONFIG/SNAPSHOT  (nền — người viết doc tra bảng này)
   │
   ├──► §3 getGameConfig + getGameJackpot (tool + use-case app)   ─┐
   └──► §2 21 doc + 3 doc chung + manifest + /guides              ─┤
                                                                   │
              §5 skills wiring + instructions rule 10  ◄───────────┘
                        │ (cần cả doc lẫn tool mới verify được end-to-end)
━━━ BATCH 2 (sau khi batch 1 xanh) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
§7.1 lint doc  →  §7.3 test coverage descriptor  →  §7.2 evals
§4 previewBetCost (độc lập, làm bất cứ lúc nào sau §3)
```

**§2 và §3 song song được** (khác người, khác loại việc: soạn tài liệu vs viết TS). §5 cần cả hai. §7
phải làm **trong cùng batch nghiệp vụ, không hoãn sang plan khác** — guard hoãn là guard không bao giờ
tồn tại, và policy "doc không số" mất hiệu lực từ commit thứ hai.

**Riêng §7.2 (evals) không được coi là "nice to have".** §5.0 đã chỉ ra: failure mode #1 (model không
gọi tool, trả lời bằng ký ức) **chỉ đo được bằng eval**. Không có §7.2 thì cả plan chỉ là *tin rằng*
agent gọi tool, chứ không *biết*.

## Ước lượng & rủi ro

| Mục | Ước lượng | Rủi ro chính |
| --- | --- | --- |
| §0 GATE | 0.5 ngày | Cả B và C đều vỡ vì bundler eve → phải chọn A (doc nằm trong `agent/`, mất SSOT `ops-docs`) |
| §1 bảng phân định | 0.5 ngày | Phân loại sai một field (coi CONFIG là STRUCTURAL) → doc hoá đá số đó, guard §7.1 có thể không bắt nếu số trông "structural" |
| §2 21 + 3 doc | **2–3 ngày** (nặng nhất) | Viết lại từ `.mdc` dễ bị "copy kèm số". Max 3D Pro (gộp giải, bipartite, ordered pair) và Keno (`payoutCaps` hạ giải cố định) là 2 doc dễ sai nhất |
| §3 tool config (gồm descriptor 7 game) | **1.5–2 ngày** (tăng từ 1 ngày) | Descriptor là phần việc thật: 7 game × 4–5 section, mỗi item cần `label`/`unit`/`note` viết đúng nghiệp vụ. `Prizes` khác shape 3 nhóm game — gộp shape "cho gọn" là sinh câu trả lời sai bảng. `unit` sai (`ratio` ghi thành `count`) làm model nói sai phần trăm mà không guard nào bắt ngoài eval |
| §5 skills + instructions | 0.5 ngày | Description routing kém → model load sai game hoặc không load |
| §6 `/guides` | 0.5 ngày | `game-meta.ts` thiếu biến CSS `--color-game-*` cho 4 game mới |
| §7 guard (3 lớp) | 1–1.5 ngày | Regex §7.1 false-positive với số structural → áp lực hạ regex thay vì allowlist theo dòng. Eval §7.2 cần DB test có config khác mặc định (nếu config test = mặc định thì assertion **không chứng minh được gì**) |
| §4 previewBetCost | 1 ngày | Hàm đếm line 7 game khác signature; nhận `unitPrice` từ input là lỗ hổng phải chặn ngay từ schema |

**Rủi ro lớn nhất, ghi rõ để không tự lừa mình:** eval §7.2 chỉ có giá trị khi **config trong môi
trường test KHÁC giá trị mặc định/Vietlott**. Nếu chúng trùng nhau, mọi assertion "số đúng" đều pass
kể cả khi model đang đọc từ ký ức. Seed config test lệch hẳn (vd `unitPrice` một con số lạ) là điều
kiện tiên quyết của eval, không phải chi tiết triển khai.

## Definition of Done (toàn plan)

**Tài liệu**

- [ ] 21 doc game (7 × 3) + 3 doc `_chung` viết xong theo template §2.2, mỗi file có banner + `description`.
- [ ] Không doc nào chứa số tiền/tỷ lệ, **cũng không chứa đường dẫn field** (kiểm bằng §7.1, không bằng mắt).
- [ ] Mọi dòng trong bảng "Nội dung đặc thù" §2.3 được phủ, gồm cả cột "Bẫy phải viết".
- [ ] Manifest đủ 7 game × topic `san-pham`; `pnpm --filter @megawin/backoffice docs:check` xanh.
- [ ] `/guides` render đủ 24 doc; `Cmd+K` tìm được; 4 game mới có icon + màu.

**Tool**

- [ ] `getGameConfig` chạy thật với Mongo cho **cả 7 game**; `sections` mặc định `["play","rates"]`;
      Keno `Prizes` không kèm `pickSize` vẫn không làm nổ turn.
- [ ] **Mọi item** có `label` tiếng Việt + `unit` đúng; `unit: "ratio"` đúng cho mọi tỷ lệ (không có
      chỗ nào ghi `count`/`VND` cho tỷ lệ) — soát tay 1 lần, 7/7 game.
- [ ] `note` bắt buộc có ở: `jackpot.seedAmount` (mọi game jackpot), `payoutCaps` (keno),
      `rates.defaultCommissionRate` (7/7 — nhắc override per tenant).
- [ ] `meta` đủ `configVersion`, `updatedAt`, `fetchedAt`, `sectionsReturned`, `sectionsNotFetched`,
      `sectionsNotApplicable`. Hỏi `jackpot` cho Keno → nằm trong `sectionsNotApplicable`, không lỗi.
- [ ] `getGameJackpot` trả số **đang tích luỹ** 3 game (không phải seed) + `asOf`; Power 6/55 trả 2
      khối JP1/JP2 phân biệt bằng `label`.
- [ ] Cả 2 tool có nhãn trong `AI_TOOL_LABELS` + renderer tầng 1; card hiện `configVersion` +
      `fetchedAt`; deep-link `/games/{game}/config`.
- [ ] Use-case ở `apps/backoffice/src/use-cases/game-config/`, không chạm repo/DB trực tiếp, dùng
      `tryLoad` + `Promise.all`; 1 game lỗi không giết cả response.

**Agent**

- [ ] 8 skill; hỏi tên game bất kỳ → `load_skill` đúng skill (log chứng minh, 8/8).
- [ ] `instructions.md` có rule 10 (đủ 4 khối: nguồn số · gọi lại mỗi lượt · đọc `label`/`unit`/`note` ·
      xử lý `sectionsNotFetched`) + rule 6 đã nới phạm vi; file **không phình thêm tri thức game**.
- [ ] Hỏi "mệnh giá vé <game>" cho **cả 7 game** → có tool call `getGameConfig`, số khớp DB, câu trả
      lời ghi mốc `configVersion`/`updatedAt`.
- [ ] Hỏi "jackpot đang bao nhiêu" → `getGameJackpot`, **không** trả seed.
- [ ] Hỏi tỷ lệ công ty thu → nói `%` đúng (0.32 → 32%), không nói "0,32%".
- [ ] **Sửa config giữa hội thoại** rồi hỏi lại cùng câu → agent gọi tool LẠI và trả số MỚI (§3.5).
- [ ] Hỏi câu có số mặc định Vietlott nổi tiếng (giải ĐB Max 3D Pro) trong lúc config test đã đặt giá
      trị **khác** → agent trả số của config, không phải số Vietlott. **Đây là bài kiểm quyết định của
      cả plan.**

**Guard**

- [ ] §7.1 lint chạy trong `docs:check`, đỏ khi cố tình thêm `2.000.000.000 VND` vào 1 doc (thử thật),
      và đỏ khi cố tình viết `play.unitPrice` trong doc (thử thật).
- [ ] §7.3 test coverage descriptor đỏ khi cố tình **thêm** 1 field vào default config mà không mô tả
      (thử thật); rename 1 field → **đỏ compile** tại descriptor (thử thật).
- [ ] §7.2 evals chạy được, ≥16 case (gồm case "số cũ trong hội thoại" và case `unit: ratio`), DB test
      có config **lệch mặc định** (điều kiện tiên quyết).

**Chung**

- [ ] `pnpm --filter @megawin/backoffice check-types` + `pnpm --filter @megawin/ops-docs check-types` pass.
- [ ] `biome check` trên mọi path đã sửa pass; `pnpm format:docs` cho file `.md` mới.
- [ ] `00-overview.md`: thêm dòng bảng trạng thái + cập nhật diagram "Thứ tự thực thi".

## Ngoài scope plan này

- **Tool ghi/sửa config** — `00-overview.md` chốt mọi tool P0/P1 read-only; sửa config phải qua UI có
  audit. Khi có nhu cầu thật: HITL approval + `@megawin/audit` (khung ở p1-01).
- **Tool đọc `TenantConfigDoc`** (hoa hồng riêng từng đại lý) — plan này chỉ dạy agent **không được**
  trả số mặc định cho câu hỏi về đại lý cụ thể. Tool đọc tenant config là việc riêng, cần quyết định
  phân quyền trước (staff nào xem được hoa hồng đại lý nào).
- **Đối chiếu kết quả quay với Vietlott** — đã có `web_fetch` từ p0-04, không đụng.
- **Tài liệu cho player** (FAQ, thể lệ công khai) — khác đối tượng, khác giọng, khác kênh. Doc ở đây là
  staff-facing nội bộ.
- **Dynamic skills theo route** (`defineDynamic`) — §5.1 đã giải trình lý do loại; đánh giá lại nếu số
  skill vượt ~20.
- **Gộp `.cursor/rules/*-game-rules.mdc` và doc staff thành một nguồn** — hai đối tượng đọc khác nhau
  (dev cần path/collection/tên hàm + số mặc định để implement; staff cần cơ chế không số). Gộp là làm
  hỏng cả hai. Nếu về sau muốn giảm trùng lặp: `.mdc` **trỏ tới** doc staff cho phần luật chơi và chỉ
  giữ codebase map — làm ở plan riêng, có đo trước.
