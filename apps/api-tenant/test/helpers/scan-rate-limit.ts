/**
 * Quét khai báo rateLimit của api-tenant — handler + functions/*.yml.
 * Unit test cấu hình: không import handler (tránh Mongo/use-case).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { GuardSubjectType } from "@megawin/auth";

import { PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT, PLAYER_LOGIN_PER_TENANT_RATE_LIMIT } from "../../src/lib/rate-limit";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const HANDLERS_DIR = join(ROOT, "src/handlers");
export const FUNCTIONS_DIR = join(ROOT, "src/functions");
export const SERVERLESS_YML = join(ROOT, "serverless.yml");
export const README = join(ROOT, "README.md");

export interface ScannedHandlerRateLimit {
  relPath: string;
  fileName: string;
  route: string;
  limit: number;
  windowSec: number;
  burst?: number;
  subject: string;
  usesPerTenantConstant: boolean;
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
  return block.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1];
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

function resolveFields(
  raw: string,
): Pick<ScannedHandlerRateLimit, "route" | "limit" | "windowSec" | "burst" | "subject"> {
  if (raw.trim() === "PLAYER_LOGIN_PER_TENANT_RATE_LIMIT") {
    return { ...PLAYER_LOGIN_PER_TENANT_RATE_LIMIT };
  }

  const route = extractString(raw, "route");
  const limit = extractNumber(raw, "limit");
  const windowSec = extractNumber(raw, "windowSec");
  const burst = extractNumber(raw, "burst");
  const subject = extractSubject(raw);
  if (route == null || limit == null || windowSec == null || subject == null) {
    throw new Error(`Không parse được rateLimit: ${raw}`);
  }
  return { route, limit, windowSec, burst, subject };
}

/** Handler có khai `rateLimit:` trên options (lớp middleware). */
export function scanHandlerRateLimits(): ScannedHandlerRateLimit[] {
  const found: ScannedHandlerRateLimit[] = [];
  for (const file of walkTsFiles(HANDLERS_DIR)) {
    const src = readFileSync(file, "utf8");
    const marker = src.indexOf("rateLimit:");
    if (marker < 0) {
      continue;
    }
    const after = src.slice(marker + "rateLimit:".length).trimStart();
    let raw: string;
    if (after.startsWith("PLAYER_LOGIN_PER_TENANT_RATE_LIMIT")) {
      raw = "PLAYER_LOGIN_PER_TENANT_RATE_LIMIT";
    } else if (after.startsWith("{")) {
      const end = matchingBraceEnd(after, 0);
      if (end < 0) {
        throw new Error(`rateLimit object không đóng ở ${file}`);
      }
      raw = after.slice(0, end + 1);
    } else {
      throw new Error(`rateLimit không nhận dạng được ở ${file}`);
    }

    const relPath = relative(HANDLERS_DIR, file).replaceAll("\\", "/");
    found.push({
      ...resolveFields(raw),
      relPath,
      fileName: relPath.replace(/\.ts$/, ""),
      usesPerTenantConstant: raw.trim() === "PLAYER_LOGIN_PER_TENANT_RATE_LIMIT",
      raw,
    });
  }
  return found.toSorted((a, b) => a.relPath.localeCompare(b.relPath));
}

export function listHandlerFiles(): string[] {
  return walkTsFiles(HANDLERS_DIR)
    .map((file) => relative(HANDLERS_DIR, file).replaceAll("\\", "/"))
    .toSorted();
}

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
      out.push({
        id,
        handlerRel: handler.replace(/\.handler$/, "").replace(/^src\/handlers\//, ""),
        method: method.toLowerCase(),
        path,
      });
    }
  }
  return out;
}

export function readServerlessYml(): string {
  return readFileSync(SERVERLESS_YML, "utf8");
}

export function readReadme(): string {
  return readFileSync(README, "utf8");
}

export { PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT, PLAYER_LOGIN_PER_TENANT_RATE_LIMIT };
