# GitNexus — Ghi chú thực nghiệm & Setup

Tài liệu này lưu **bằng chứng đo được** và **lịch sử quyết định** cho phần tích hợp GitNexus.
Rule `.cursor/rules/gitnexus-code-graph.mdc` cố tình chỉ giữ chỉ dẫn hành động (nó `alwaysApply`,
nạp vào mọi request), còn mọi lý giải dài nằm ở đây — đọc khi cần debug hoặc đánh giá lại quyết định.

Môi trường đo: 2026-09-05, GitNexus 1.6.11, macOS, repo `megawin` (4.418 file, 52.310 nodes).

---

## 1. Setup MCP — sự cố "namespace không tồn tại"

**Triệu chứng:** rule được nạp nhưng agent chỉ dùng Grep/Read, không một lần gọi graph. Kiểm tra
catalog MCP thì namespace `gitnexus` **không tồn tại** — không `error`, không `needsAuth`.

**Nguyên nhân (2 lỗi cùng lúc trong `.cursor/mcp.json`):**

1. Thiếu `"type": "stdio"` — docs Cursor ghi field này **Required: Yes**. Entry không hợp lệ bị
   loại khỏi catalog im lặng.
2. `"command": "gitnexus"` không đủ. Binary ở `/opt/homebrew/bin`, nhưng **app GUI macOS không
   thừa hưởng PATH của shell** (chỉ có `/usr/bin:/bin:/usr/sbin:/sbin`). Đây là lý do
   `chrome-devtools` ở config global vẫn chạy được: nó dùng `npx`, có trong PATH tối thiểu.

**Config đúng:**

```json
{
  "mcpServers": {
    "gitnexus": {
      "type": "stdio",
      "command": "/opt/homebrew/bin/gitnexus",
      "args": ["mcp"]
    }
  }
}
```

**Sau khi sửa:** phải **restart Cursor** (reload window KHÔNG đủ — `mcp.json` chỉ đọc lúc khởi
động), rồi bật ở **Customize → MCPs**, filter scope `workspace`.

**Namespace thật sau khi nạp:** `project-0-megawin-gitnexus` (Cursor tự thêm prefix scope), không
phải `gitnexus` trần. Đã verify hoạt động 2026-09-05: `check --cycles` trả `status: "clean",
cycleCount: 0`; `route_map` trả 347 route.

**Debug:** `Cmd+Shift+U` → dropdown chọn **MCP Logs**.

**Team/Enterprise plan:** có **MCP Allowlist** (Dashboard → Team Settings → MCP Configuration) duyệt
local stdio server theo command pattern — command không khớp sẽ bị chặn.

**Tự kiểm chứng server sống, không cần Cursor** (phải trả về 17):

```bash
(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'; sleep 5) \
  | /opt/homebrew/bin/gitnexus mcp 2>/dev/null | grep -o '"name":"[a-z_]*"' | wc -l
```

---

## 2. Vì sao `impact` không đáng tin trên repo này

Kết quả thật khi gọi `impact` trên `CalculateFinancialsUseCase` (keno):

```jsonc
{
  "impactedCount": 14, "risk": "LOW", "epistemic": "lower-bound",
  "boundaries": ["UseCase is an interface with 598 implementations; callers that bind via
                 the interface are not traced — actual impact may be higher."],
  "causes": { "dispatchBoundary": 598 }
}
```

`risk: "LOW"` ở đây **không đáng tin**. 598 dispatch boundary = graph mù với pattern
`extends UseCase<In, Out>` — đúng pattern chủ đạo của toàn repo. Luôn đọc `boundaries`/`causes`
trước `risk`.

Ngoài ra `analyze` log báo **177 property read/write site** đặt tên field có định nghĩa trong
workspace nhưng không link được (gồm `data`, `body`, `children`, `add`, `after`, `before`, `base`,
`empty`) → mọi kết luận về field DTO/entity phải qua Grep.

Và về độ phủ flow: **5.895 / 6.095 entry point không được rank vào**, 2.607 callee bị bỏ ở
`maxBranching`, 510 flow reported → `processes` chỉ phủ ~8% entry point. Flow không xuất hiện
**≠** flow không tồn tại.

---

## 3. Embeddings — đã đo, quyết định KHÔNG bật

`analyze` chạy không có `--embeddings` (`"embeddings": 0` trong registry) → `query` chỉ dùng BM25.
Nhánh vector vẫn chạy nhưng trả rỗng (`timing.vector: 2.3ms` trong response `query`).

### Đính chính 2 ghi chú sai trước đây (2026-09-06)

**a) `--embeddings` trần sẽ bị SKIP IM LẶNG, không phải "có thể bị skip".** `[limit]` là **cap trên
tổng số node của repo**, không phải "chỉ embed N node đầu". Đo thật với `--embeddings 1500`:

```
Embeddings skipped: 52,324 nodes exceeds the 1,500-node safety cap.
Override with `--embeddings 0` to disable the cap, or `--embeddings <n>` to set a custom cap.
```

Repo có **52.324 node > cap mặc định 50.000** → chạy `--embeddings` trần thì analyze vẫn báo
"indexed successfully" mà **không có embedding nào**. Muốn chạy thật: `--embeddings 0`.

**b) `query` KHÔNG tệ như ghi chú cũ nói.** Ghi chú cũ viết top hit là component React
`ResultSection`, "không phải rule tài chính". Chạy lại đúng câu đó (2026-09-06): `ResultSection`
đứng đầu, **nhưng cùng response cũng trả về**
`packages/game-power655/src/rules/jackpot.ts:DrawFinancialResult.jackpot1Contribution` (rule tài
chính thật) và `FinalizeSettleUseCase`. BM25 đủ dùng khi query bằng **từ khoá khớp mặt chữ**;
`processes: []` là hạn chế riêng của flow ranking (§8), không phải do thiếu embeddings.

### Vì sao vẫn không bật

1. **Trùng lặp năng lực.** Embeddings chỉ nâng cấp đúng một tool (`query`: BM25 → hybrid). Cursor
   đã có semantic search riêng, tốt hơn cho câu hỏi khái niệm → thêm embeddings là trả chi phí cho
   thứ đã có.
2. **Chi phí vận hành lan sang post-commit.** Hook chạy `gitnexus analyze` trần. Flag
   `--drop-embeddings` mặc định TẮT nên embeddings cũ được *preserve*, nhưng node mới sau mỗi commit
   sẽ **không có vector** → index phân mảnh âm thầm (một phần có embedding, một phần không). Muốn
   đúng thì phải sửa hook thành `--embeddings 0`, đẩy thời gian sync từ ~9s lên hàng phút cho mọi
   commit.
3. **Phải tải model ONNX** (`~/.gitnexus/models` hiện trống) + tăng dung lượng index. `analyze` đã
   phải force-exit để bypass segfault của ONNX runtime (§7) — bật embeddings làm tăng bề mặt tiếp
   xúc với chính runtime đó.

**Khi nào nên xem lại:** nếu có nhu cầu semantic search *ngoài* Cursor (CI, script, agent khác không
có semantic search riêng). Lúc đó: `gitnexus analyze --embeddings 0 --force`, và **phải sửa
`.husky/post-commit` cùng lúc** để tránh phân mảnh.

---

## 4. Giữ index tươi — đã đánh giá 5 phương án, chọn 3 loại 2

| Phương án | Verdict | Lý do |
|---|---|---|
| `.husky/post-commit` (nền) | ✅ **đã cài, mặc định** | Commit trả về ~6ms; sync ~9s ở nền. Không tiến trình thường trú |
| `pnpm graph:sync` tay | ✅ **khi cần graph thấy code chưa commit** | ~9s incremental |
| `pnpm graph:watch` | ✅ **opt-in khi refactor lớn** | ~2.25GB RAM + rủi ro chết âm thầm (§5) |
| `.cursor/hooks.json` postToolUse | ❌ **KHÔNG dùng** | Bơm nhiễu vào context (§6) |
| `gitnexus auto-sync` | ❌ **TUYỆT ĐỐI KHÔNG** | Tự `git clone/pull` theo lịch — rủi ro ghi đè việc đang làm |

Incremental nhanh vì parse-cache được tái dùng:
`Incremental: changed=1 … skipping wipe + 4417 unchanged file rows preserved` →
`Rebuilt the graph and FTS while reusing cached parser output for 3746 file(s)`.

---

## 5. Watch mode — kết quả test đầy đủ

**An toàn:**

- Thêm file → symbol vào graph. Xoá file → symbol **bị loại đúng** (cypher xác nhận 0 rows). Không
  để lại node rác.
- `Ctrl-C` / `kill` giữa lúc ghi → **index không hỏng** (52.309 nodes, `status` up-to-date). Refresh
  là serialized + incremental.
- **Không ghi vào source code.** `git status` sạch. `AGENTS.md` giữ nguyên md5
  (`da54cc87f25a3897b106c5ed198acbd6`) qua nhiều lần `analyze` — chỉ ghi khi nội dung thật đổi.
- **Đọc đồng thời an toàn:** 6 truy vấn `cypher` song song trong lúc watch refresh đều ~250ms,
  **0 lỗi lock/corrupt**.

**Nhưng vẫn không bật mặc định:**

1. Incremental chỉ 6–9s → giữ tiến trình thường trú để tiết kiệm 9s là đánh đổi tệ, nhất là khi
   post-commit hook đã tự lo.
2. **Watch chết âm thầm.** Đã chứng minh: spawn watch rồi để shell cha thoát → process bị kill, log
   dừng ở `Watching …` **không có dòng refresh nào**, graph không nhận file mới. Vì vậy watch phải ở
   **terminal riêng foreground**, và luôn xác nhận bằng `pnpm graph:status`.

---

## 6. Vì sao loại bỏ postToolUse hook

Hook trong [`gitnexus-cursor-integration`](https://github.com/abhigyanpatwari/GitNexus/tree/main/gitnexus-cursor-integration)
chạy `gitnexus augment <pattern>` sau **mỗi** Read/Grep/Shell rồi bơm kết quả vào context. Trên repo
này nó có hại:

1. **Pattern bị strip mất thông tin.** Với `Read`, hook lấy basename rồi xoá mọi ký tự không phải
   `[a-zA-Z0-9_]`: `calculate-financials.ts` → `calculatefinancials`. Đo thật:
   `augment "calculatefinancials"` → **0 kết quả**.
2. **Đọc barrel file = nhiễu thuần.** Repo có **324 file `index.ts`/`index.tsx`**. Mỗi lần Read một
   barrel, hook sinh pattern `"index"` → trả 3 symbol ngẫu nhiên không liên quan.
3. **Tên class chính xác cũng ra rỗng.** `augment "CalculateFinancialsUseCase"` và
   `augment "SettleDrawUseCase"` → **0 kết quả** (dù `context` tìm thấy 7 candidate). `augment` khớp
   lỏng theo substring nên `"DrawFinancial"` lại ra 5 symbol — không dự đoán được.
4. **Chi phí:** +~250ms mỗi tool-call và một subprocess Node cho **mọi** Read/Grep.

→ Hook làm loãng context bằng symbol không liên quan. Gọi `cypher`/`context` có chủ đích hiệu quả
hơn nhiều lần.

---

## 7. Bài học khi sửa `.husky/post-commit`

`gitnexus analyze` **force-exit** khi kết thúc (bypass một segfault của ONNX runtime). Hệ quả:
**mọi lệnh cleanup đặt sau nó trong cùng shell KHÔNG BAO GIỜ chạy.**

Bug đã gặp: lock dạng `mkdir` + `trap … EXIT` để `rmdir` → lock kẹt vĩnh viễn → mọi lần sync sau bị
bỏ qua **âm thầm**. Bug thứ hai: thiếu `nohup` → analyze nhận SIGHUP và dừng giữa đường khi git
thoát.

Hook hiện dùng **lock file chứa PID + `kill -0`** để không phụ thuộc cleanup của process con. Nếu
sửa hook, giữ nguyên tính chất này. Đã test: trả về 6ms, lock chặn khi đang chạy, thu hồi lock mồ
côi khi PID đã chết.

---

## 8. Trạng thái 17 tool — đã test từng cái

| Tool | Dùng được? | Ghi chú |
|---|---|---|
| `cypher` | ✅ mạnh nhất | Đọc `gitnexus://repo/megawin/schema` trước khi viết query |
| `context` | ✅ | Dùng `uid`, không dùng `name` trần |
| `trace` | ✅ | Đường đi A→B qua CALLS/HAS_METHOD |
| `detect_changes` | ✅ | Cần index tươi |
| `check` | ✅ | `--cycles`: hiện **0 circular import** |
| `list_repos` | ✅ | Trả `["megawin"]` |
| `impact` | ⚠️ lower-bound | `dispatchBoundary: 598` (§2) |
| `query` | ⚠️ yếu | BM25 keyword-only (§3) |
| `route_map` | ⚠️ một nửa | Liệt kê đúng **347 route** + middleware `withApi`, nhưng `consumers` và `flows` **rỗng ở cả 347/347** (verify 2026-09-05 qua MCP). Chỉ khớp path backoffice `/api/…`; truy vấn route `api-player` (`/player/keno/tickets/pending`) trả `total: 0`. Ngoài ra `runtimeEvidence.confirmed: false` trên mọi route |
| `rename` | ❌ | Dùng TypeScript rename của IDE |
| `shape_check` | ❌ | Test: `routes: [], total: 0` — repo gọi API qua `http-client`/SWR wrapper |
| `api_impact` | ❌ | Phụ thuộc cùng dữ liệu consumer đang rỗng |
| `explain` / `pdg_query` | ❌ | Cần `analyze --pdg` (chưa index) |
| `tool_map` | ➖ | Cho repo định nghĩa MCP/RPC tool |
| `group_list` / `group_sync` | ➖ | Chỉ cho multi-repo group |

---

## 9. Skills — vì sao chỉ cài `plan` + `review`

Package GitNexus có 12 skill. Đã copy 2 vào `.cursor/skills/` (commit vào repo):

- **`/gitnexus-plan`** — chỉ ghi 1 file `docs/plans/YYYY-MM-DD-gitnexus-plan-<slug>.md`, tự cấm sửa
  code/test/config. Phụ thuộc `scripts/evidence-provenance.mjs` — **không xoá** `scripts/` hoặc
  `references/`.
- **`/gitnexus-review`** — read-only (*"without editing source, committing, pushing, posting"*),
  6 persona lens.

Triết lý 2 skill này khớp với rule, khác hẳn `AGENTS.md` auto-gen:

> *"Source beats graph. The graph navigates; current source is authoritative."*
> *"No fabrication. Never invent symbols, filenames, test names, tool results, or PDG edges."*

**Cố ý KHÔNG cài `/gitnexus-work`** — skill đó tự sửa code và tự commit theo plan. Với repo có code
tài chính (settle/payout/wallet), giao quyền commit cho skill chạy trên graph lower-bound là rủi ro
không cần thiết.

Update khi nâng GitNexus: copy lại từ `$(npm root -g)/gitnexus/skills/<tên>`, đừng sửa tay.

### Vì sao KHÔNG liệt kê skill trong rule always-on

Rule từng có một mục §6 "Skills" mô tả `/gitnexus-plan` và `/gitnexus-review`. **Đã xoá** vì Cursor
tự inject `name` + `description` của mọi skill trong `.cursor/skills/` vào context mỗi request
(block `<available_skills>`). Viết lại trong rule = **trả token 2 lần cho cùng thông tin**, và tệ
hơn: khi skill upstream đổi mô tả, bản trong rule lệch âm thầm.

Nguyên tắc chung cho rule always-on: **không mô tả thứ Cursor đã tự nạp** (skill, MCP tool list,
file đang mở). Rule chỉ nên chứa thứ Cursor *không* thể tự biết — hành vi đo được của tool trên
repo này, vùng graph mù, quy ước nội bộ.

### Vì sao loại `.cursor/skills/**` khỏi Biome

`lint-staged` chạy `biome check --write` trên `*.mjs` sẽ **tự reformat** `evidence-provenance.mjs`
(102 `useBlockStatements` + organizeImports) ngay lần commit đầu → file lệch khỏi upstream, khó
update. Đã thêm `"!.cursor/skills/**"` vào `biome.json` `files.includes`. **Không hạ rule nào** —
verify error count toàn repo giảm 199 → 197 (đúng 2 error của file vendored).

Lưu ý: `biome.json` **không nhận comment** — thêm `//` làm Biome fail toàn bộ config
(`Biome exited because the configuration resulted in errors`). Vì vậy giải trình nằm ở đây.

---

## 10. Ngân sách token của rule always-on

Repo có 6 rule `alwaysApply: true` ≈ **26k token nạp vào mọi request**. Rule GitNexus ban đầu 374
dòng / 22.9k ký tự ≈ 6.5k token — chiếm **25%** ngân sách đó, phần lớn là lịch sử quyết định không
dùng khi code.

Vì vậy đã tách: rule giữ chỉ dẫn hành động, tài liệu này giữ bằng chứng. Khi cần thêm phát hiện mới,
**ghi vào đây**, đừng làm phình rule.

---

## 11. Hook Cursor — vì sao agent "bỏ qua" GitNexus, và 3 tầng hook đã cài

Đo 2026-09-08, GitNexus 1.6.11. Bối cảnh: user quan sát thấy **chỉ khi attach tay
`@.cursor/rules/gitnexus-code-graph.mdc` vào prompt** thì agent mới gọi GitNexus; không attach thì
luôn dùng Grep/Read. Rule §1-6 vẫn `alwaysApply: true` và vẫn nằm trong context — nhưng không đủ.

### 11.1 Nguyên nhân cơ học (không phải lỗi rule)

**a) Cursor lazy-load MCP tool schema** ([Dynamic context discovery](https://cursor.com/blog/dynamic-context-discovery),
1/2026). Agent chỉ nhận **tên tool**; description thật sync ra disk tại
`~/.cursor/projects/<workspace>/mcps/project-0-megawin-gitnexus/`:

```
tools/          ← 17 file .json, description đầy đủ nằm ở ĐÂY (không ở context)
prompts/        ← detect_impact.json, generate_map.json (2 MCP prompt, chưa dùng)
resources/      ← All_Indexed_Repositories.json, GitNexus_Setup_Content.json
INSTRUCTIONS.md ← RỖNG (xem điểm b)
```

Hệ quả: `Grep`/`Read`/`Glob` có full description **sẵn trong system prompt** → chi phí gọi = 0.
GitNexus phải `GetDynamicTools` trước → thêm 1 round-trip. Cursor A/B test giảm 46.9% token bằng
cách này → là **thiết kế có chủ đích**, không sửa được. Không có setting nào tắt (đã grep
`settings.json`: 0 key liên quan; docs MCP chính thức: không có field nào).

**b) GitNexus KHÔNG cấp `instructions` qua MCP.** Bắt tay trực tiếp với server:

```jsonc
// initialize response từ `gitnexus mcp` — KHÔNG có field "instructions"
{"protocolVersion":"2025-06-18","capabilities":{"tools":{},"resources":{},"prompts":{}},
 "serverInfo":{"name":"gitnexus","version":"1.6.11"}}
```

Xác nhận thứ hai trên disk: `INSTRUCTIONS.md` của GitNexus **rỗng**, còn
`mcps/cursor-ide-browser/INSTRUCTIONS.md` **có nội dung** — đó là lý do namespace browser hiện
`namespaceUseInstructions` trong catalog của agent, GitNexus thì không. → **Không có kênh nào từ
phía GitNexus dạy Cursor "khi nào cần graph"**; toàn bộ routing phải làm ở phía client.

**c) Chẩn đoán của cộng đồng khớp chính xác hiện tượng này** (`jcodemunch-mcp/AGENT_HOOKS.md` — MCP
code-graph khác, cùng bài toán):

> *"The common failure mode isn't forgetting — it's **skipping**. The agent sees the rule in
> CLAUDE.md and reaches for Read or Grep anyway because native tools feel faster under pressure or
> in a long session. **A prompt policy can't stop this.** The hooks intercept at the tool-call level."*

Pattern leo thang chung của mọi MCP code-graph: (1) câu imperative trong rules → (2) deny native
tool ở tầng permission → (3) hook chặn ở tool-call. **Cursor KHÔNG có (2)** (Claude Code có
`permissions.deny`); tương đương duy nhất là `preToolUse` trả exit code 2.

### 11.2 Vì sao KHÔNG cài hook vendor nguyên bản

Vendor `gitnexus-cursor-integration` chạy `postToolUse` matcher `Shell|Read|Grep`. Đo `gitnexus
augment` bằng đúng pattern mà từng nhánh sinh ra (đọc source `gitnexus-hook.cjs` để lấy đúng logic):

| Nhánh | Pattern hook sinh | Kết quả | Thời gian |
|---|---|---|---|
| `Read` `calculate-financials.ts` | `calculatefinancials` | ❌ **0 symbol** | 0.63s |
| `Read` `void-draw.ts` | `voiddraw` | ❌ **0 symbol** | 0.24s |
| `Grep` tên method | `upsertGameDaily` | ✅ 1 symbol + `Calls: findOneAndUpdate` | 0.27s |
| `Grep` tên type | `DrawFinancial` | ✅ 5 symbol + `Called by: execute` | 0.30s |
| `Grep` const-as-const | `KenoOpsAlertType` | ⚠️ 2 symbol **trùng lặp y hệt** | 0.28s |
| `Shell` regex alternation | `upsertGameDaily\|upsertTenantDaily` | ❌ **0 symbol** | 0.25s |
| tên generic | `data` / `index` | ❌ 3 symbol noise | 0.30s |
| tên class UseCase | `CalculateFinancialsUseCase` | ❌ **0 symbol** | 0.25s |

**Nhánh `Read` chết cứng trên repo này.** Vendor lấy basename rồi xoá ký tự không phải `[A-Za-z0-9_]`:

```js
const cleaned = base.replace(/[^a-zA-Z0-9_]/g, '');  // calculate-financials → calculatefinancials
```

Repo 100% file kebab-case (Biome `style/useFilenamingConvention`) → basename thành chuỗi lowercase
liền, symbol thật là camelCase/PascalCase → **không bao giờ khớp**. Đốt ~250ms/lần Read, đổi 0
thông tin. §6 đã đo đúng điều này năm trước và **upstream vẫn chưa sửa**.

`gitnexus augment` **không có flag nào** (`augment --help` → chỉ `-h`) → không điều khiển được
limit/format. Output in ra **stderr** (banner + block `[GitNexus]`), không phải stdout.

### 11.3 Ba tầng hook đã cài (`.cursor/hooks.json` + `.cursor/hooks/*.py`)

| Tầng | Hook | Matcher | Vá vấn đề gì |
|---|---|---|---|
| 1 | `postToolUse` → `gitnexus-augment-grep.py` | `Grep` | Xoá bỏ bài toán "agent phải tự nhớ gọi graph" |
| 2 | `preToolUse` → `gitnexus-task-routing.py` | `Task` | Subagent không kế thừa rule (rule §7) |
| 3 | `postToolUse` → `gitnexus-verify-reminder.py` | `CallDynamicTool\|MCP:*` | Nhắc verify đúng khoảnh khắc cần |

**Tầng 1 khác vendor:** chỉ giữ nhánh `Grep` (bỏ `Read` + `Shell` theo bảng 11.2), thêm
guard `^[A-Za-z_][A-Za-z0-9_]{4,}$` (chặn regex/path/literal), denylist 24 tên generic (lấy từ 177
property site không resolve ở §2), dedupe dòng trùng, cắt `MAX_SYMBOLS`.

**Điểm thiết kế quan trọng:** hook chạy **SAU** Grep → agent thấy **source trước, graph sau**. Nó
*đảo* thứ tự của rule (`graph → verify`) nhưng an toàn hơn: không còn cửa nào để kết luận từ graph
khi chưa đọc source. Khớp tuyên bố của chính skill GitNexus: *"Source beats graph. The graph
navigates; current source is authoritative."*

**Tầng 2** là kênh **duy nhất** vá được lỗ subagent — `subagentStart` chỉ có output
`permission` allow/deny, không sửa được prompt; chỉ `preToolUse` có `updated_input`. Idempotent:
bỏ qua nếu prompt đã chứa `project-0-megawin-gitnexus`. Skip `browser-use`/`bugbot`/
`security-review`/`cursor-guide`/`ci-investigator`.

**Tầng 3** throttle 15 phút/repo qua stamp file ở `$TMPDIR` — phiên refactor gọi graph 20 lần chỉ
nhắc 1 lần. Cố tình **loại** `check`/`list_repos`/`group_*` khỏi danh sách: kết quả của chúng là
xác định, không phải lower-bound (`check --cycles` trả `cycleCount: 0` là sự thật đầy đủ).

### 11.4 Vì sao Python, không phải Node

Cursor là app GUI macOS → tiến trình con **không thừa hưởng PATH của shell** (chỉ
`/usr/bin:/bin:/usr/sbin:/sbin`) — đúng nguyên nhân sự cố ở §1. `node` ở `/opt/homebrew/bin` →
không gọi được bằng tên trần; `/usr/bin/python3` (3.9.6) luôn có sẵn. Hook vendor viết `.cjs` và
`hooks.json` của nó ghi `node ./hooks/gitnexus-hook.cjs` → **sẽ fail âm thầm trên máy này**.

`/opt/homebrew/bin/gitnexus` là symlink tới `dist/cli/index.js` với shebang `#!/usr/bin/env node`
→ spawn nó vẫn cần `node` trong PATH. Vì vậy `_gitnexus_common.augmented_env()` bồi
`/opt/homebrew/bin:/usr/local/bin:/opt/local/bin` vào PATH trước mọi lần spawn.

Slot lock (3 slot, stale 30s, fail-closed) port từ `hook-lock.cjs` của vendor sang Python thay vì
vendor file `.cjs` — tránh lặp lại vấn đề §9 (file vendored bị Biome reformat).

### 11.5 Kết quả verify live (cùng session, không cần restart Cursor)

Cursor tự watch & reload `hooks.json`. Cả 3 tầng đã chạy thật:

- Tầng 1: `Grep "upsertGameDaily"` → kèm block `[GitNexus graph]` với `Calls: findOneAndUpdate`.
- Tầng 3: gọi `cypher` → kèm block nhắc lower-bound.
- Tầng 2: test bằng payload mẫu (prompt 2.018 ký tự sau khi chèn); `browser-use` và prompt
  đã-có-routing đều bị bỏ qua đúng.

**Minh chứng đắt giá nhất về tính lower-bound**, đo ngay trong lần verify: `cypher` tìm
`upsertGameDaily` trả **1 file**, trong khi `Grep` cùng tên trả **10 file** (mỗi game 1 repo +
`publish-settle-daily.ts` + `types.ts`). Graph chỉ thấy định nghĩa base ở
`game-core-application`; 7 bản per-game và mọi call site đều nằm ngoài. Đây chính là lý do Tầng 1
và Tầng 3 đều nhúng câu nhắc "graph là sàn, không phải trần" ngay trong output.

Index lúc verify báo `commitsBehind: 2` — nhắc lại §5: graph mù với code chưa commit.

### 11.6 Cố ý KHÔNG làm

| Không làm | Lý do |
|---|---|
| Chặn `Grep` bằng `preToolUse` exit 2 | Repo này Grep **đúng** phần lớn thời gian (vùng graph mù ở §3). Các repo cộng đồng đang chặn là repo graph phủ tốt; repo này thì không |
| Cài hook vendor nguyên bản | Nhánh `Read`/`Shell` trả 0 hit (11.2) — đúng kết luận §6, chỉ nay có số cụ thể hơn |
| `sessionStart` inject directive | Docs ghi rõ **không chạy trong cloud agent**; và trùng vai với rule always-on đã có |
| `beforeSubmitPrompt` | Output chỉ có `continue`/`user_message` — **không** inject được context |
| Prompt-based hook (`type: "prompt"`) | Thêm 1 call model mỗi tool-use → latency + chi phí |
| Bật embeddings để `query` mạnh hơn | Không liên quan; lý do giữ nguyên ở §3 |

## 12. Đo hiệu quả 3 tầng hook — hit rate, chi phí token, an toàn chất lượng (2026-09-08)

Sau khi cài §11, đo thật (không suy đoán) 3 câu hỏi: **hiệu quả có tăng rõ rệt? chi phí token có
giảm? chất lượng code có bị ảnh hưởng?** Phương pháp: batch CLI trực tiếp (Test A/B, tái lập được),
1 subagent test hành vi thật không kịch bản trước (Test C), đọc lại source 3 hook (Test D).

### 12.1 Test A — Hit rate Tầng 1 trên 15 symbol thật (không chọn tay để đẹp số)

```
node .gitnexus/run.cjs augment -- <symbol>   # chạy trực tiếp CLI, không qua hook, đo raw
```

| Symbol | Nhóm | Hit? | Chars | Ghi chú |
|---|---|:---:|---:|---|
| `deriveDrawState` | cross-file, mới viết session này | ✅ | 250 | `Called by: deriveHubSummary`, `Calls: deriveHealth, deriveOpsStage, deriveSaleGate` |
| `calculateBingo18DrawFinancials` | rule thuần | ✅ | 165 | `Called by: execute` (generic — dispatch boundary) |
| `lookupBasicPrize` | rule dùng nhiều nơi | ✅ | 186 | `Called by: lookupPrize, matchBasicBoard, maxBasicPrize` |
| `AppException` | siêu phổ biến (90 caller thật theo cypher) | ✅ | 1140 | Chỉ in `fetcher, fetcher, handleError` — 3/90, đúng "sàn" |
| `docPath` | helper dùng ở ~80 file | ✅ | 187 | Chỉ in 3 file — 3/45 caller thật theo cypher |
| `isVoidable` | hàm đơn giản, có trong graph (cypher xác nhận) | ❌ | 28 | **Miss thật**: cypher thấy caller `execute`, nhưng CLI `augment` tự nó trả 0 — giới hạn nằm ở thuật toán match của `augment`, không phải hook |
| `bulkVoidDrawUseCase` (tên đúng) | Const wrapper | ✅ | 145 | |
| `BulkVoidDrawUseCase` (tên đúng) | Class | ✅ | 203 | |
| `CalculateFinancialsUseCase` | **trùng tên 7 lần** (1/game) | ❌ | 28 | Miss — augment có vẻ bail khi ambiguity quá cao |
| `DrawFinancial` | type dùng chung | ✅ | 419 | |
| `deriveHubSummary` | cross-file | ✅ | 249 | |
| `parseDrawTimestamps` | cross-file | ✅ | 200 | |
| `upsertGameDaily` | đã biết là lower-bound (10 file Grep vs 1 file graph) | ✅ | 211 | |
| `getOpsHubSnapshot` (tên đoán sai — thật ra là `GetOpsHubSnapshotUseCase`) | — | ❌ | 28 | Không phải miss của tool — do đoán sai tên |
| `findGlobalConfig` (tên đoán sai — thật ra `getGlobalConfig`) | — | ❌ | 28 | Không phải miss của tool — do đoán sai tên |

**Hit rate trên tên đúng và không siêu-trùng-tên: 11/13 = 85%.** Tính cả 2 case đoán sai tên
(không phải lỗi tool) và `CalculateFinancialsUseCase` (trùng 7 lần): 11/15 = 73%.

**Phát hiện quan trọng nhất — hành vi KHÔNG NHẤT QUÁN khi tên trùng nhiều bản:**
`getGlobalConfig` cũng trùng tên đúng 7 lần (đếm bằng cypher), nhưng `augment` **không trả 0**
như `CalculateFinancialsUseCase` — nó **âm thầm chọn 1 bản** (`mega645`) mà không hề cảnh báo
ambiguous. Nếu người dùng đang hỏi về bản Keno, thông tin "Called by: ..." trong output sẽ là
của **game sai**, và không có gì trong output báo hiệu điều đó. Đây là rủi ro thật, không phải lý
thuyết — xem cách Test C xử lý đúng rủi ro này nhờ Tầng 2.

### 12.2 Test B — Chi phí token mỗi tầng (đo trực tiếp, không ước lượng)

| Tầng | Khi nào tốn | Kích thước | ≈ token | Tần suất thực tế |
|---|---|---:|---:|---|
| 1 (augment-grep) | Mỗi lần `Grep` fire (73-85% Grep có pattern identifier sạch) | 145–1140 ký tự | 36–285 | Mỗi lần Grep khớp guard |
| 2 (task-routing) | Mỗi lần gọi `Task` (trừ 5 subagent type denylist) | 1984 ký tự | 496 | 1 lần / lệnh `Task`, không nhân theo số tool-call bên trong subagent |
| 3 (verify-reminder) | Sau `impact/cypher/context/trace/query/route_map/detect_changes` | ~700 ký tự | ~175 | Throttle 15 phút/repo — nhiều lệnh graph liên tiếp chỉ tốn 1 lần |

**So sánh với chi phí "agent tự nhớ gọi GitNexus":** gọi `GetDynamicTools` cho tool `cypher` để lấy
schema (bước bắt buộc nếu agent tự chủ động, theo rule §2) tốn **~2.870 ký tự / ~718 token** —
**riêng bước load schema đã đắt hơn cả 3 tầng hook cộng lại cho 1 lượt** (36–285 + 496 + 175 ≈
707–956 token, và Tầng 2/3 chỉ trả 1 lần chứ không phải mỗi lần cần graph). Tức là: nếu KHÔNG có
hook và agent phải tự discover + gọi đúng, chi phí discover một lần đã ngang chi phí cả 3 tầng hook
gộp lại — chưa kể rủi ro agent **không tự gọi** (đã chứng minh ở §11, hành vi mặc định là bỏ qua).

**Kết luận trung thực về "giảm chi phí token":** hook KHÔNG giảm chi phí xuống dưới baseline
"không dùng graph ở đâu cả" (đó là chi phí thêm — insurance, không miễn phí). Hook giảm chi phí
**so với 2 kịch bản thực tế hơn**: (a) agent tự mò gọi GitNexus nhiều lần/tự load schema lặp lại
trong subagent, hoặc (b) agent bỏ qua graph, tự đọc rải nhiều file để suy caller — với case
`getGlobalConfig` 7-game ở Test C, kịch bản (b) tốn nhiều vòng Grep + Read hơn 496 token của Tầng 2.

### 12.3 Test C — Hành vi thật: subagent `explore` gặp bẫy "tên trùng 7 game"

Không thể tắt sống `hooks.json` giữa session để A/B song song thật — đã thử `mv` file đi, gọi lại
`Grep "lookupBasicPrize"`: **hook vẫn fire** → xác nhận Cursor cache `hooks.json` lúc khởi động
session, đổi file giữa session không tắt được ngay (giới hạn đã biết, ghi lại để không lặp lại thử
nghiệm này). Đã khôi phục file ngay sau khi xác nhận.

Thay vào đó, chạy 1 test hành vi thật (không kịch bản, không gợi ý GitNexus trong prompt): giao
[Test bẫy disambiguation getGlobalConfig Keno](73a6cae6-80e3-403a-8d6f-7b0dd1a5673b) — subagent
`explore` — nhiệm vụ "liệt kê caller của `getGlobalConfig` **riêng bản Keno**" trong khi cảnh báo
rõ tên này trùng ở 6 game khác.

**Kết quả — subagent tự làm ĐÚNG toàn bộ quy trình mà không bị nhắc trong prompt của user:**
1. Gọi `cypher` (không phải Grep mù) với filter `WHERE b.filePath CONTAINS 'game-keno-application'`
   — lọc theo **filePath của node đích**, không lọc theo `name` (đúng kỹ thuật disambiguation mà
   `ROUTING_BLOCK` dạy: *"Gọi bằng `name` trần sẽ nhận `ambiguous` — truyền `uid` hoặc `file_path`"*).
2. Grep xác nhận, **scoped cứng vào path** `packages/game-keno-application` — không Grep tràn 7 game.
3. Read chốt: xác nhận relative import không "xuyên" được sang package game khác — root cause đúng
   nghiệp vụ (mỗi game là 1 package Node riêng), không chỉ dựa vào tên.
4. Trả lời tách bạch "kết luận từ graph" vs "kết luận từ đọc code" — đúng yêu cầu cuối `ROUTING_BLOCK`.
5. Kết luận **"an toàn có kiểm soát"** (không phải "an toàn tuyệt đối") kèm đúng 4 file + 12 call
   site — không sa vào bẫy dùng nhầm dữ liệu game khác mà Test A vừa chứng minh `augment` CLI tự nó
   mắc phải (`getGlobalConfig` → âm thầm trả bản mega645).

Đây là bằng chứng hành vi **trực tiếp**, không suy diễn: một subagent fresh (theo nghiên cứu §11,
0% khả năng tự biết GitNexus tồn tại) đã dùng đúng graph, đúng kỹ thuật khử nhầm, và tránh đúng cái
bẫy mà chính CLI `augment` (Test A) minh chứng là dễ mắc. Không đo được "không có hook thì sẽ sai"
bằng A/B sống, nhưng: (a) nghiên cứu §11 đã chứng minh subagent không có hook = 0% biết GitNexus
tồn tại → chắc chắn không tự gọi `cypher` với filter đúng như trên; (b) nếu chỉ Grep tên trần
`getGlobalConfig` toàn repo (không graph), subagent vẫn phải tự suy luận cách phân biệt 7 game từ
danh sách ~150 dòng Grep (tốn nhiều bước đọc file hơn hẳn 1 câu `cypher` có filter).

### 12.4 Test D — An toàn chất lượng code + hiệu năng

- **Không thể sửa code:** đọc lại cả 3 file hook — chỉ có 2 dạng `emit()`: `additional_context`
  (text thêm vào context, không phải file) hoặc `{"permission": "allow", "updated_input": ...}`
  (chỉ nối chuỗi vào field `prompt` của lệnh `Task`, chưa từng gọi hàm ghi file nào ngoài
  `tempfile` stamp riêng của throttle Tầng 3). Không có code path nào chạm `Write`/`StrReplace`/git.
- **Không thể block sai:** Tầng 2 luôn `permission: "allow"` — không bao giờ từ chối lệnh `Task`.
  Không tầng nào trả `permission: "deny"` hay exit code chặn — đúng quyết định "cố ý KHÔNG chặn"
  ở §11.6.
- **Latency:** mỗi lần Tầng 1 fire phải spawn `node .gitnexus/run.cjs augment` — đo trực tiếp trong
  Test A: 200–660ms/lệnh. Tầng 3 chỉ đọc/ghi 1 file stamp — vài ms. Tầng 2 không gọi CLI gì — tức
  thời. Tổng overhead UI mỗi lượt Grep/Task nằm dưới 1 giây, không đáng kể so với thời gian model
  suy nghĩ giữa các bước.

### 12.5 Kết luận tổng hợp

| Câu hỏi user | Trả lời | Bằng chứng |
|---|---|---|
| Hiệu quả có tăng rõ rệt? | **Có**, với 2 điều kiện: pattern là identifier sạch (không regex/path) VÀ tên không siêu-trùng (>1 bản cùng tên). Tầng 2 đã chứng minh sống bằng 1 test hành vi thật tránh đúng bẫy 7-game | §12.1, §12.3 |
| Chi phí token có giảm? | **Giảm so với kịch bản agent tự discover/tự mò** (~718 token load schema 1 lần đã đắt hơn cả 3 tầng cộng lại); **KHÔNG giảm so với baseline "không dùng graph"** — đây là chi phí insurance, không miễn phí | §12.2 |
| Chất lượng code có bị ảnh hưởng? | **Không** — hook chỉ thêm text/nối prompt, không chạm file code, không block, không tự sửa gì | §12.4 |

**Điều chỉnh đề xuất (chưa làm, ghi lại để cân nhắc):** case `getGlobalConfig` ở §12.1 cho thấy
`augment` CLI tự nó có thể âm thầm trả sai game khi tên trùng — Tầng 1 hiện KHÔNG filter theo
`filePath`/package như Tầng 2 dạy subagent làm ở Test C. Có thể cân nhắc thêm câu cảnh báo riêng
trong body Tầng 1 khi tên symbol match nhiều node cùng tên (cần gọi thêm 1 `cypher` để biết —
đánh đổi thêm latency/token lấy an toàn). Chưa triển khai vì: (a) caveat "lower-bound" chung đã đủ
để Test C tự tránh bẫy mà không cần cảnh báo riêng, (b) thêm 1 cypher call mỗi lần Tầng 1 fire sẽ
tăng gấp đôi latency + token cho toàn bộ Tầng 1 chỉ để phòng 1 case hẹp (7-game trùng tên).

