/**
 * Guard tính đúng đắn của `src/lib/nav-registry.ts` — 4 check độc lập.
 *
 * Chạy: `pnpm --filter @megawin/backoffice check:nav-registry`
 *
 * `check-url-params.ts` đối chiếu **link nội bộ** với route đích, KHÔNG biết gì về registry. Guard
 * này kiểm thứ chỉ registry mới có — mỗi entry có THẬT khớp filesystem không, param nó khai có THẬT
 * được trang đích đọc không. Dùng lại hàm thu thập consumer ở `_lib/route-query-collector.ts` —
 * KHÔNG copy regex sang bản riêng (sẽ lệch nhau, xem JSDoc file đó).
 *
 * **Check 1 — path thật.** Mỗi `pathTemplate` phải khớp 1 `page.tsx` thật trên đĩa. Segment tĩnh
 * (`:name` với `kind: Enum`) được coi là "giả-dynamic" — thực chất là N thư mục LITERAL (VD 7 game
 * `games/{keno,mega645,…}/…`, không phải `games/[gameKey]/…`) — nên guard thử ĐỦ mọi giá trị enum,
 * không chỉ 1 mẫu. Segment thật sự dynamic (`accountId`…) phải khớp thư mục `[name]`/`[...name]`
 * trên đĩa; khớp SAI (VD đăng ký `kind: AccountId` nhưng đĩa chỉ có thư mục literal) → lỗi ở đây.
 *
 * **Check 2 — key có thật.** Mỗi key trong `params` (đã resolve qua `resolveEntryParams`, tính cả
 * `resolveParams` phụ thuộc segment) phải xuất hiện trong tập key trang đích thực đọc — same nguồn
 * dữ liệu check 1 dùng để định vị trang, lặp qua MỌI tổ hợp segment enum (7 game có thể lệch nhau
 * dù cùng 1 `pathTemplate` — mỗi game là 1 file `page.tsx` riêng, không đảm bảo đồng bộ).
 *
 * **Check 3 — enum khớp union thật.** Với param `kind: Enum`, `values` khai trong registry phải
 * khớp CHÍNH XÁC (2 chiều) tập giá trị `parseAsStringEnum`/`parseAsStringLiteral` ở trang đích —
 * lệch 1 chiều nào cũng là bug: thiếu ở registry → model không biết giá trị hợp lệ; dư ở registry →
 * model gợi ý giá trị trang đích không nhận, rơi về default trong im lặng.
 *
 * **Check 4 — blocklist.** Không entry nào trỏ `/me/`, `/tenants`, `/login`, `/auth/` — quyết định
 * đã chốt ở §2 plan (đại lý/tenant có API key/`callbackBaseUrl`, không nên là thứ agent gợi ý mở).
 *
 * GIỚI HẠN CÓ CHỦ ĐÍCH: kế thừa mọi giới hạn của `route-query-collector.ts` (regex, không AST).
 * Khi route đích không đọc query nào (`parsesQuery === false`) → key nào cũng "thiếu" theo nghĩa
 * kỹ thuật; guard chỉ báo lỗi thật khi entry CÓ khai `params` mà trang không đọc gì — trang không
 * filter (VD `dashboard`) thì registry cũng không khai `params`, không có gì để đối chiếu.
 *
 * Exit code != 0 nếu vi phạm → dùng trong CI.
 */

import {
  NAV_REGISTRY,
  type NavPageDefinition,
  NavParamKind,
  type NavSegmentDef,
  resolveEntryParams,
} from "@/lib/nav-registry";

import { collectRouteConsumers, type RouteInfo } from "./_lib/route-query-collector";
import { dirname, join } from "node:path";

/** `src/scripts/check-nav-registry.ts` -> `src`. */
const srcRoot = dirname(dirname(new URL(import.meta.url).pathname));
const appRoot = join(srcRoot, "app");

/** Giá trị dùng để "thăm dò" segment thật sự dynamic (không phải enum) — xem JSDoc check 1. */
const DYNAMIC_PROBE_VALUE = "__nav_registry_probe__";

/** Route bị cấm agent/palette trỏ tới — quyết định §2 plan, KHÔNG được sửa ở đây mà không có ADR mới. */
const BLOCKED_PATH_PREFIXES = ["/me/", "/tenants", "/login", "/auth/"] as const;

const routes = collectRouteConsumers(appRoot);

/**
 * Tổ hợp giá trị cho mọi segment của 1 entry — enum thì liệt kê ĐỦ, non-enum thì 1 giá trị thăm dò.
 *
 * @param segments - `entry.segments` (đã theo đúng thứ tự xuất hiện trong `pathTemplate`).
 * @returns Danh sách tổ hợp `{ [segmentName]: value }`, luôn có ít nhất 1 phần tử (`[{}]` nếu rỗng).
 */
function segmentCombinations(segments: readonly NavSegmentDef[] | undefined): Array<Record<string, string>> {
  let combos: Array<Record<string, string>> = [{}];
  for (const def of segments ?? []) {
    const candidateValues = def.kind === NavParamKind.Enum ? (def.values ?? []) : [DYNAMIC_PROBE_VALUE];
    const next: Array<Record<string, string>> = [];
    for (const combo of combos) {
      for (const value of candidateValues) {
        next.push({ ...combo, [def.name]: value });
      }
    }
    combos = next;
  }
  return combos;
}

/**
 * Path thật (segment list) cho 1 tổ hợp giá trị — thay `:name` bằng giá trị tương ứng.
 *
 * @param pathTemplate - `entry.pathTemplate`, VD `/games/:gameKey/operations`.
 * @param combo - Giá trị cụ thể cho mỗi segment.
 * @returns Danh sách segment literal, VD `["games", "mega645", "operations"]`.
 */
function concretePath(pathTemplate: string, combo: Record<string, string>): string[] {
  return pathTemplate
    .split("/")
    .filter((s) => s.length > 0)
    .map((seg) => (seg.startsWith(":") ? (combo[seg.slice(1)] ?? seg) : seg));
}

/**
 * Tìm route thật trên đĩa khớp `segments` — hỗ trợ literal, dynamic `[name]`, và catch-all
 * `[...name]` (VD `guides/[...slug]`). Literal enum value (`mega645`) khớp CẢ thư mục literal
 * cùng tên LẪN thư mục dynamic (`[name]`) ở đúng vị trí — dynamic accept mọi string.
 *
 * Ưu tiên khớp ĐÚNG ĐỘ DÀI trước — Next.js tự sinh `app/[...not-found]/page.tsx` (catch-all rỗng
 * prefix, `routeSegs.length === 1`) sẽ "vồ" MỌI path >= 1 segment nếu xét catch-all trước; chỉ
 * fallback sang catch-all ở lượt 2 khi không route nào khớp đúng độ dài.
 *
 * @param segments - Path cụ thể cần tìm route khớp (đã thay hết `:name`).
 * @returns Route khớp, hoặc `undefined` nếu không thư mục nào trên đĩa khớp.
 */
function resolveConcreteRoute(segments: string[]): RouteInfo | undefined {
  for (const info of routes.values()) {
    const routeSegs = info.segments;
    // Loại HẲN route có segment catch-all khỏi lượt này — `[...name]` không phải "dynamic 1 segment
    // bình thường"; coi nó như bracket thường ở đây sẽ khớp nhầm MỌI path cùng độ dài (bug thật đã
    // gặp: `[...not-found]` (Next.js tự sinh) "vồ" cả `/ai`, `/audit-logs` vì cùng độ dài 1).
    if (routeSegs.some((seg) => seg.startsWith("[..."))) {
      continue;
    }
    if (routeSegs.length !== segments.length) {
      continue;
    }
    const ok = routeSegs.every((seg, i) => seg.startsWith("[") || seg === segments[i]);
    if (ok) {
      return info;
    }
  }

  for (const info of routes.values()) {
    const routeSegs = info.segments;
    const catchAllIndex = routeSegs.findIndex((seg) => seg.startsWith("[..."));
    if (catchAllIndex === -1 || catchAllIndex !== routeSegs.length - 1 || catchAllIndex === 0) {
      // `catchAllIndex === 0` (VD `[...not-found]`, prefix rỗng) bị loại ở fallback — quá lỏng,
      // khớp MỌI path bất kể nội dung. Chỉ nhận catch-all có prefix literal cụ thể (VD `guides/[...slug]`).
      continue;
    }
    const prefix = routeSegs.slice(0, catchAllIndex);
    // Catch-all KHÔNG optional (`[...slug]`, không phải `[[...slug]]`) → cần >= 1 segment còn lại.
    if (segments.length < prefix.length + 1) {
      continue;
    }
    const prefixOk = prefix.every((seg, i) => seg.startsWith("[") || seg === segments[i]);
    if (prefixOk) {
      return info;
    }
  }
  return undefined;
}

// ── Đối chiếu 4 check ────────────────────────────────────────────────────────────────────────────
const pathErrors: string[] = [];
const keyErrors: string[] = [];
const enumErrors: string[] = [];
const blocklistErrors: string[] = [];
let comboCount = 0;

for (const [pageName, entry] of Object.entries(NAV_REGISTRY) as Array<[string, NavPageDefinition]>) {
  // Check 4 — blocklist (không phụ thuộc segment, kiểm 1 lần/entry).
  if (BLOCKED_PATH_PREFIXES.some((prefix) => entry.pathTemplate.startsWith(prefix))) {
    blocklistErrors.push(`"${pageName}" → ${entry.pathTemplate} nằm trong blocklist (§2 plan p1-04).`);
  }

  const combos = segmentCombinations(entry.segments);
  for (const combo of combos) {
    comboCount += 1;
    const comboLabel = Object.entries(combo)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    const segments = concretePath(entry.pathTemplate, combo);
    const target = resolveConcreteRoute(segments);

    // Check 1 — path thật phải tồn tại trên đĩa.
    if (target === undefined) {
      pathErrors.push(
        `"${pageName}" (${entry.pathTemplate}${comboLabel ? `, ${comboLabel}` : ""}) → không thấy page.tsx khớp "/${segments.join("/")}".`,
      );
      continue;
    }

    const paramDefs = resolveEntryParams(entry, combo);
    for (const [canonicalKey, paramDef] of Object.entries(paramDefs)) {
      // Check 2 — key phải THẬT được trang đích đọc.
      if (!target.keys.has(paramDef.urlKey)) {
        keyErrors.push(
          `"${pageName}".params.${canonicalKey} (urlKey="${paramDef.urlKey}"${comboLabel ? `, ${comboLabel}` : ""}) ` +
            `→ "/${segments.join("/")}" chỉ đọc: ${target.parsesQuery ? [...target.keys].sort().join(", ") : "(không đọc query nào)"}.`,
        );
        continue;
      }

      // Check 3 — enum values phải khớp CHÍNH XÁC (2 chiều) union thật.
      if (paramDef.kind !== NavParamKind.Enum) {
        continue;
      }
      const actualValues = target.enums.get(paramDef.urlKey);
      if (actualValues === undefined) {
        // Scanner không nhận diện được enum ở trang đích (vd parser không phải parseAsStringEnum/Literal
        // tĩnh) — không đủ dữ kiện để kết luận, KHÔNG fail (giống nhánh `unresolved` của check-url-params).
        continue;
      }
      const declaredValues = new Set(paramDef.values ?? []);
      const missingInRegistry = [...actualValues].filter((v) => !declaredValues.has(v));
      const extraInRegistry = [...declaredValues].filter((v) => !actualValues.has(v));
      if (missingInRegistry.length > 0 || extraInRegistry.length > 0) {
        const parts: string[] = [];
        if (missingInRegistry.length > 0) {
          parts.push(`thiếu trong registry: ${missingInRegistry.join(", ")}`);
        }
        if (extraInRegistry.length > 0) {
          parts.push(`registry khai dư (trang không nhận): ${extraInRegistry.join(", ")}`);
        }
        enumErrors.push(
          `"${pageName}".params.${canonicalKey} (urlKey="${paramDef.urlKey}"${comboLabel ? `, ${comboLabel}` : ""}) — ${parts.join("; ")}.`,
        );
      }
    }
  }
}

let failed = false;

if (pathErrors.length > 0) {
  failed = true;
  console.error(`❌ ${pathErrors.length} entry trỏ path KHÔNG có page.tsx thật:\n`);
  for (const line of pathErrors) {
    console.error(`  ${line}`);
  }
  console.error(
    "\nSửa: cập nhật `pathTemplate`/`segments` cho khớp cấu trúc `src/app` thật, hoặc xoá entry đã lỗi thời.\n",
  );
}

if (keyErrors.length > 0) {
  failed = true;
  console.error(`❌ ${keyErrors.length} param registry khai mà trang đích KHÔNG đọc:\n`);
  for (const line of keyErrors) {
    console.error(`  ${line}`);
  }
  console.error("\nAgent build URL với key này sẽ mất filter trong im lặng (cùng lớp lỗi §0.2 plan p1-04).");
  console.error("Sửa: đổi `urlKey` cho khớp, hoặc bỏ param nếu trang thật sự không hỗ trợ.\n");
}

if (enumErrors.length > 0) {
  failed = true;
  console.error(`❌ ${enumErrors.length} param enum LỆCH union thật của trang đích:\n`);
  for (const line of enumErrors) {
    console.error(`  ${line}`);
  }
  console.error("\nSửa: đồng bộ `values` trong registry với enum thật ở trang đích (2 chiều).\n");
}

if (blocklistErrors.length > 0) {
  failed = true;
  console.error(`❌ ${blocklistErrors.length} entry vi phạm blocklist (§2 plan p1-04):\n`);
  for (const line of blocklistErrors) {
    console.error(`  ${line}`);
  }
  console.error(
    "\nCác route này chứa thông tin nhạy cảm (API key, callbackBaseUrl…) — không được đăng ký cho agent/palette.\n",
  );
}

if (failed) {
  process.exit(1);
}

console.log(
  `✅ nav-registry sạch — ${Object.keys(NAV_REGISTRY).length} entry, ${comboCount} tổ hợp segment đối chiếu, ` +
    "0 path sai, 0 key sai, 0 enum lệch, 0 vi phạm blocklist.",
);
