/**
 * Thu thập CONSUMER route: quét `app/(main)/**` để biết mỗi route đọc query key nào qua `nuqs`
 * (`useQueryState`/`useQueryStates`) hoặc `searchParams.get`, và giá trị enum hợp lệ của key đó.
 *
 * Dùng chung bởi 2 guard (p1-04 §4.2 plan — "tách hàm thu thập key/enum consumer... KHÔNG copy
 * regex sang script mới, hai bản regex sẽ lệch nhau"):
 * - `check-url-params.ts` — đối chiếu MỌI link nội bộ (không biết gì về registry).
 * - `check-nav-registry.ts` — đối chiếu `params` khai trong `nav-registry.ts` với key/enum route
 *   thực đọc (check 2, 3 của §4.2).
 *
 * GIỚI HẠN CÓ CHỦ ĐÍCH: phân tích tĩnh bằng regex, không dựng AST — xem giải trình đầy đủ ở
 * JSDoc header `check-url-params.ts`. Sửa regex ở ĐÂY, không copy sang script khác.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SOURCE_EXT = [".ts", ".tsx"] as const;
const SKIP_DIRS = new Set(["node_modules", ".next", "scripts"]);

/** `useQueryState("key", <parser…>)` — group 1 = key, group 2 = phần parser tới hết dòng logic. */
const QUERY_STATE_RE = /useQueryState\(\s*["']([a-zA-Z][a-zA-Z0-9]*)["']\s*,?([^;]*)/g;
/** `useQueryStates(` — cần bóc object literal ngay sau đó bằng brace matching. */
const QUERY_STATES_RE = /useQueryStates\(\s*\{/g;
/** `searchParams.get("key")` / `useSearchParams().get("key")`. */
const SEARCH_PARAMS_GET_RE = /\.get\(\s*["']([a-zA-Z][a-zA-Z0-9]*)["']\s*\)/g;
/** `const NAME = [...] as const` — resolve enum của `parseAsStringLiteral(NAME)`. */
const ARRAY_CONST_RE = /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\[([^\]]*)\]\s*as const/g;

export interface RouteInfo {
  /** Segment của route, `[param]` giữ nguyên. VD `["games", "keno", "reports", "settle"]`. */
  segments: string[];
  /** Key mà route này thực sự đọc. */
  keys: Set<string>;
  /** Giá trị hợp lệ cho key kiểu enum (chỉ key khai báo enum/literal mới có entry). */
  enums: Map<string, Set<string>>;
  /** Route có bất kỳ cơ chế đọc query param nào hay không. */
  parsesQuery: boolean;
  /** Path tuyệt đối thư mục route (chứa `page.tsx`) — dùng để grep bổ sung trong `_lib`/`_components`. */
  routeDir: string;
}

/**
 * Liệt kê đệ quy mọi file `.ts`/`.tsx` dưới `dir`.
 *
 * @param dir - Thư mục bắt đầu quét.
 * @returns Danh sách path tuyệt đối.
 */
export function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) {
      continue;
    }
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (SOURCE_EXT.some((ext) => name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Bóc key top-level của object literal bắt đầu ngay sau `openIndex` (vị trí của `{`).
 *
 * Dùng cho `useQueryStates({ … })` và `new URLSearchParams({ … })` — chỉ lấy `ident:` ở độ sâu 1
 * để không nhặt lẫn key của object lồng trong parser option.
 *
 * @param source - Toàn bộ source file.
 * @param openIndex - Index của dấu `{` mở object.
 * @returns Danh sách key ở depth 1.
 */
export function objectLiteralKeys(source: string, openIndex: number): string[] {
  const keys: string[] = [];
  let depth = 0;
  let i = openIndex;
  let atDepthOneStart = false;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "{" || ch === "[" || ch === "(") {
      depth += 1;
      atDepthOneStart = depth === 1;
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]" || ch === ")") {
      depth -= 1;
      if (depth === 0) {
        break;
      }
      i += 1;
      continue;
    }
    if (depth === 1) {
      const rest = source.slice(i);
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(rest);
      if (match?.[1] !== undefined && (atDepthOneStart || source[i - 1] === "," || /\s/.test(source[i - 1] ?? ""))) {
        keys.push(match[1]);
        i += match[0].length;
        atDepthOneStart = false;
        continue;
      }
    }
    i += 1;
  }
  return keys;
}

/**
 * Route directory gần nhất (đi lên từ file) có `page.tsx` — nơi param của file này được đọc.
 *
 * Hook/component sống trong `_lib/`, `_components/` nên phải quy về page cha.
 *
 * @param file - Path tuyệt đối file trong `src/app`.
 * @param appRoot - Path tuyệt đối `src/app`.
 * @returns Path tuyệt đối thư mục route, hoặc `undefined` nếu không thuộc route nào.
 */
export function ownerRouteDir(file: string, appRoot: string): string | undefined {
  let dir = dirname(file);
  while (dir.startsWith(appRoot)) {
    if (existsSync(join(dir, "page.tsx"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return undefined;
}

/**
 * Đổi thư mục route thành segment, bỏ route group `(main)` (không xuất hiện trong URL).
 *
 * @param routeDir - Path tuyệt đối thư mục chứa `page.tsx`.
 * @param appRoot - Path tuyệt đối `src/app`.
 * @returns Danh sách segment URL.
 */
export function routeSegments(routeDir: string, appRoot: string): string[] {
  return relative(appRoot, routeDir)
    .split("/")
    .filter((s) => s.length > 0 && !(s.startsWith("(") && s.endsWith(")")));
}

/**
 * Tập giá trị enum khai báo trong đoạn parser của 1 `useQueryState`.
 *
 * Nhận 2 dạng: `parseAsStringEnum<T>(["a","b"])` (inline) và `parseAsStringLiteral(CONST)`
 * (tra `arrayConsts` của cùng file).
 *
 * @param parserChunk - Phần sau key trong câu `useQueryState`.
 * @param arrayConsts - Map const array literal của file đang phân tích.
 * @returns Tập giá trị hợp lệ, hoặc `undefined` nếu key không phải enum.
 */
export function enumValues(parserChunk: string, arrayConsts: Map<string, Set<string>>): Set<string> | undefined {
  const inline = /parseAs(?:StringEnum|StringLiteral)\s*(?:<[^>]*>)?\s*\(\s*\[([^\]]*)\]/.exec(parserChunk);
  if (inline?.[1] !== undefined) {
    return new Set(
      inline[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0),
    );
  }
  const byConst = /parseAs(?:StringEnum|StringLiteral)\s*(?:<[^>]*>)?\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/.exec(
    parserChunk,
  );
  const constName = byConst?.[1];
  if (constName !== undefined) {
    return arrayConsts.get(constName);
  }
  return undefined;
}

/**
 * Map const array literal (`const X = [...] as const`) của 1 file.
 *
 * @param source - Source file.
 * @returns Map tên const → tập giá trị.
 */
export function collectArrayConsts(source: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const match of source.matchAll(ARRAY_CONST_RE)) {
    const [, name, body] = match;
    if (name === undefined || body === undefined) {
      continue;
    }
    out.set(
      name,
      new Set(
        body
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter((s) => s.length > 0),
      ),
    );
  }
  return out;
}

/**
 * Quét toàn bộ `appRoot` và trả về `Map<routeDir, RouteInfo>` — mỗi route với key/enum nó thực
 * sự đọc qua `nuqs`/`searchParams`. Đây là hàm "vào 1 cửa" cho cả 2 guard dùng chung.
 *
 * @param appRoot - Path tuyệt đối `src/app`.
 * @returns Map path tuyệt đối thư mục route → `RouteInfo`.
 */
export function collectRouteConsumers(appRoot: string): Map<string, RouteInfo> {
  const routes = new Map<string, RouteInfo>();

  function routeInfo(routeDir: string): RouteInfo {
    const existing = routes.get(routeDir);
    if (existing !== undefined) {
      return existing;
    }
    const created: RouteInfo = {
      segments: routeSegments(routeDir, appRoot),
      keys: new Set<string>(),
      enums: new Map<string, Set<string>>(),
      parsesQuery: false,
      routeDir,
    };
    routes.set(routeDir, created);
    return created;
  }

  for (const file of listSourceFiles(appRoot)) {
    const routeDir = ownerRouteDir(file, appRoot);
    if (routeDir === undefined) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    const info = routeInfo(routeDir);
    const arrayConsts = collectArrayConsts(source);

    for (const match of source.matchAll(QUERY_STATE_RE)) {
      const [, key, parserChunk] = match;
      if (key === undefined) {
        continue;
      }
      info.keys.add(key);
      info.parsesQuery = true;
      const values = enumValues(parserChunk ?? "", arrayConsts);
      if (values !== undefined && values.size > 0) {
        info.enums.set(key, values);
      }
    }

    for (const match of source.matchAll(QUERY_STATES_RE)) {
      const openIndex = match.index + match[0].length - 1;
      for (const key of objectLiteralKeys(source, openIndex)) {
        info.keys.add(key);
        info.parsesQuery = true;
      }
    }

    for (const match of source.matchAll(SEARCH_PARAMS_GET_RE)) {
      const key = match[1];
      if (key === undefined) {
        continue;
      }
      info.keys.add(key);
      info.parsesQuery = true;
    }
  }

  return routes;
}

/**
 * Tìm route khớp path (segment list). `[param]` (route) và `*` (producer, nội suy `${…}`) khớp
 * đúng 1 segment bất kỳ.
 *
 * @param segments - Segment path cần tìm route khớp.
 * @param routes - Kết quả `collectRouteConsumers`.
 * @returns Route khớp, hoặc `undefined` nếu không route nào khớp.
 */
export function matchRoute(segments: string[], routes: Map<string, RouteInfo>): RouteInfo | undefined {
  for (const info of routes.values()) {
    if (info.segments.length !== segments.length) {
      continue;
    }
    const ok = info.segments.every((routeSeg, i) => {
      const produceSeg = segments[i];
      if (produceSeg === undefined) {
        return false;
      }
      if (routeSeg.startsWith("[") || produceSeg === "*") {
        return true;
      }
      return routeSeg === produceSeg;
    });
    if (ok) {
      return info;
    }
  }
  return undefined;
}
