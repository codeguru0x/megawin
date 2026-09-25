/**
 * Quét khai báo `rateLimit` từ source handler + functions/*.yml.
 * Dùng cho unit test cấu hình — không import handler (tránh kéo use-case/DB).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { GuardSubjectType } from "@megawin/auth";

import {
  AGGREGATE_RATE_LIMIT,
  PLACE_BET_RATE_LIMIT,
  POLLING_RATE_LIMIT,
  READ_RATE_LIMIT,
} from "../../src/lib/rate-limit";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const HANDLERS_DIR = join(ROOT, "src/handlers");
export const FUNCTIONS_DIR = join(ROOT, "src/functions");

const SHARED = {
  PLACE_BET_RATE_LIMIT,
  POLLING_RATE_LIMIT,
  READ_RATE_LIMIT,
  AGGREGATE_RATE_LIMIT,
} as const;

export type SharedRateLimitName = keyof typeof SHARED;

export interface ScannedRateLimit {
  /** Đường dẫn tương đối từ `src/handlers/`. */
  relPath: string;
  /** Tên file không đuôi, vd `place-bet`. */
  fileName: string;
  /** `keno` / `auth` / `game`. */
  group: string;
  route: string;
  limit: number;
  windowSec: number;
  burst?: number;
  subject: string;
  /** Identifier hằng chia sẻ nếu source dùng đúng tên, không phải literal. */
  sharedName?: SharedRateLimitName;
  /** Source dùng `rateLimit: PLACE_BET_RATE_LIMIT` (cùng object). */
  usesPlaceBetConstant: boolean;
  raw: string;
}

export interface DeployedFunction {
  id: string;
  handlerRel: string;
  method: string;
  path: string;
}

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkTsFiles(full));
      continue;
    }
    if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function matchingBraceEnd(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function extractString(block: string, key: string): string | undefined {
  const m = block.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  return m?.[1];
}

function extractNumber(block: string, key: string): number | undefined {
  const m = block.match(new RegExp(`${key}:\\s*(-?\\d+)`));
  return m ? Number(m[1]) : undefined;
}

function extractSubject(block: string): string | undefined {
  const member = block.match(/subject:\s*GuardSubjectType\.(\w+)/);
  if (member) {
    const key = member[1] as keyof typeof GuardSubjectType;
    return GuardSubjectType[key];
  }
  return extractString(block, "subject");
}

function detectShared(block: string): SharedRateLimitName | undefined {
  for (const name of Object.keys(SHARED) as SharedRateLimitName[]) {
    if (block.includes(`...${name}`) || block.trim() === name) {
      return name;
    }
  }
  return undefined;
}

function resolveFields(
  block: string,
): Omit<ScannedRateLimit, "relPath" | "fileName" | "group" | "raw" | "usesPlaceBetConstant"> {
  const sharedName = detectShared(block);
  const shared = sharedName ? SHARED[sharedName] : undefined;
  const route = extractString(block, "route") ?? (shared && "route" in shared ? shared.route : undefined);
  const limit = extractNumber(block, "limit") ?? shared?.limit;
  const windowSec = extractNumber(block, "windowSec") ?? shared?.windowSec;
  const burst =
    extractNumber(block, "burst") ?? ("burst" in (shared ?? {}) ? (shared as { burst?: number }).burst : undefined);
  const subject = extractSubject(block) ?? shared?.subject;

  if (route == null || limit == null || windowSec == null || subject == null) {
    throw new Error(`Không parse được rateLimit từ block: ${block}`);
  }

  return { route, limit, windowSec, burst, subject, sharedName };
}

/** Mọi handler TypeScript dưới `src/handlers` có khai `rateLimit`. */
export function scanHandlerRateLimits(): ScannedRateLimit[] {
  const files = walkTsFiles(HANDLERS_DIR);
  const found: ScannedRateLimit[] = [];

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const marker = src.indexOf("rateLimit:");
    if (marker < 0) {
      continue;
    }

    const after = src.slice(marker + "rateLimit:".length).trimStart();
    let raw: string;
    if (after.startsWith("PLACE_BET_RATE_LIMIT")) {
      raw = "PLACE_BET_RATE_LIMIT";
    } else if (after.startsWith("{")) {
      const end = matchingBraceEnd(after, 0);
      if (end < 0) {
        throw new Error(`rateLimit object không đóng ở ${file}`);
      }
      raw = after.slice(0, end + 1);
    } else {
      throw new Error(`rateLimit không nhận dạng được ở ${file}`);
    }

    const fields = resolveFields(raw);
    const relPath = relative(HANDLERS_DIR, file).replaceAll("\\", "/");
    const group = relPath.split("/")[0] ?? "";
    found.push({
      ...fields,
      relPath,
      fileName: relPath.split("/").pop()?.replace(/\.ts$/, "") ?? "",
      group,
      usesPlaceBetConstant: raw.trim() === "PLACE_BET_RATE_LIMIT",
      raw,
    });
  }

  return found.toSorted((a, b) => a.relPath.localeCompare(b.relPath));
}

/** Handler không có `rateLimit:` — dùng để bắt sót. */
export function scanHandlersMissingRateLimit(): string[] {
  return walkTsFiles(HANDLERS_DIR)
    .filter((file) => !readFileSync(file, "utf8").includes("rateLimit:"))
    .map((file) => relative(HANDLERS_DIR, file).replaceAll("\\", "/"));
}

/** Function HTTP đã deploy (có `events.httpApi`). */
export function scanDeployedFunctions(): DeployedFunction[] {
  const out: DeployedFunction[] = [];
  for (const name of readdirSync(FUNCTIONS_DIR)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) {
      continue;
    }
    const src = readFileSync(join(FUNCTIONS_DIR, name), "utf8");
    const blocks = src.split(/\n(?=[a-zA-Z0-9_-]+:\s*$)/m);
    for (const block of blocks) {
      if (!block.includes("httpApi:")) {
        continue;
      }
      const id = block.match(/^([a-zA-Z0-9_-]+):/m)?.[1];
      const handler = block.match(/handler:\s*(\S+)/)?.[1];
      const method = block.match(/method:\s*(\w+)/)?.[1];
      const path = block.match(/path:\s*(\S+)/)?.[1];
      if (!id || !handler || !method || !path) {
        throw new Error(`Function YAML thiếu field ở ${name}:\n${block.slice(0, 200)}`);
      }
      const handlerRel = handler.replace(/\.handler$/, "").replace(/^src\/handlers\//, "");
      out.push({ id, handlerRel, method: method.toLowerCase(), path });
    }
  }
  return out;
}

export function requestsPerMinute(limit: number, windowSec: number): number {
  return (limit / windowSec) * 60;
}
