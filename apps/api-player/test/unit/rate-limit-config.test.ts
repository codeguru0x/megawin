/**
 * p1-02 B1 #1–#9 — khai báo rateLimit là dữ liệu, kiểm tĩnh.
 * PURE — không Redis, không gọi handler.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GuardSubjectType } from "@megawin/auth";
import { describe, expect, it } from "vitest";

import {
  AGGREGATE_RATE_LIMIT,
  PLACE_BET_RATE_LIMIT,
  POLLING_RATE_LIMIT,
  READ_RATE_LIMIT,
} from "../../src/lib/rate-limit";
import {
  FUNCTIONS_DIR,
  HANDLERS_DIR,
  requestsPerMinute,
  scanDeployedFunctions,
  scanHandlerRateLimits,
  scanHandlersMissingRateLimit,
} from "../helpers/scan-rate-limit";

const SUBJECT_VALUES = new Set(Object.values(GuardSubjectType));
const ROUTE_FORMAT = /^[a-z0-9]+\.[a-z-]+$/;
const PLACE_BET_RPM = requestsPerMinute(PLACE_BET_RATE_LIMIT.limit, PLACE_BET_RATE_LIMIT.windowSec);

/** Khớp 3 nhóm trong p1-02 — 70 handler, 7 place-bet chung 1 route. */
const PLAN_RATE_LIMIT_COUNT = 70;
const PLAN_UNIQUE_ROUTE_COUNT = 64;

const POLLING_FILES = new Set(["get-current-draw", "get-jackpot"]);
const READ_FILES = new Set([
  "list-tickets",
  "list-pending-tickets",
  "get-ticket-entries",
  "get-entry-lines",
  "list-draw-results",
  "get-draw-result",
  "get-game-config",
]);
const AGGREGATE_FILES = new Set(["get-combo-popularity"]);

describe("api-player rateLimit config", () => {
  const declared = scanHandlerRateLimits();
  const deployed = scanDeployedFunctions();

  // #7
  it("số endpoint bật rateLimit khớp 3 nhóm trong plan", () => {
    expect(declared).toHaveLength(PLAN_RATE_LIMIT_COUNT);
    expect(scanHandlersMissingRateLimit()).toEqual([]);
    expect(declared.map((d) => d.relPath)).toEqual(deployed.map((f) => `${f.handlerRel}.ts`).toSorted());
  });

  // #1
  it("mọi route duy nhất, trừ 7 place-bet cùng player.place-bet", () => {
    const placeBets = declared.filter((d) => d.fileName === "place-bet");
    expect(placeBets).toHaveLength(7);
    expect(new Set(placeBets.map((d) => d.route))).toEqual(new Set(["player.place-bet"]));

    const routes = declared.map((d) => d.route);
    const unique = new Set(routes);
    expect(unique.size).toBe(PLAN_UNIQUE_ROUTE_COUNT);
    expect(routes.filter((r) => r === "player.place-bet")).toHaveLength(7);

    const others = declared.filter((d) => d.fileName !== "place-bet").map((d) => d.route);
    expect(new Set(others).size).toBe(others.length);
  });

  // #2
  it("route đúng format {game}.{action}", () => {
    for (const item of declared) {
      expect(item.route, item.relPath).toMatch(ROUTE_FORMAT);
    }
  });

  // #3
  it("subject dùng GuardSubjectType, không string literal lạ", () => {
    for (const item of declared) {
      expect(SUBJECT_VALUES.has(item.subject as GuardSubjectType), `${item.relPath} subject=${item.subject}`).toBe(
        true,
      );
    }
    expect(PLACE_BET_RATE_LIMIT.subject).toBe(GuardSubjectType.Account);
    expect(POLLING_RATE_LIMIT.subject).toBe(GuardSubjectType.Account);
    expect(READ_RATE_LIMIT.subject).toBe(GuardSubjectType.Account);
    expect(AGGREGATE_RATE_LIMIT.subject).toBe(GuardSubjectType.Account);
  });

  // #4
  it("limit > 0, windowSec > 0, burst >= 0 khi có", () => {
    for (const item of declared) {
      expect(item.limit, item.relPath).toBeGreaterThan(0);
      expect(item.windowSec, item.relPath).toBeGreaterThan(0);
      if (item.burst !== undefined) {
        expect(item.burst, item.relPath).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // #5
  it("place-bet không dùng subject ip", () => {
    for (const item of declared.filter((d) => d.fileName === "place-bet")) {
      expect(item.subject).toBe(GuardSubjectType.Account);
      expect(item.subject).not.toBe(GuardSubjectType.Ip);
    }
  });

  // #6
  it("nhịp polling (req/phút) cao hơn place-bet 12/phút", () => {
    expect(PLACE_BET_RPM).toBe(12);
    for (const item of declared.filter((d) => POLLING_FILES.has(d.fileName))) {
      expect(requestsPerMinute(item.limit, item.windowSec), item.relPath).toBeGreaterThan(PLACE_BET_RPM);
    }
  });

  // #8
  it("mọi mutation POST/PUT/DELETE đã deploy đều có rateLimit", () => {
    const mutations = deployed.filter((f) => f.method === "post" || f.method === "put" || f.method === "delete");
    expect(mutations.length).toBeGreaterThan(0);
    const declaredPaths = new Set(declared.map((d) => d.relPath.replace(/\.ts$/, "")));
    for (const fn of mutations) {
      expect(declaredPaths.has(fn.handlerRel), `mutation thiếu rateLimit: ${fn.id} ${fn.method} ${fn.path}`).toBe(true);
    }
    expect(mutations.map((m) => m.path).toSorted()).toEqual(
      [
        "/auth/refresh-token",
        "/games/bingo18/bets",
        "/games/keno/bets",
        "/games/lotto535/bets",
        "/games/max3d/bets",
        "/games/max3dpro/bets",
        "/games/mega645/bets",
        "/games/power655/bets",
      ].toSorted(),
    );
  });

  // #9
  it("nhóm 3 và 7 place-bet dùng hằng chia sẻ, không literal rải", () => {
    expect(PLACE_BET_RATE_LIMIT).toEqual({
      route: "player.place-bet",
      limit: 1,
      windowSec: 5,
      burst: 0,
      subject: GuardSubjectType.Account,
    });

    for (const item of declared.filter((d) => d.fileName === "place-bet")) {
      expect(item.usesPlaceBetConstant, item.relPath).toBe(true);
      const src = readFileSync(join(HANDLERS_DIR, item.relPath), "utf8");
      expect(src).toContain("PLACE_BET_RATE_LIMIT");
      expect(src).not.toMatch(/rateLimit:\s*\{[^}]*route:\s*"player\.place-bet"/);
    }

    for (const item of declared.filter((d) => POLLING_FILES.has(d.fileName))) {
      expect(item.sharedName, item.relPath).toBe("POLLING_RATE_LIMIT");
    }
    for (const item of declared.filter((d) => READ_FILES.has(d.fileName))) {
      expect(item.sharedName, item.relPath).toBe("READ_RATE_LIMIT");
    }
    for (const item of declared.filter((d) => AGGREGATE_FILES.has(d.fileName))) {
      expect(item.sharedName, item.relPath).toBe("AGGREGATE_RATE_LIMIT");
    }
  });

  it("refresh-token dùng subject ip — public, không có identity", () => {
    const refresh = declared.find((d) => d.relPath === "auth/refresh-token.ts");
    expect(refresh).toMatchObject({
      route: "auth.refresh-token",
      limit: 10,
      windowSec: 60,
      subject: GuardSubjectType.Ip,
    });
  });

  it("list-jackpots đúng ngưỡng nhóm 2", () => {
    const jackpots = declared.find((d) => d.relPath === "game/list-jackpots.ts");
    expect(jackpots).toMatchObject({
      route: "game.jackpots",
      limit: 30,
      windowSec: 60,
      subject: GuardSubjectType.Account,
    });
  });

  it("REDIS_URI đã có trong serverless.yml — không tự thêm", () => {
    const yml = readFileSync(join(FUNCTIONS_DIR, "../..", "serverless.yml"), "utf8");
    expect(yml).toMatch(/REDIS_URI:/);
  });

  it("không còn mode shadow trong api-player", () => {
    for (const item of declared) {
      const src = readFileSync(join(HANDLERS_DIR, item.relPath), "utf8");
      expect(src, item.relPath).not.toMatch(/shadow/i);
    }
    for (const name of ["keno-endpoint.yml", "auth-endpoint.yml"]) {
      const yml = readFileSync(join(FUNCTIONS_DIR, name), "utf8");
      expect(yml, name).not.toMatch(/shadow/i);
    }
  });
});
