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
