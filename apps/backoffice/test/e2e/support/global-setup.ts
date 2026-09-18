/**
 * Playwright globalSetup — sinh storageState cho 2 persona admin/staff.
 *
 * Không mở browser, không gọi Cognito. Cookie ký bằng `BETTER_AUTH_SECRET`
 * (`resolveBetterAuthSecret` — CI inject hoặc 1 key từ `.env.local`).
 * File ghi vào `.auth/` (gitignore) — KHÔNG commit.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { mintSessionCookies } from "./mint-session";
import { PERSONAS, type PersonaKey } from "./personas";

const AUTH_DIR = path.join(__dirname, ".auth");

export function statePath(key: PersonaKey): string {
  return path.join(AUTH_DIR, `${key}.json`);
}

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
  await mkdir(AUTH_DIR, { recursive: true });

  for (const key of Object.keys(PERSONAS) as PersonaKey[]) {
    const cookies = await mintSessionCookies(PERSONAS[key], baseURL);
    await writeFile(statePath(key), JSON.stringify({ cookies, origins: [] }, null, 2), "utf8");
  }
}
