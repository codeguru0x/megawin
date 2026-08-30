---
name: Result Collector Extension
overview: "Chrome extension MV3 siêu mỏng (WXT + TypeScript), deploy ĐỘC LẬP ngoài monorepo: vào trang nguồn (Vietlott + nhiều web khác), lấy nội dung raw theo config từ server, POST lên Result Collector Service. Không parse, không hiểu luật game -> gần như không phải update khi HTML nguồn đổi."
todos:
  - id: step0-verify
    content: "BƯỚC 0 MỞ RỘNG (~45') — extension throwaway đo 5 thứ: endpoint trả HTML có số, chạy được trong ISOLATED world, header cf-mitigated khi bị challenge, HTML có nonce/timestamp (quyết định hash-dedupe), TTL cf_clearance. CHẶN toàn bộ phần còn lại"
    status: pending
  - id: deploy-decision
    content: "Chốt cách load extension: --load-extension ĐÃ BỊ XOÁ (Chrome 137+) -> P1 dùng Load unpacked 1 lần; song song dựng Enterprise policy + self-hosted CRX cho update từ xa"
    status: pending
  - id: scaffold-wxt
    content: "Scaffold repo độc lập bằng WXT (npm create wxt@latest) + TypeScript strict + pnpm. KHÔNG dùng polyfill browser.*, KHÔNG @webext-core/messaging, KHÔNG Preact"
    status: pending
  - id: manifest-config
    content: "wxt.config.ts: MV3, permissions [alarms, storage, scripting, tabs, cookies, unlimitedStorage], host_permissions <all_urls> + http://localhost/*"
    status: pending
  - id: lib-pure
    content: "lib/ thuần + Vitest TRƯỚC: scheduler (jitter + activeHours theo timezone VN), self-heal FSM (4 outcome + backoff), SourceConfigSchema (Zod), outbox, request builder"
    status: pending
  - id: background
    content: "entrypoints/background.ts: one-shot alarm tự re-arm, ensureTab (1 tab/source, xử lý discarded), executeScript lấy raw, sha256, outbox, POST kèm Idempotency-Key"
    status: pending
  - id: collect-fn
    content: "lib/collect.ts: hàm inject on-demand qua chrome.scripting.executeScript (KHÔNG content script tĩnh), fetch same-origin, đọc header cf-mitigated, trả raw nguyên vẹn"
    status: pending
  - id: remote-config
    content: "Config nguồn tải từ server dạng DATA thuần (DSL đóng, Zod-validated). TUYỆT ĐỐI không eval/new Function — MV3 cấm remote code"
    status: pending
  - id: options-page
    content: "entrypoints/options: vanilla TS (không Preact) — device API key + service URL, log push cuối, trạng thái nguồn, nút test 1 lần"
    status: pending
  - id: heartbeat-killswitch
    content: "Heartbeat mỗi nhịp (deviceId, lastOkAt, consecutiveFailures, trạng thái từng nguồn) + kill-switch đọc từ response"
    status: pending
  - id: test-unit
    content: "Vitest cho lib/ thuần — trọng tâm scheduler (timezone Asia/Ho_Chi_Minh), self-heal FSM exhaustive, config schema reject payload lạ"
    status: pending
  - id: test-e2e-smoke
    content: "1 E2E Playwright happy path (Chromium bundled, KHÔNG channel chrome vì --load-extension đã xoá). 5 case còn lại dời sau P1"
    status: pending
  - id: unattended
    content: "OS tự bật/giữ Chrome sống (LaunchAgent / Task Scheduler) + TẮT Memory Saver (tránh tab discard) + kill-switch/heartbeat"
    status: pending
  - id: deploy-crx
    content: "Enterprise policy ExtensionInstallForcelist + self-hosted CRX/updates.xml (KHÔNG cần Google Workspace) — update từ xa, không cần Developer mode"
    status: pending
  - id: shadow-metrics
    content: "5 metric cho shadow 14 ngày: tỷ lệ cf_challenge/ngày, self-heal thành công, số lần blocked, gap heartbeat dài nhất, số kỳ mất"
    status: pending
---

# Plan 3 — Chrome Extension multi-source (thu thập raw, gửi Service)

> **Bản này đã qua review kỹ thuật sâu (28/08).** Các thay đổi lớn so với bản trước, tất cả đều có
> lý do kỹ thuật cụ thể ghi ngay tại chỗ:
>
> | # | Thay đổi | Vì sao |
> | --- | --- | --- |
> | 1 | **Bỏ `--load-extension`** làm đường deploy | Cờ đã bị **XOÁ khỏi Chrome branded builds từ Chrome 137** (§Deploy) |
> | 2 | **Bỏ content script tĩnh + typed messaging** | `chrome.scripting.executeScript` **trả về giá trị** → cả tầng messaging là dư thừa (§Thu thập raw) |
> | 3 | **Bỏ `browser.*` polyfill, bỏ Preact** | Chrome-only + options page 2 field (§Tech stack) |
> | 4 | **Jitter bằng one-shot alarm, không `sleep()`** | SW bị kill sau 30s idle → `sleep(90s)` mất nhịp (§Scheduler) |
> | 5 | **Thêm outbox + `Idempotency-Key`** | POST fail = mất kỳ vĩnh viễn; và extension không parse nên **không biết `drawPeriodSource`** để server dedupe (§Contract) |
> | 6 | **Thêm `activeHours` có timezone tường minh** | Máy AWS chạy UTC → lệch 7 tiếng so giờ quay VN (§Scheduler) |
> | 7 | **Bỏ screenshot ở P1** | `captureVisibleTab` chỉ chụp tab **active**, xung đột với `active: false` (§Bằng chứng) |
> | 8 | **Cắt E2E 6 case → 1** | Bug thật nằm ở CF/nguồn thật, fixture không mô phỏng được (§Test) |

## App độc lập — tech stack riêng, KHÔNG dùng stack monorepo

Extension deploy ra máy ngoài (AWS WorkSpaces / mini PC), vòng đời và tooling khác hẳn Next.js/Lambda
trong monorepo. Nên đặt trong **repo riêng** (hoặc thư mục `extension/` tách biệt, KHÔNG là workspace
pnpm của monorepo — tránh kéo `@megawin/*` vào bundle client).

## Nguyên tắc thiết kế cốt lõi

Extension chỉ có 2 việc, KHÔNG hơn (analysis §4.5b — extension MỎNG):

1. Sống trong origin trang nguồn để `fetch` mang cookie đã qua Cloudflare (`cf_clearance`).
2. Lấy nội dung RAW theo config → POST lên Result Collector Service (Plan 2).

**KHÔNG parse, KHÔNG hiểu luật game, KHÔNG map drawNo, KHÔNG chia `items[]`.** Toàn bộ logic
đổi-thường-xuyên nằm ở server. Mục tiêu: **HTML nguồn đổi → sửa server, KHÔNG build lại extension.**

⚠️ **Nói đúng giới hạn của mục tiêu này** (bản trước hứa quá): remote config chỉ xoá được nhu cầu
update khi nguồn đổi **URL / header / body / selector**. Vẫn PHẢI build lại extension khi: thêm
`extract.kind` mới, đổi auth scheme, đổi cấu trúc config, cần permission mới.

## Vì sao MV3 extension, KHÔNG CDP/Playwright

Theo analysis §4.7:

- Extension chạy trong Chrome sạch: `navigator.webdriver=false`, không cờ `--enable-automation` → CF
  khó phát hiện nhất.
- CDP/Playwright bật cờ automation → tăng rủi ro CF chặn — đi ngược mục tiêu.
- Cái CDP hơn (tự launch Chrome) đã được OS lo (LaunchAgent/Task Scheduler, ~20 dòng).

## ⛔ Deploy — `--load-extension` ĐÃ BỊ XOÁ, phải đổi cách load

Đây là **blocker nghiêm trọng nhất** của bản plan trước: nó chọn `--load-extension` làm đường deploy
chính, nhưng cờ đó không còn tồn tại. Trên Chrome 145 (máy sẽ chạy), cờ này là **no-op IM LẶNG** —
extension không load, không báo lỗi rõ ràng. Deploy xong tưởng chạy.

| Mốc | Trạng thái `--load-extension` |
| --- | --- |
| Chrome 120+ | Bị disable nếu set qua enterprise policy |
| Chrome 134+ | Extension load bằng cờ bị **disable khi reload** nếu Developer mode OFF |
| **Chrome 137+** | **XOÁ khỏi Chrome branded builds.** Chỉ còn Chromium / Chrome for Testing |
| Chrome 142+ | Workaround `--disable-features=DisableLoadExtensionCommandLineSwitch` **hết tác dụng** |

### Đường 1 — P1, nhanh nhất: Load unpacked thủ công 1 lần

Khớp hoàn hảo với mô hình "người bật Chrome 1 lần" đã chốt ở analysis §4.7.

```bash
# Chrome start — ĐÃ BỎ --load-extension
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$HOME/vietlott-profile" \   # profile riêng, GIỮ cookie cf_clearance
  --no-first-run --no-default-browser-check \
  --disable-session-crashed-bubble \
  --restore-last-session \
  "https://vietlott.vn/vi/trung-thuong/ket-qua-trung-thuong/winning-number-keno"
```

Rồi **1 lần duy nhất**: `chrome://extensions` → Developer mode ON → *Load unpacked* → chọn folder.
Extension **persist trong profile** đó; mọi lần Chrome start sau đều tự load. Update = ghi đè folder +
restart Chrome (unpacked extension đọc lại từ disk lúc browser start).

### Đường 2 — đúng nhất cho máy tự chạy: Enterprise policy + self-hosted CRX

⚠️ Bản plan trước ghi *"`.crx` + Enterprise policy — chỉ khi có Google Workspace"* — **SAI**. Chrome
đọc policy từ **registry/plist local machine**, không cần Workspace, không cần enrollment:

```powershell
# Windows (AWS EC2/WorkSpaces) — ~6 dòng, KHÔNG cần Google Workspace
$k = "HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist"
New-Item -Path $k -Force
Set-ItemProperty -Path $k -Name "1" `
  -Value "<extension-id>;https://s3.../megawin-collector/updates.xml"
```

```bash
# macOS tương đương
sudo defaults write com.google.Chrome ExtensionInstallForcelist \
  -array "<extension-id>;https://s3.../megawin-collector/updates.xml"
```

Hơn Đường 1 ở 4 điểm, đều là thứ sẽ cần liên tục:

- Không cần Developer mode → mất luôn bubble cảnh báo mỗi lần start.
- Chrome **tự poll `update_url` ~5 giờ** → **update từ xa**, không phải vào máy. Đây là lý do chính.
- Không ai vô tình disable/xoá extension được (policy force-install).
- Pin được version, rollback được.

Cần: `chrome --pack-extension=<dir> --pack-extension-key=<pem>` tạo `.crx`, host `.crx` + `updates.xml`
trên S3 (public read, hoặc CloudFront).

**Chốt:** P1 đi bằng Đường 1 để không bị chặn; dựng Đường 2 **trước khi vào P2** vì HTML nguồn sẽ đổi
và bạn không muốn RDP vào máy mỗi lần.

### Ảnh hưởng tới E2E test

Playwright `launchPersistentContext` + `--load-extension` **vẫn chạy** nhưng **chỉ với Chromium bundled
của Playwright**. Nếu ai đặt `channel: "chrome"` thì extension không load và test fail vô cớ. Phải ghi
comment cảnh báo ngay trong file test.

## Tech stack + phiên bản (chốt sau review)

| Lớp | Chọn | Version (2026) | Lý do |
| --- | --- | --- | --- |
| Ngôn ngữ | TypeScript | `~5.9` | strict mode |
| Framework build | **WXT** | `^0.20` | File-based entrypoints, auto manifest, HMR, `wxt zip`. Giữ vì đáng giá |
| Bundler | Vite (WXT quản) | `^6` | Không tự viết `vite.config.ts` |
| Runtime API | **`chrome.*` + `@types/chrome`** | — | ❌ **BỎ `wxt/browser`/polyfill**: chỉ chạy 1 máy Chrome; `chrome.*` đã Promise-based từ MV3; polyfill chỉ làm stack trace khó đọc khi debug máy xa |
| Messaging | **KHÔNG CÓ** | — | ❌ **BỎ `@webext-core/messaging`**: `executeScript` trả về giá trị trực tiếp (§Thu thập raw) |
| Storage | `wxt/storage` | theo WXT | Wrapper type-safe |
| Validation config | **Zod** | `^3` | Config từ server là input KHÔNG tin cậy → phải validate |
| Package manager | pnpm | `^9` | Repo RIÊNG, không phải workspace monorepo |
| Node | Node.js | `>=20` | Yêu cầu WXT |
| Lint/format | Biome | `^2` | Khớp convention team (config riêng) |
| Unit test | Vitest | `^2` | Test `lib/` thuần |
| E2E test | Playwright | `^1.4x` | **1 case** happy path, Chromium bundled |
| UI options | **vanilla TS** | — | ❌ **BỎ Preact**: 2 input + 1 bảng log. Trả lời câu hỏi mở #5 |

Ghi chú: KHÔNG import bất kỳ `@megawin/*` nào. Contract với Service chỉ là HTTP — type tự khai báo
trong `lib/types.ts`, **đồng bộ tay** (như player-sdk ↔ backend, không có compiler bảo vệ).

## Kiến trúc thư mục (WXT — file-based entrypoints)

```
result-collector-extension/            repo riêng (không phải pnpm workspace của monorepo)
  wxt.config.ts                        manifest + permissions + build config
  package.json                         scripts: dev / build / zip / test / e2e
  tsconfig.json                        extends .wxt/tsconfig.json (WXT generate)
  biome.json                           lint/format riêng
  entrypoints/
    background.ts                      SW: alarms, ensureTab, executeScript, hash, outbox, POST, heartbeat
    options/
      index.html
      main.ts                          vanilla TS: device key + service URL, log, trạng thái nguồn
  lib/
    collect.ts                         hàm ĐƯỢC INJECT vào trang nguồn (fetch/đọc DOM, đọc cf-mitigated)
    api.ts                             getSourceConfig, ingest, heartbeat (Bearer device key)
    types.ts                           SourceConfig + Zod schema, IngestPayload (mirror Service)
    scheduler.ts                       interval + jitter + activeHours(timezone) — thuần
    self-heal.ts                       FSM 4 outcome + exponential backoff — thuần
    outbox.ts                          queue bền storage.local, drain có backoff
    hash.ts                            sha256 hex qua crypto.subtle
    storage.ts                         wxt/storage items: deviceKey, serviceUrl, lastLogs, sourceState
  assets/                              icon
  test/
    unit/                              *.test.ts (Vitest) cho lib/
    e2e/                               1 spec happy path
    fixtures/                          trang HTML giả lập nguồn + mock Service
  scripts/
    package-machine.sh                 build + zip + in hướng dẫn cài
    pack-crx.sh                        pack .crx + sinh updates.xml (Đường 2)
```

**KHÔNG có `collector.content.ts`.** Đây là thay đổi kiến trúc, xem section dưới.

## wxt.config.ts

```ts
import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "MegaWin Result Collector",
    manifest_version: 3,
    permissions: [
      "alarms",           // lịch poll
      "storage",          // device key, outbox, log
      "scripting",        // inject hàm collect on-demand
      "tabs",             // ensureTab, reload, phát hiện discarded
      "cookies",          // ĐO TTL cf_clearance (Bước 0 + telemetry vận hành)
      "unlimitedStorage", // outbox chứa raw HTML, tránh trần 10MB của storage.local
    ],
    // Máy nội bộ 1 cái, KHÔNG người ngồi trước máy để bấm permission dialog
    // -> quyền rộng là lựa chọn ĐÚNG ở môi trường này, không phải lười.
    host_permissions: ["<all_urls>", "http://localhost/*"],
  },
});
```

⚠️ Bản trước ghi `host_permissions: ["https://*/*"]` — **thiếu `http://localhost`** cho Service chạy
local khi dev, và `https://*/*` không phủ `http://`.

⚠️ **BỎ `optional_host_permissions` + `permissions.request()`.** `permissions.request()` **bắt buộc
phải trong user gesture** — trên máy không người, không ai bấm dialog được. Giữ nó lại là code chết.

## Thu thập raw — BỎ content script, dùng `executeScript` trả về giá trị

Bản plan trước có **mâu thuẫn nội tại**: nó viết *"`matches` để trống/rộng, kích hoạt theo message từ
background"*. Content script khai báo trong manifest **buộc phải có `matches`** — không có cách "khai
báo mà không match". Muốn động thì phải `chrome.scripting.registerContentScripts()`.

Nhưng cả hai đều không cần: **`chrome.scripting.executeScript` trả về giá trị trực tiếp.**

```ts
// background.ts — không content script, không postMessage, không messaging library
const [{ result }] = await chrome.scripting.executeScript({
  target: { tabId },
  world: "ISOLATED",   // Bước 0 phải VERIFY world nào chạy được (§Bước 0)
  func: collectRaw,    // hàm được serialize -> KHÔNG được dùng closure/import ngoài
  args: [source],      // phải structured-cloneable
});
```

```ts
// lib/collect.ts — hàm này chạy TRONG trang nguồn (origin vietlott.vn)
export type CollectOutcome =
  | { kind: "ok"; raw: string }
  | { kind: "cf_challenge"; status: number }
  | { kind: "http_error"; status: number }
  | { kind: "network_error"; message: string }
  | { kind: "selector_miss"; selector: string };

export async function collectRaw(source: SourceConfig): Promise<CollectOutcome> {
  if (source.extract.kind === "domOuterHTML") {
    const el = document.querySelector(source.extract.selector);
    // DOM đổi là lỗi CONFIG, không phải lỗi CF -> KHÔNG được reload (§Self-heal).
    if (!el) {
      return { kind: "selector_miss", selector: source.extract.selector };
    }
    return { kind: "ok", raw: el.outerHTML };
  }

  try {
    const res = await fetch(source.url, {
      method: source.method,
      headers: source.headers,
      body: source.bodyRendered ?? undefined,
      credentials: "same-origin", // mang cookie cf_clearance
    });

    // Same-origin -> đọc được MỌI response header. Cloudflare gắn `cf-mitigated: challenge`
    // khi trả challenge page thay vì nội dung thật => signal DETERMINISTIC,
    // không phải đoán qua shape response như bản plan trước.
    if (res.headers.get("cf-mitigated")) {
      return { kind: "cf_challenge", status: res.status };
    }
    if (!res.ok) {
      return { kind: "http_error", status: res.status };
    }
    return { kind: "ok", raw: await res.text() };
  } catch (e) {
    return { kind: "network_error", message: String(e) };
  }
}
```

**Xoá khỏi plan:** entrypoint `collector.content.ts`, `lib/messaging.ts`, dependency
`@webext-core/messaging`. Bớt ~80 dòng và một tầng abstraction.

**Lợi ích an toàn kèm theo:** không inject vào mọi trang nữa — chỉ inject đúng tab, đúng lúc, đúng
`host_permissions`.

## Scheduler — one-shot alarm tự re-arm, KHÔNG `sleep()`

Hai lỗi trong bản trước:

1. Ghi *"`chrome.alarms` (min 1 phút)"* — **outdated**: từ **Chrome 120 minimum là 30 giây**
   (`periodInMinutes: 0.5`). Dưới 0.5 bị Chrome cảnh báo và ép về 30s.
2. Ghi *"Jitter trước mỗi request"* — nếu implement thành `await sleep(random(0, 120_000))` thì **SW bị
   terminate sau 30s idle**; `setTimeout` KHÔNG giữ SW sống → mất luôn nhịp đó.

```ts
// lib/scheduler.ts — thuần, test được bằng Vitest
export function nextRunAt(source: SourceConfig, now: number): number {
  const jitter = Math.floor(Math.random() * source.jitterSec) * 1000;
  const candidate = now + source.intervalSec * 1000 + jitter;
  // Keno quay 06:00-21:55 GIỜ VN. Ngoài khung -> dồn tới đầu khung ngày kế tiếp.
  return clampToActiveWindow(candidate, source.activeHours);
}

// ⚠️ Máy AWS mặc định UTC -> new Date().getHours() LỆCH 7 TIẾNG so giờ quay VN.
// Extension sẽ poll đúng lúc không có kỳ nào và ngủ đúng lúc đang quay.
// BẮT BUỘC timezone tường minh, không dùng giờ local của máy.
export function localHHMM(at: number, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(at));
}
```

```ts
// background.ts — jitter nằm trong `when`, re-arm ở CUỐI mỗi lần chạy
async function scheduleNext(source: SourceConfig): Promise<void> {
  await chrome.alarms.create(`src:${source.id}`, { when: nextRunAt(source, Date.now()) });
}

// Listener PHẢI ở top-level, KHÔNG trong async function — register muộn sẽ
// miss event lúc SW vừa start.
chrome.alarms.onAlarm.addListener(handleAlarm);
chrome.runtime.onStartup.addListener(rearmAll);
chrome.runtime.onInstalled.addListener(rearmAll);
```

Hai điều bắt buộc kèm theo:

- **`persistAcrossSessions` chỉ đáng tin từ Chrome 150.** Máy đang 145 → **KHÔNG tin alarm sống qua
  restart**. Phải re-arm ở `onStartup` + `onInstalled` và defensive-check mỗi lần SW wake.
- Thêm alarm `watchdog` chu kỳ 5 phút, việc duy nhất là kiểm tra alarm của từng source còn tồn tại →
  tự chữa nếu mất.

## Tab lifecycle — 1 tab/source, xử lý Memory Saver

Bản trước ghi *"điều tab tới origin (`tabs.create/update`)"*. Trên máy chạy 24/7 với
`--restore-last-session`, `tabs.create` mỗi nhịp → **sau 1 ngày có ~192 tab**.

```ts
async function ensureTab(source: SourceConfig): Promise<number> {
  const saved = await sessionStore.get(`tab:${source.id}`);
  if (saved !== undefined) {
    try {
      const tab = await chrome.tabs.get(saved);
      // Chrome Memory Saver DISCARD tab nền -> executeScript fail. Phải reload trước.
      if (tab.discarded || tab.status !== "complete") {
        await chrome.tabs.reload(saved);
        await waitForComplete(saved);
      }
      return saved;
    } catch {
      // tab đã bị đóng -> rơi xuống nhánh tạo mới
    }
  }
  const tab = await chrome.tabs.create({ url: source.pageUrl, active: false, pinned: true });
  await waitForComplete(tab.id!);
  await sessionStore.set(`tab:${source.id}`, tab.id!);
  return tab.id!;
}
```

**Config OS BẮT BUỘC kèm theo:** tắt **Memory Saver** (`chrome://settings/performance`) hoặc policy
`HighEfficiencyModeEnabled=false`. Nếu không, tab nền bị discard định kỳ → fail rải rác không giải
thích được.

## Self-heal — phân loại outcome + exponential backoff

Bản trước: fail → reload → retry → blocked. **Thiếu backoff.** Reload liên tục mỗi 5 phút là mẫu hành
vi bot rõ nhất → sẽ khiến Cloudflare siết từ Managed lên Interactive, **tự phá hỏng giả định cốt lõi
của P-D**.

Và quan trọng hơn: 4 outcome cần **hành động trái ngược nhau**, gộp chung thì reload vô ích đồng thời
che mất lỗi config thật.

| Outcome | Hành động | Vì sao KHÔNG làm cách khác |
| --- | --- | --- |
| `ok` | Reset backoff, POST | — |
| `cf_challenge` | `tabs.reload` (tối đa 2 lần/nhịp) → chờ complete → retry. Vẫn fail: backoff ×2, cap 30' | Navigation để **browser tự giải** JS challenge; `fetch` không tự giải (analysis §4.7) |
| `http_error` 403/503 | Backoff ×2 NGAY, **KHÔNG reload** | Reload không sửa được lỗi phía server; reload thêm chỉ tăng dấu vết |
| `network_error` | Giữ outbox, retry nhịp sau, **KHÔNG reload** | Mất mạng — reload vô nghĩa |
| `selector_miss` | **KHÔNG retry, KHÔNG reload.** Báo `blocked` kèm `reason` → server sửa config | DOM đổi là lỗi CONFIG. Reload sẽ lặp vô hạn và che mất nguyên nhân |

```ts
// lib/self-heal.ts — FSM thuần. Dùng useExhaustiveSwitchCases để compiler bắt thiếu nhánh.
export function nextState(prev: SourceState, outcome: CollectOutcome["kind"]): SourceState;
```

## Contract với Service — hash làm idempotency key

**Gap giữa Plan 1 và Plan 2 (phát hiện khi review):** `p1-service.plan.md` đặt
`dedupeKey = ${source}:${gameKey}:${drawPeriodSource}` và body ingest có `items[{ drawPeriodSource, ... }]`.
Nhưng extension **KHÔNG parse** → **không biết `drawPeriodSource`**, cũng không biết chia `items[]`.
Hai plan không khớp nhau ở chính chỗ quan trọng nhất.

→ Extension gửi **content hash** làm idempotency key. Server dedupe theo hash **TRƯỚC KHI parse**:

```ts
const contentHash = await sha256Hex(raw);

await fetch(`${serviceUrl}/api/ingest`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${deviceKey}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `${source.id}:${contentHash}`,
  },
  body: JSON.stringify({
    sourceId: source.id,
    gameKey: source.gameKey,   // từ CONFIG, không phải parse ra
    raw,                       // 1 blob raw, server tự tách kỳ
    contentHash,
    capturedAt: new Date().toISOString(),
    sourceUrl: source.url,
    deviceId,
  }),
  // <30s: nếu fetch treo quá 30s, Chrome KILL service worker giữa lúc chờ.
  signal: AbortSignal.timeout(20_000),
});
```

**Bonus lớn từ cùng cái hash — cắt ~80% traffic:** poll 5 phút × 16 tiếng ≈ 192 lần/ngày, phần lớn nội
dung **y hệt lần trước**. Nếu `contentHash` trùng lần trước → **KHÔNG POST, chỉ heartbeat**. Vẫn zero
parsing ở client.

⚠️ Điều kiện: HTML fragment **không chứa nonce/timestamp** làm hash luôn đổi. **Phải verify ở Bước 0.**

## Outbox — không được mất kỳ khi mạng đứt

POST fail (mất mạng, Service deploy, 502) → raw bay luôn, kỳ đó **mất vĩnh viễn** vì lần poll sau
`TotalRow` có thể đã trượt qua.

```ts
// lib/outbox.ts — queue bền trong storage.local
type OutboxItem = { id: string; payload: IngestPayload; attempts: number; nextAt: number };
// Sau mỗi collect: enqueue TRƯỚC, rồi mới drain. Drain có backoff.
const MAX_ITEMS = 5; // tràn -> drop oldest, ghi log
```

⚠️ **Ràng buộc quota:** `chrome.storage.local` mặc định **10MB**. Raw `HtmlContent` với `TotalRow: 200`
ước ~200–500KB/item → 5 item đã ~2.5MB. Làm **cả hai** cách sau:

1. Permission `unlimitedStorage` (miễn phí, không thêm cảnh báo cài đặt).
2. **Giảm `TotalRow` cho poll thường xuống 30.** Keno 10 phút/kỳ → 30 kỳ ≈ 5 tiếng lịch sử, dư phủ mọi
   downtime ngắn. `TotalRow: 200` chỉ dùng cho **backfill** khi phát hiện gap > 3 tiếng. Giảm payload
   ~6×, giảm cả footprint lẫn "độ ồn" của request. (Bản trước dùng 200 cho mọi lần poll.)

## Remote config — là DATA, TUYỆT ĐỐI không phải CODE

Bản trước nói extension *"thực thi mù"* config từ server. Ý tưởng đúng nhưng **thiếu ranh giới → khi
implement sẽ trượt sang `new Function(config.code)`**. MV3 **CẤM remote code execution**: CSP không cho
`eval`/`new Function`, không load script remote. Vi phạm = extension bị Chrome vô hiệu hoá.

**Ranh giới phải viết rõ: config là DSL ĐÓNG, versioned, Zod-validated.**

```ts
// lib/types.ts — mirror TAY với Service (không có compiler bảo vệ, như player-sdk ↔ backend)
export const SourceConfigSchema = z.object({
  version: z.literal(1),               // đổi shape -> bump, extension từ chối version lạ
  id: z.string(),
  gameKey: z.string(),
  pageUrl: z.string().url(),           // tab điều tới
  url: z.string(),                     // endpoint fetch (relative = same-origin)
  method: z.enum(["GET", "POST"]),
  headers: z.record(z.string()),
  bodyTemplate: z.string().optional(), // CHỈ placeholder whitelist: {{today}}, {{totalRow}}, {{gameId}}
  extract: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("responseText") }),
    z.object({ kind: z.literal("domOuterHTML"), selector: z.string() }),
  ]),
  intervalSec: z.number().int().positive(),
  jitterSec: z.number().int().nonnegative(),
  activeHours: z.object({
    tz: z.string(),                    // "Asia/Ho_Chi_Minh" — BẮT BUỘC, không dùng giờ máy
    from: z.string(),                  // "06:00"
    to: z.string(),                    // "21:55"
  }),
  totalRow: z.number().int().positive().default(30),
});
```

`bodyTemplate` thay placeholder bằng **whitelist cứng** trong code extension — KHÔNG phải template
engine tổng quát, KHÔNG cho phép expression.

Config lỗi schema → **dùng config cache lần trước** + báo `blocked` kèm reason. Không bao giờ chạy
config không validate được.

## Bằng chứng — bỏ screenshot ở P1

`chrome.tabs.captureVisibleTab` chỉ chụp được **tab đang active của window**. Nhưng tab thu thập phải
`active: false` (không cướp focus, không tạo hành vi lạ). **Hai yêu cầu loại trừ nhau.**

Và bộ `raw` + `contentHash` + `capturedAt` + `sourceUrl` + `cf-mitigated` **là bằng chứng TỐT HƠN ảnh**:
machine-verifiable, diff được, rẻ. Ảnh chỉ để người xem, tốn dung lượng, không chứng minh thêm gì.

→ **Bỏ hẳn todo screenshot ở P1.** Trả lời luôn câu hỏi mở của analysis §6 #16: raw HTML là đủ. Nếu
Risk vẫn đòi ảnh, làm ở P2 bằng `chrome.windows.create({ focused: false })` với window riêng 1 tab.

Kéo theo: `p1-service.plan.md` bỏ `screenshotUrl` / `screenshotBase64` khỏi P1 scope.

## options page — vanilla TS

- Nhập & lưu: device API key, Service base URL. Nút **rotate key** (không cần rebuild).
- Hiển thị: log push gần nhất, trạng thái mỗi nguồn (lần lấy cuối, ok/blocked + reason, backoff hiện
  tại), độ sâu outbox, TTL `cf_clearance` còn lại (từ `chrome.cookies`).
- Nút "Test 1 lần" cho từng nguồn.

## Heartbeat + kill-switch

- POST `/api/heartbeat` **mỗi nhịp**, kể cả khi không có kỳ mới và cả khi hash trùng (không POST ingest).
- Payload: `deviceId`, `chromeVersion`, `lastOkAt`, `consecutiveFailures`, `outboxDepth`,
  `perSource: [{ id, state, reason, backoffSec }]`, `cfClearanceExpiresAt`.
- **Kill-switch:** response trả `{ paused: true }` → extension ngừng push ngay. Dừng từ xa không cần vào
  máy. Đọc mỗi nhịp, không cache.
- Server mất heartbeat > N phút → alert hạ tầng vào `/system/workers` (KHÔNG vào `ops_alerts`, analysis §4.5).

## Bảo mật — sửa 1 tuyên bố sai của bản trước

Bản trước/analysis ghi *"không lộ device key"*. **Không chính xác:** `chrome.storage.local` là
**plaintext trên disk** (`Local Extension Settings/<id>/`). Ai vào được máy AWS đọc được key trong 10
giây. Nói đúng phải là *"bề mặt hẹp hơn Web Store"*.

Mitigation bắt buộc:

- Device key **scope tối thiểu**: chỉ `POST /api/ingest` + `/api/heartbeat`. Không đọc, không list,
  không xoá.
- **Rate-limit theo `deviceId`** phía Service (chặn key lộ đem spam).
- Rotate được từ options page.
- Server **chạy lại 100% 3 lớp verify** — đây là lớp bảo vệ THẬT, không phải secrecy của key
  (analysis §4.6 đã đúng ở điểm này).

## ⛔ BƯỚC 0 MỞ RỘNG (~45') — chặn toàn bộ, làm TRƯỚC TIÊN

Bản trước chỉ đo 1 thứ (endpoint có trả HTML có số) bằng snippet DevTools Console. **Thiếu 4 phép đo,
mỗi cái đều quyết định kiến trúc** — nếu không đo trước, phát hiện sau khi code xong thì phải sửa lớn.

Điểm gap nghiêm trọng nhất: **DevTools Console = MAIN world**, còn production chạy **ISOLATED world**.
Nếu ISOLATED fail (site chặn, hoặc cần biến từ MAIN scope) thì phải đổi sang `world: "MAIN"` — và chỉ
biết sau khi đã viết xong background.

Dựng 1 extension **throwaway ~25 dòng** (load unpacked) để đo:

| # | Đo | Cách | Quyết định phụ thuộc |
| --- | --- | --- | --- |
| 1 | Endpoint AjaxPro trả HTML có số | Snippet analysis §4.8 | P-D khả thi / fallback `domOuterHTML` |
| 2 | **Cùng snippet chạy được trong ISOLATED world** | `executeScript({ world: "ISOLATED" })` | `world` nào cho production — **ảnh hưởng kiến trúc** |
| 3 | **Header `cf-mitigated` khi bị challenge** | `res.headers.get("cf-mitigated")` | Detect CF **deterministic** hay phải đoán qua shape |
| 4 | **HTML có nonce/timestamp?** | Gọi 2 lần cách 10s, so `sha256` | Có dùng được hash-dedupe (cắt ~80% traffic) hay không |
| 5 | **TTL `cf_clearance`** | `chrome.cookies.get()` → `expirationDate` | Tần suất reload thật; có bao giờ cần người hay không (analysis §4.7 ghi "CHƯA ĐO") |

Nếu #1 fail → fallback `extract.kind = "domOuterHTML"` trên trang đang hiển thị: chậm hơn (phải phân
trang) nhưng chắc chắn hoạt động vì đó đúng là những gì user đang xem.

## Test — cắt scope, dồn effort vào nơi bug thật sống

Bản trước đặt **6 case E2E + fixture server + mock Service** cho một extension ~350 dòng. Đây là
over-engineering: fixture giả lập chỉ test lại code mình vừa viết, còn phần khó thật — **Cloudflare
thật, endpoint AjaxPro thật, TTL `cf_clearance`, tab discard sau 8 tiếng, alarm mất sau restart** — thì
E2E **không mô phỏng được**.

| Tầng | Bản trước | Bản này |
| --- | --- | --- |
| Unit (Vitest) | 4 file | **Giữ + mở rộng.** Đây là chỗ đáng test: pure, nhiều nhánh |
| E2E (Playwright) | 6 case + 2 fixture server | **1 case happy path.** Case 2–6 dời sau khi P1 ổn |
| Shadow nguồn thật | "1–2 ngày" | **14 ngày + 5 metric** — tầng quan trọng nhất, dồn effort cắt được vào đây |

### Unit (Vitest) — `lib/` thuần, không cần browser

- **`scheduler.test.ts`** (ưu tiên cao nhất): jitter trong biên `[interval, interval+jitterMax]`; nhiều
  nguồn không dồn cùng lúc; **`activeHours` với `TZ=UTC` của process vẫn ra đúng giờ VN** ← case này bắt
  đúng bug máy AWS; biên 21:55 → dồn sang 06:00 hôm sau; qua nửa đêm.
- **`self-heal.test.ts`**: FSM đủ 5 outcome × mọi state; backoff ×2 và cap 30'; `selector_miss` **không**
  reload; `cf_challenge` reload tối đa 2 lần. Dùng `nursery/useExhaustiveSwitchCases`.
- **`types.test.ts`**: `SourceConfigSchema` **reject** version lạ, `extract.kind` lạ, `bodyTemplate` có
  placeholder ngoài whitelist, thiếu `activeHours.tz`.
- **`outbox.test.ts`**: enqueue trước drain; drop oldest khi vượt `MAX_ITEMS`; backoff tăng theo `attempts`.
- **`api.test.ts`**: header `Authorization: Bearer` + `Idempotency-Key` đúng format; body khớp
  `IngestPayload`; mock `fetch`.

### E2E (Playwright) — 1 case

```ts
// ⚠️ PHẢI dùng Chromium bundled của Playwright.
// --load-extension đã bị XOÁ khỏi Chrome branded (137+) -> KHÔNG được đặt channel: "chrome".
const ctx = await chromium.launchPersistentContext(userDataDir, {
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
});
```

Happy path: mock `/api/source-config` → extension `ensureTab` tới trang nguồn giả → `executeScript` lấy
raw → POST `/api/ingest` → assert mock nhận đúng `raw` + `contentHash` + header device key.

### Shadow 14 ngày — 5 metric (bám cửa ra P1 của analysis §5)

1. Tỷ lệ `cf_challenge` / ngày.
2. Số lần self-heal thành công vs thất bại.
3. Số lần vào state `blocked` + reason breakdown.
4. Gap heartbeat dài nhất.
5. **Số kỳ mất** (so raw đã gửi vs kết quả thật) — metric quan trọng nhất.

CI: `pnpm lint && pnpm check-types && pnpm test` mọi PR; `test:e2e` nightly.

## Scripts

```json
{
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "pack-crx": "./scripts/pack-crx.sh",
    "check-types": "tsc --noEmit",
    "lint": "biome check .",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "postinstall": "wxt prepare"
  }
}
```

**Dev:** `pnpm install` → `pnpm dev` (HMR) → options page nhập `serviceUrl` + `deviceKey` (Service
local Plan 2) → nút "Test 1 lần".

⚠️ Lưu ý khi dev: **extension load unpacked KHÔNG bị giới hạn 30s của alarm** → nhịp ở dev nhanh hơn
production. Đừng kết luận về timing từ dev.

## Vận hành 100% tự động (analysis §4.7)

Mô hình: người bật Chrome 1 lần (qua CF interactive lần đầu nếu có), sau đó tự động hoàn toàn. Máy = 1
instance AWS WorkSpaces/EC2 Windows GUI (hoặc mini PC).

| Tầng | Việc | Bắt buộc? | Cách |
| --- | --- | --- | --- |
| 1 | Máy luôn bật | Tùy chọn | macOS `pmset` · Windows power plan · AWS: instance luôn on |
| 2 | OS tự đăng nhập | Tùy chọn | macOS auto-login · Windows `Autologon` |
| 3 | Chrome tự sống lại | **Bắt buộc** | macOS LaunchAgent `KeepAlive=true` · Windows Task Scheduler (restart on fail) |
| 4 | Extension tự làm việc | **Bắt buộc** | `chrome.alarms` + `onStartup` re-arm |
| **5** | **TẮT Memory Saver** | **Bắt buộc — MỚI** | `chrome://settings/performance` hoặc policy `HighEfficiencyModeEnabled=false`. Không tắt → tab nền bị discard → fail rải rác |

Chrome flags (đã bỏ `--load-extension`):

```bash
--user-data-dir="$HOME/vietlott-profile"   # GIỮ cookie cf_clearance
--no-first-run --no-default-browser-check
--disable-session-crashed-bubble
--restore-last-session
```

**KHÔNG `--headless`** (mất toàn bộ lợi thế P-D). **KHÔNG `--remote-debugging-port`** (bật cờ automation).

## Vì sao thiết kế này tối ưu (ít update)

- Logic parse/verify/map → SERVER. Extension chỉ vận chuyển raw.
- Danh sách nguồn + cách lấy → SERVER config (DSL đóng), extension tải về.
- HTML 1 nguồn đổi → sửa parser/config server. Nguồn thêm CF → self-heal hoặc alert.
- Với Đường 2 (Enterprise policy + CRX), khi **buộc** phải update extension thì cũng update được **từ
  xa**, không cần vào máy.

## Không làm

- KHÔNG parse ở client.
- KHÔNG hardcode nguồn trong extension (dùng remote config).
- KHÔNG `eval`/`new Function` trên config — MV3 cấm remote code, extension sẽ bị vô hiệu hoá.
- KHÔNG dùng CDP/Playwright cho production (cờ automation → CF).
- KHÔNG đưa Web Store.
- KHÔNG dùng `--load-extension` (đã bị xoá từ Chrome 137).
- KHÔNG `sleep()` trong service worker để jitter (SW bị kill sau 30s).
- KHÔNG `permissions.request()` (cần user gesture — máy không người).

## Thứ tự thực thi — đường ngắn nhất tới P1

| # | Việc | Công | Ghi chú |
| --- | --- | --- | --- |
| 1 | **Bước 0 mở rộng** (5 phép đo) | 45' | **CHẶN mọi thứ.** Không có kết quả này thì mọi dòng code là đánh cược |
| 2 | Chốt deploy + sửa analysis §4.7/§4.8 bỏ `--load-extension` | 30' | Load unpacked cho P1; quyết định làm CRX ngay hay sau |
| 3 | Scaffold + `lib/` thuần + Vitest | 0,5 ngày | Test trước, không cần browser |
| 4 | `background.ts` + `collect.ts` | 0,5 ngày | `ensureTab` → `executeScript` → hash → outbox → POST |
| 5 | Options vanilla + heartbeat/kill-switch | 0,5 ngày | |
| 6 | Deploy máy + tắt Memory Saver + LaunchAgent/Task Scheduler | 0,5 ngày | Config OS |
| 7 | **Shadow 14 ngày** + 5 metric | — | Cửa ra P1, không rút ngắn được |

Tổng code ~**2 ngày**. Analysis §4.8 ước *"0,5–1 ngày"* — **thiếu**, vì chưa tính outbox, tab lifecycle,
backoff, timezone, watchdog. Nhưng vẫn rẻ hơn bản plan trước nhờ cắt Preact + messaging + 5 E2E case.

## Câu hỏi mở — đã chốt phần lớn khi review

| Câu hỏi bản trước | Chốt |
| --- | --- |
| Options page Preact hay vanilla? | **Vanilla.** 2 input + 1 bảng log |
| `host_permissions` rộng hay xin động? | **Rộng `<all_urls>`.** Máy không người → `permissions.request()` không dùng được |
| Có cần screenshot mặc định? | **Không ở P1.** Xung đột `active: false`; raw+hash là bằng chứng tốt hơn |
| Có cần cross-browser? | **Không.** Chrome-only → bỏ polyfill |
| Repo riêng hay `extension/` cạnh monorepo? | Cả hai đều được, miễn **KHÔNG là pnpm workspace** |
| Config poll lại mỗi bao lâu? | Mỗi nhịp (rẻ, đi kèm heartbeat) — cache + fallback config cũ nếu fail |

Còn mở (cần người quyết):

- Ngưỡng mất heartbeat để alert (phút)? → analysis §6 #14.
- Làm Enterprise policy + CRX ngay ở P1, hay chờ P2?
- Nhịp poll bao nhiêu phút (quyết định NGHIỆP VỤ — analysis §6 #10)?

