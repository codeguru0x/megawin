/**
 * Guard hợp đồng query param giữa **producer** (chỗ dựng link) và **consumer** (page đọc param).
 *
 * Chạy: `pnpm --filter @megawin/backoffice check:url-params`
 *
 * VÌ SAO CẦN: `nuqs` **im lặng bỏ qua** key nó không khai báo và **im lặng fallback default** khi
 * giá trị ngoài enum. Link sai key/sai giá trị vẫn mở trang bình thường, chỉ hiển thị SAI dữ liệu
 * so với ý định của staff — không exception, không log, không ai phát hiện. Đây là lỗi đã xảy ra
 * thật: `reports/settle` (tab đại lý) dựng `?tenant=` trong khi trang game đọc `tenantId` → filter
 * đại lý bị mất; và `report-views.ts` (renderer AI) dựng `?tab=game` trong khi enum là
 * `["daily","by-game","by-tenant"]` → rơi về tab `daily`.
 *
 * **Check 1 — key.** Mọi query key producer sinh ra PHẢI nằm trong tập key mà route đích thực sự
 * đọc. Chỉ báo lỗi khi route đích **có** cơ chế đọc query param (nuqs/useSearchParams) mà thiếu
 * đúng key đó — route không đọc param nào thì không thể kết luận, xếp vào INFO.
 *
 * **Check 2 — giá trị enum.** Với key khai báo qua `parseAsStringEnum([...])` /
 * `parseAsStringLiteral(CONST)`, giá trị literal do producer ghi PHẢI thuộc tập cho phép.
 *
 * GIỚI HẠN CÓ CHỦ ĐÍCH: phân tích tĩnh bằng regex, không dựng AST. Giá trị nội suy (`${...}`) bỏ
 * qua ở check 2. Path `/api/**` bỏ qua (contract khác — Zod schema ở route handler đã chặn).
 *
 * Hàm thu thập CONSUMER (route → key/enum thực đọc) sống ở `_lib/route-query-collector.ts` — dùng
 * CHUNG với `check-nav-registry.ts` (p1-04 §4.2 plan), KHÔNG copy regex ra bản riêng ở đây.
 *
 * Exit code != 0 nếu vi phạm → dùng trong CI.
 */

import { collectRouteConsumers, listSourceFiles, matchRoute, objectLiteralKeys } from "./_lib/route-query-collector";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** `src/scripts/check-url-params.ts` -> `src`. */
const srcRoot = dirname(dirname(new URL(import.meta.url).pathname));
const appRoot = join(srcRoot, "app");

/** Route đích không thuộc app router (redirect ngoài, asset) → không kết luận được. */
const IGNORED_PATH_PREFIX = ["/api/"] as const;

/**
 * Số ký tự nhìn ngược trước literal để nhận ra lời gọi HTTP client.
 *
 * `apiClient.get("/accounts/players?…")` gọi **API** (`apiClient` tự prefix `/api`) nhưng path
 * trùng route page `/accounts/players` → nếu không loại trừ sẽ báo sai. Contract của API do Zod
 * schema ở route handler chặn, không thuộc phạm vi guard này.
 */
const HTTP_CALL_LOOKBEHIND = 160;
/** Dấu hiệu literal là URL của HTTP client, không phải link điều hướng. */
const HTTP_CALL_RE = /\b(?:apiClient\.\w+|fetch)[^(]*\(\s*$/;

/** Literal chứa query string: group 1 = path (bắt đầu `/` hoặc `${`), group 2 = phần sau `?`. */
const URL_LITERAL_RE = /["'`]((?:\/|\$\{)[^"'`?]*)\?([^"'`]*)["'`]/g;
/** `const NAME = "value"` — resolve `${OPS_BASE}` về path thật. */
const STRING_CONST_RE = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*["'`]([^"'`]+)["'`]/g;
/** `new URLSearchParams({` — bóc object literal để lấy key. */
const URL_SEARCH_PARAMS_RE = /new URLSearchParams\(\s*\{/g;

// ── Thu thập CONSUMER: route nào đọc key nào ────────────────────────────────────────────────────
const routes = collectRouteConsumers(appRoot);

// ── Thu thập PRODUCER: link nào ghi key nào ─────────────────────────────────────────────────────
interface ProducedLink {
  file: string;
  line: number;
  /** Segment path, `*` = phần nội suy `${…}` không xác định tĩnh. */
  segments: string[];
  /** Key → giá trị literal (`undefined` khi giá trị là biểu thức nội suy). */
  params: Map<string, string | undefined>;
}

const produced: ProducedLink[] = [];

for (const file of listSourceFiles(srcRoot)) {
  const source = readFileSync(file, "utf8");
  const stringConsts = new Map<string, string>();
  for (const match of source.matchAll(STRING_CONST_RE)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      stringConsts.set(name, value);
    }
  }

  // Key của `new URLSearchParams({ … })` — gắn cho link dạng `…?${params.toString()}` cùng file.
  const searchParamsKeys = new Set<string>();
  for (const match of source.matchAll(URL_SEARCH_PARAMS_RE)) {
    for (const key of objectLiteralKeys(source, match.index + match[0].length - 1)) {
      searchParamsKeys.add(key);
    }
  }

  for (const match of source.matchAll(URL_LITERAL_RE)) {
    const rawPath = match[1];
    const rawQuery = match[2];
    if (rawPath === undefined || rawQuery === undefined) {
      continue;
    }
    const resolvedPath = rawPath.replace(/\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g, (whole, name: string) => {
      const known = stringConsts.get(name);
      return known ?? whole;
    });
    const pathOnly = resolvedPath.replace(/\$\{[^}]*\}/g, "*");
    if (IGNORED_PATH_PREFIX.some((prefix) => pathOnly.startsWith(prefix)) || !pathOnly.startsWith("/")) {
      continue;
    }
    if (HTTP_CALL_RE.test(source.slice(Math.max(0, match.index - HTTP_CALL_LOOKBEHIND), match.index))) {
      continue;
    }

    const params = new Map<string, string | undefined>();
    for (const pair of rawQuery.split("&")) {
      const keyMatch = /^([a-zA-Z][a-zA-Z0-9]*)=(.*)$/.exec(pair);
      const key = keyMatch?.[1];
      if (keyMatch === null || key === undefined) {
        continue;
      }
      const rawValue = keyMatch[2] ?? "";
      params.set(key, rawValue.includes("${") || rawValue.length === 0 ? undefined : rawValue);
    }
    // `?${params.toString()}` → không có key nào parse được từ literal; lấy từ URLSearchParams.
    if (params.size === 0 && rawQuery.includes("${") && searchParamsKeys.size > 0) {
      for (const key of searchParamsKeys) {
        params.set(key, undefined);
      }
    }
    if (params.size === 0) {
      continue;
    }

    produced.push({
      file,
      line: source.slice(0, match.index).split("\n").length,
      segments: pathOnly.split("/").filter((s) => s.length > 0),
      params,
    });
  }
}

// ── Đối chiếu ──────────────────────────────────────────────────────────────────────────────────
const keyErrors: string[] = [];
const valueErrors: string[] = [];
const unresolved: string[] = [];

for (const link of produced) {
  const target = matchRoute(link.segments, routes);
  const where = `${relative(srcRoot, link.file)}:${link.line}`;
  const href = `/${link.segments.join("/")}`;

  if (target === undefined || !target.parsesQuery) {
    unresolved.push(`${where} → ${href} (${[...link.params.keys()].join(", ")})`);
    continue;
  }

  for (const [key, value] of link.params) {
    if (!target.keys.has(key)) {
      keyErrors.push(`${where} ghi \`${key}=\` → ${href} chỉ đọc: ${[...target.keys].sort().join(", ")}`);
      continue;
    }
    const allowed = target.enums.get(key);
    if (value !== undefined && allowed !== undefined && !allowed.has(value)) {
      valueErrors.push(`${where} ghi \`${key}=${value}\` → ${href} chỉ nhận: ${[...allowed].sort().join(", ")}`);
    }
  }
}

let failed = false;

if (keyErrors.length > 0) {
  failed = true;
  console.error(`❌ ${keyErrors.length} link ghi query key mà trang đích KHÔNG đọc:\n`);
  for (const line of keyErrors) {
    console.error(`  ${line}`);
  }
  console.error("\n`nuqs` bỏ qua key lạ trong im lặng → trang mở bình thường nhưng MẤT filter.");
  console.error("Sửa: đổi key ở producer cho khớp, hoặc khai báo key đó ở trang đích.\n");
}

if (valueErrors.length > 0) {
  failed = true;
  console.error(`❌ ${valueErrors.length} link ghi giá trị ngoài enum của trang đích:\n`);
  for (const line of valueErrors) {
    console.error(`  ${line}`);
  }
  console.error("\n`parseAsStringEnum`/`parseAsStringLiteral` fallback về default trong im lặng.");
  console.error("Sửa: dùng đúng giá trị enum, hoặc mở rộng enum ở trang đích.\n");
}

if (failed) {
  process.exit(1);
}

console.log(
  `✅ Hợp đồng query param sạch — ${routes.size} route, ${produced.length} link nội bộ đối chiếu, ` +
    `0 sai key, 0 sai giá trị enum (${unresolved.length} link tới route không đọc query — bỏ qua).`,
);
