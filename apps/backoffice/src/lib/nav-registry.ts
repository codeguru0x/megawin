/**
 * Registry điều hướng toàn backoffice mà agent (`navigateTo`) và `⌘J` palette được phép mở
 * (p1-04 §1). Mở rộng từ `report-pages.ts` cũ (1 trang) — đây là NGUỒN CHÂN LÝ DUY NHẤT cho:
 * path template, label hiển thị, segment/param hợp lệ — dùng ở CẢ 3 nơi:
 * - Server (`agent/tools/navigateTo.ts`): validate `page` là enum đóng, build `href`.
 * - Client (`navigate-tool-card.tsx`): validate lại `href` lần 2 (whitelist prefix) trước khi
 *   `router.push` — defense-in-depth, không tin tưởng riêng phía server.
 * - Client (`search-dialog.tsx`, `⌘J`): hợp với `sidebar-items.ts` cho entry sidebar không có
 *   (`/dashboard`, `/guides`, 9 URL resettle) — KHÔNG cần AI.
 *
 * File này PHẢI client-safe tuyệt đối: 0 import `@megawin/*-application`, 0 import
 * `src/server/**` — nó bị `navigate-tool-card.tsx`/`search-dialog.tsx` (client component) import
 * trực tiếp. Chỉ import type/enum "thuần" (`*-core/entities`, `*-core/labels`, domain package
 * entities) — cùng nhóm package `sidebar-items.ts`/`use-*-filters.ts` đã import an toàn.
 *
 * CHỈ thêm trang đã có UI đọc đúng key qua `nuqs` (xem `_lib/use-*-filters.ts` mỗi trang) — thêm
 * key sai ở đây mà trang không đọc thì filter bị lặng lẽ bỏ qua (đúng lớp lỗi đã sửa ở §0.2 plan
 * `p1-04-agent-navigation.plan.md`). `check:nav-registry` (`src/scripts/check-nav-registry.ts`)
 * enforce điều này tĩnh.
 *
 * Vocabulary đã CHUẨN HOÁ (§0.2 plan) — mọi `urlKey` dưới đây là tên THẬT trên URL, KHÔNG còn
 * lệch với tên canonical model dùng (`drawId`, `tenantId`, `accountId`, `financialDate`…) — registry
 * này KHÔNG cần bảng alias.
 */

import { AuditActorType, AuditCategory, AuditStatus, AuditTargetType } from "@megawin/audit/entities";
import { DrawStatus, GameProduct, JackpotGameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { DispatchOrderStatus, DispatchSourceKind } from "@megawin/tenant-dispatch/entities";
import { TxLogEventType, TxLogStatus } from "@megawin/tenant-gateway/entities";

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** Nhóm trang — gộp enum trong description tool (§3.1 plan) và tiêu đề nhóm trong palette. */
export const NavGroupKey = {
  System: "system",
  Reports: "reports",
  Player: "player",
  Game: "game",
  Docs: "docs",
} as const;
export type NavGroupKey = (typeof NavGroupKey)[keyof typeof NavGroupKey];

/** Kiểu param/segment — quyết định cách VALIDATE giá trị, KHÔNG phải cách render. */
export const NavParamKind = {
  /** `YYYY-MM-DD`. */
  Date: "date",
  /** `YYYY-MM-DD.NNN` (dấu chấm — quy ước `player-sdk-jsdoc.mdc`). */
  DrawId: "drawId",
  /** ULID 26 ký tự (Crockford base32) — KHÔNG phải username. */
  AccountId: "accountId",
  /** Giá trị phải nằm trong `values`. */
  Enum: "enum",
  /** Tự do (search, playerName, actor, tx, targetId…) — chỉ cần non-empty. */
  Text: "text",
  /** Số nguyên (page). */
  Int: "int",
} as const;
export type NavParamKind = (typeof NavParamKind)[keyof typeof NavParamKind];

/** 1 param filter — key trong `NavPageDefinition.params` là tên CANONICAL model dùng. */
export interface NavParamDef {
  /** Key THẬT trên URL của trang này (đã chuẩn hoá — trùng canonical, xem header JSDoc). */
  urlKey: string;
  kind: NavParamKind;
  /** Chỉ với `kind: Enum` — khớp `parseAsStringEnum`/`parseAsStringLiteral` của trang. */
  values?: readonly string[];
  /** Mô tả ngắn cho model khi tool trả lỗi validate (error-driven discovery, §1.4 plan). */
  hint: string;
}

/** 1 dynamic segment của path template — validate TRƯỚC khi build, không im lặng bỏ qua. */
export interface NavSegmentDef {
  name: string;
  kind: NavParamKind;
  /** Chỉ với `kind: Enum` — vd `gameKey` của `game-jackpot` chỉ nhận 3 game có Jackpot. */
  values?: readonly string[];
  hint: string;
}

export interface NavPageDefinition {
  /** Template path; `:name` là dynamic segment. VD `/accounts/players/:accountId/settle`. */
  pathTemplate: string;
  label: string;
  group: NavGroupKey;
  /** Segment bắt buộc theo đúng thứ tự xuất hiện trong `pathTemplate`. */
  segments?: readonly NavSegmentDef[];
  /** Vocabulary CANONICAL model dùng → định nghĩa param thật của trang. `undefined` = trang không có filter param. */
  params?: Readonly<Record<string, NavParamDef>>;
  /**
   * Override `params` theo giá trị segment đã validate — dùng khi tập param PHỤ THUỘC segment
   * (vd `game-config`: enum `tab` khác nhau giữa Keno / 3 game Jackpot / 3 game còn lại — §2.1
   * mục 2 plan). Khi có mặt, `buildNavHref`/`isKnownNavHref` dùng kết quả hàm này thay cho `params`.
   */
  resolveParams?: (segments: Readonly<Record<string, string>>) => Readonly<Record<string, NavParamDef>>;
  /** `false` = KHÔNG auto-push, chỉ hiện nút (§2.3 plan — trang có form sửa). */
  autoNavigate: boolean;
  /** Câu hỏi/ý định staff mà trang này trả lời — nuôi description tool (§3.1 plan) + palette. */
  intent: string;
}

/** Lý do `buildNavHref` từ chối — model đọc để tự sửa lời gọi (error-driven discovery, §1.4 plan). */
export const NavBuildError = {
  UnknownPage: "unknown_page",
  MissingSegment: "missing_segment",
  InvalidSegmentValue: "invalid_segment_value",
  UnknownParam: "unknown_param",
  InvalidParamValue: "invalid_param_value",
} as const;
export type NavBuildError = (typeof NavBuildError)[keyof typeof NavBuildError];

/** Kết quả `buildNavHref` — discriminated union, KHÔNG throw (§1.3 plan). */
export type BuildNavHrefResult =
  | { ok: true; href: string; appliedLabel: string }
  | { ok: false; reason: NavBuildError; validParams: readonly string[]; hint: string };

// ─────────────────────────────────────────────────────────────────────────────
// Enum giá trị dùng lại cho nhiều entry
// ─────────────────────────────────────────────────────────────────────────────

const KENO_CONFIG_TABS = ["prizes", "sidebets", "caps", "rates", "play", "ops", "vietlott"] as const;
const JACKPOT_GAME_CONFIG_TABS = ["jackpot", "prizes", "rates", "play", "ops", "vietlott"] as const;
const PLAIN_GAME_CONFIG_TABS = ["prizes", "rates", "play", "ops", "vietlott"] as const;

const ALL_GAME_KEYS = Object.values(GameProduct);
const JACKPOT_GAME_KEYS = Object.values(JackpotGameProduct);
const DRAW_STATUS_VALUES = Object.values(DrawStatus);

/** 3 game staff-facing có runbook resettle (`@megawin/ops-docs` `buildResettleTopic`). */
const RESETTLE_GAME_KEYS = [GameProduct.Power655, GameProduct.Lotto535, GameProduct.Mega645] as const;
const RESETTLE_DOC_SLUGS = ["type-a", "type-b1", "type-b2"] as const;

const AUDIT_ACTOR_TYPE_VALUES = Object.values(AuditActorType);
const AUDIT_CATEGORY_VALUES = Object.values(AuditCategory);
const AUDIT_STATUS_VALUES = Object.values(AuditStatus);
const AUDIT_TARGET_TYPE_VALUES = Object.values(AuditTargetType);
const DISPATCH_STATUS_VALUES = Object.values(DispatchOrderStatus);
const DISPATCH_SOURCE_KIND_VALUES = Object.values(DispatchSourceKind);
const TX_LOG_STATUS_VALUES = Object.values(TxLogStatus);
const TX_LOG_EVENT_TYPE_VALUES = Object.values(TxLogEventType);
const SETTLE_SYSTEM_TABS = ["daily", "by-game", "by-tenant"] as const;
const SETTLE_GAME_TABS = ["draws", "tenants"] as const;
const SETTLE_GAME_LEVELS = ["list", "draw-tenants", "tenant-draws", "players", "entries"] as const;
const OPERATIONS_TABS = ["monitor", "analysis"] as const;

/** Tab hợp lệ của `game-config` PHỤ THUỘC nhóm game — KHÔNG hợp cả 3 nhóm lại (§2.1 mục 2 plan). */
function gameConfigTabsFor(gameKey: string): readonly string[] {
  if (gameKey === GameProduct.Keno) {
    return KENO_CONFIG_TABS;
  }
  if ((JACKPOT_GAME_KEYS as readonly string[]).includes(gameKey)) {
    return JACKPOT_GAME_CONFIG_TABS;
  }
  return PLAIN_GAME_CONFIG_TABS;
}

// ─────────────────────────────────────────────────────────────────────────────
// NavPage enum
// ─────────────────────────────────────────────────────────────────────────────

export const NavPage = {
  Dashboard: "dashboard",
  Ai: "ai",
  ReportsSettle: "reports-settle",
  ReportsOutstanding: "reports-outstanding",
  AuditLogs: "audit-logs",
  DispatchOrders: "dispatch-orders",
  ApiLogs: "api-logs",
  PlayersList: "players-list",
  PlayerSettle: "player-settle",
  PlayerOutstanding: "player-outstanding",
  GameOperations: "game-operations",
  GameDraws: "game-draws",
  GameSettleReport: "game-settle-report",
  GameOutstanding: "game-outstanding",
  GameVoidReport: "game-void-report",
  GameConfig: "game-config",
  GameTenantConfig: "game-tenant-config",
  GameJackpot: "game-jackpot",
  GuidesIndex: "guides-index",
  GuidesResettle: "guides-resettle",
} as const;
export type NavPage = (typeof NavPage)[keyof typeof NavPage];

// ─────────────────────────────────────────────────────────────────────────────
// Registry — `Record<NavPage, NavPageDefinition>` TOÀN PHẦN (thêm NavPage mà quên định nghĩa
// entry là đỏ compile — cùng pattern 3 bảng `Record` trong `registry.tsx`, §4.2 plan).
// ─────────────────────────────────────────────────────────────────────────────

const GAME_KEY_SEGMENT: NavSegmentDef = {
  name: "gameKey",
  kind: NavParamKind.Enum,
  values: ALL_GAME_KEYS,
  hint: "Game key hợp lệ: keno, lotto535, mega645, power655, max3d, max3dpro, bingo18.",
};

const JACKPOT_GAME_KEY_SEGMENT: NavSegmentDef = {
  name: "gameKey",
  kind: NavParamKind.Enum,
  values: JACKPOT_GAME_KEYS,
  hint: "Chỉ 3 game có Jackpot: lotto535, mega645, power655.",
};

const ACCOUNT_ID_SEGMENT: NavSegmentDef = {
  name: "accountId",
  kind: NavParamKind.AccountId,
  hint: "ULID (26 ký tự) — KHÔNG phải username. Tra bằng `getPlayerAccountInfo` trước.",
};

/** Param dùng lại ở nhiều trang report/game — khai 1 lần để 4 entry không lệch `hint`. */
const DRAW_ID_PARAM: NavParamDef = {
  urlKey: "drawId",
  kind: NavParamKind.DrawId,
  hint: "Kỳ quay dạng YYYY-MM-DD.NNN.",
};
const TENANT_ID_PARAM: NavParamDef = { urlKey: "tenantId", kind: NavParamKind.Text, hint: "ID đại lý." };
const ACCOUNT_ID_PARAM: NavParamDef = {
  urlKey: "accountId",
  kind: NavParamKind.AccountId,
  hint: "ULID player — tra bằng `getPlayerAccountInfo` trước, KHÔNG truyền username.",
};
const PLAYER_NAME_PARAM: NavParamDef = {
  urlKey: "playerName",
  kind: NavParamKind.Text,
  hint: "Username hiển thị (không dùng để lọc, chỉ hiển thị).",
};
const FROM_PARAM: NavParamDef = { urlKey: "from", kind: NavParamKind.Date, hint: "Ngày bắt đầu YYYY-MM-DD." };
const TO_PARAM: NavParamDef = { urlKey: "to", kind: NavParamKind.Date, hint: "Ngày kết thúc YYYY-MM-DD." };
const PAGE_PARAM: NavParamDef = { urlKey: "page", kind: NavParamKind.Int, hint: "Số trang (1-based)." };

export const NAV_REGISTRY: Record<NavPage, NavPageDefinition> = {
  [NavPage.Dashboard]: {
    pathTemplate: "/dashboard",
    label: "Dashboard",
    group: NavGroupKey.System,
    autoNavigate: true,
    intent: "Tổng quan vận hành: kỳ quay đang mở, jackpot, cảnh báo. Staff muốn xem tổng quan hệ thống.",
  },

  [NavPage.Ai]: {
    pathTemplate: "/ai",
    label: "Trợ lý AI",
    group: NavGroupKey.System,
    params: {
      thread: { urlKey: "thread", kind: NavParamKind.Text, hint: "ID cuộc hội thoại." },
    },
    // Rời trang chat đang mở để auto-push sang /ai chính nó = vô nghĩa; luôn hạ cấp thành nút.
    autoNavigate: false,
    intent: "Mở 1 cuộc hội thoại AI cụ thể theo threadId (hiếm khi cần — staff đang chat ở đây rồi).",
  },

  [NavPage.ReportsSettle]: {
    pathTemplate: "/reports/settle",
    label: "Báo cáo tài chính hệ thống",
    group: NavGroupKey.Reports,
    params: {
      tab: { urlKey: "tab", kind: NavParamKind.Enum, values: SETTLE_SYSTEM_TABS, hint: "daily | by-game | by-tenant." },
      from: FROM_PARAM,
      to: TO_PARAM,
      financialDate: {
        urlKey: "financialDate",
        kind: NavParamKind.Date,
        hint: "Ngày tài chính drill vào (tab daily).",
      },
      tenantId: TENANT_ID_PARAM,
    },
    autoNavigate: true,
    intent: "Báo cáo tài chính TOÀN HỆ THỐNG (mọi game gộp) theo ngày/game/đại lý. Staff hỏi doanh thu/GGR tổng.",
  },

  [NavPage.ReportsOutstanding]: {
    pathTemplate: "/reports/outstanding",
    label: "Outstanding hệ thống",
    group: NavGroupKey.Reports,
    autoNavigate: true,
    intent: "Tổng quan tiền cược đang mở (chưa settle) toàn hệ thống, gộp mọi game.",
  },

  [NavPage.AuditLogs]: {
    pathTemplate: "/audit-logs",
    label: "Lịch sử thao tác",
    group: NavGroupKey.System,
    params: {
      from: FROM_PARAM,
      to: TO_PARAM,
      actor: { urlKey: "actor", kind: NavParamKind.Text, hint: "Username/actor thực hiện thao tác." },
      actorType: {
        urlKey: "actorType",
        kind: NavParamKind.Enum,
        values: AUDIT_ACTOR_TYPE_VALUES,
        hint: "company | agent | player | system | unknown.",
      },
      game: { urlKey: "game", kind: NavParamKind.Enum, values: ALL_GAME_KEYS, hint: "Game liên quan thao tác." },
      category: {
        urlKey: "category",
        kind: NavParamKind.Enum,
        values: AUDIT_CATEGORY_VALUES,
        hint: "draw | player | config | auth | account | finance | system | worker.",
      },
      action: { urlKey: "action", kind: NavParamKind.Text, hint: "Action code cụ thể (phụ thuộc category)." },
      targetType: {
        urlKey: "targetType",
        kind: NavParamKind.Enum,
        values: AUDIT_TARGET_TYPE_VALUES,
        hint: "draw | player | game_config | tenant_config | account | tenant | worker.",
      },
      targetId: { urlKey: "targetId", kind: NavParamKind.Text, hint: "ID đối tượng bị tác động." },
      status: { urlKey: "status", kind: NavParamKind.Enum, values: AUDIT_STATUS_VALUES, hint: "success | failure." },
    },
    autoNavigate: true,
    intent: "Nhật ký thao tác staff/hệ thống — ai làm gì, khi nào. Cặp với tool `searchAuditLogs`.",
  },

  [NavPage.DispatchOrders]: {
    pathTemplate: "/reports/transactions/dispatch",
    label: "Lệnh gửi đại lý",
    group: NavGroupKey.Reports,
    params: {
      tx: {
        urlKey: "tx",
        kind: NavParamKind.Text,
        hint: "Mã giao dịch (identity lookup, bỏ qua range/dimension khác).",
      },
      batchKey: { urlKey: "batchKey", kind: NavParamKind.Text, hint: "Batch key (identity lookup)." },
      accountId: ACCOUNT_ID_PARAM,
      username: { urlKey: "username", kind: NavParamKind.Text, hint: "Username player (identity lookup)." },
      tenantId: TENANT_ID_PARAM,
      status: {
        urlKey: "status",
        kind: NavParamKind.Enum,
        values: DISPATCH_STATUS_VALUES,
        hint: "pending | dispatched | cancelled.",
      },
      sourceKind: {
        urlKey: "sourceKind",
        kind: NavParamKind.Enum,
        values: DISPATCH_SOURCE_KIND_VALUES,
        hint: "payout | refund | reversal.",
      },
      from: FROM_PARAM,
      to: TO_PARAM,
    },
    autoNavigate: true,
    intent:
      "Lệnh gửi tiền cho đại lý (payout/refund/reversal) — trạng thái dispatch, tra theo tx/batch/player. Cặp với tool `getDispatchOrders`.",
  },

  [NavPage.ApiLogs]: {
    pathTemplate: "/reports/transactions/api-logs",
    label: "Nhật ký giao dịch",
    group: NavGroupKey.Reports,
    params: {
      tx: { urlKey: "tx", kind: NavParamKind.Text, hint: "Mã giao dịch (bỏ qua range/status/eventType khi có)." },
      from: FROM_PARAM,
      to: TO_PARAM,
      status: { urlKey: "status", kind: NavParamKind.Enum, values: TX_LOG_STATUS_VALUES, hint: "success | failed." },
      eventType: {
        urlKey: "eventType",
        kind: NavParamKind.Enum,
        values: TX_LOG_EVENT_TYPE_VALUES,
        hint: "transaction | batch_transaction.",
      },
    },
    autoNavigate: true,
    intent: "Nhật ký gọi API giữa hệ thống và tenant (transaction log thô) — debug tích hợp tenant.",
  },

  [NavPage.PlayersList]: {
    pathTemplate: "/accounts/players",
    label: "Danh sách người chơi",
    group: NavGroupKey.Player,
    params: {
      search: {
        urlKey: "search",
        kind: NavParamKind.Text,
        hint: "Tìm theo username (mutually exclusive với tenantId).",
      },
      tenantId: TENANT_ID_PARAM,
    },
    autoNavigate: true,
    intent:
      "Danh sách player theo đại lý hoặc tìm theo username. FALLBACK khi username ambiguous — mở danh sách đã lọc thay vì hỏi lại staff.",
  },

  [NavPage.PlayerSettle]: {
    pathTemplate: "/accounts/players/:accountId/settle",
    label: "Tài chính người chơi",
    group: NavGroupKey.Player,
    segments: [ACCOUNT_ID_SEGMENT],
    params: {
      from: FROM_PARAM,
      to: TO_PARAM,
      game: { urlKey: "game", kind: NavParamKind.Enum, values: ALL_GAME_KEYS, hint: "Game đang drill (View 2+)." },
      financialDate: { urlKey: "financialDate", kind: NavParamKind.Date, hint: "Ngày tài chính đang drill (View 3+)." },
      drawId: DRAW_ID_PARAM,
    },
    autoNavigate: true,
    intent: "Tài chính (doanh thu/thắng thua) của 1 player cụ thể, gộp mọi game. Đích của 'mở trang cá nhân player X'.",
  },

  [NavPage.PlayerOutstanding]: {
    pathTemplate: "/accounts/players/:accountId/outstanding",
    label: "Outstanding người chơi",
    group: NavGroupKey.Player,
    segments: [ACCOUNT_ID_SEGMENT],
    params: {
      game: { urlKey: "game", kind: NavParamKind.Enum, values: ALL_GAME_KEYS, hint: "Game đang drill." },
      drawId: DRAW_ID_PARAM,
      page: PAGE_PARAM,
    },
    autoNavigate: true,
    intent: "Vé cược đang mở (chưa settle) của 1 player cụ thể.",
  },

  [NavPage.GameOperations]: {
    pathTemplate: "/games/:gameKey/operations",
    label: "Vận hành kỳ quay",
    group: NavGroupKey.Game,
    segments: [GAME_KEY_SEGMENT],
    params: {
      tab: { urlKey: "tab", kind: NavParamKind.Enum, values: OPERATIONS_TABS, hint: "monitor | analysis." },
      drawId: DRAW_ID_PARAM,
    },
    autoNavigate: true,
    intent:
      "Màn hình vận hành kỳ quay đang mở/vừa đóng của 1 game — theo dõi realtime, mở/đóng bán, công bố kết quả. " +
      "Lưu ý: URL tự xoá ?drawId= khi kỳ đang xem là kỳ active (giữ URL gọn) — KHÔNG phải bug, đừng ép giữ param.",
  },

  [NavPage.GameDraws]: {
    pathTemplate: "/games/:gameKey/draws",
    label: "Lịch sử kỳ quay",
    group: NavGroupKey.Game,
    segments: [GAME_KEY_SEGMENT],
    params: {
      status: {
        urlKey: "histStatus",
        kind: NavParamKind.Enum,
        values: DRAW_STATUS_VALUES,
        hint: "1 trong DrawStatus (scheduled, salesOpen, salesClosed, published, settling, settled, voiding, void).",
      },
      from: { urlKey: "histFrom", kind: NavParamKind.Date, hint: "Ngày bắt đầu YYYY-MM-DD." },
      to: { urlKey: "histTo", kind: NavParamKind.Date, hint: "Ngày kết thúc YYYY-MM-DD." },
      page: { urlKey: "histPage", kind: NavParamKind.Int, hint: "Số trang (1-based)." },
    },
    autoNavigate: true,
    intent:
      "Danh sách kỳ quay đã diễn ra của 1 game, lọc theo trạng thái/ngày — tra lịch sử kỳ, KHÔNG phải kỳ đang mở.",
  },

  [NavPage.GameSettleReport]: {
    pathTemplate: "/games/:gameKey/reports/settle",
    label: "Báo cáo tài chính game",
    group: NavGroupKey.Game,
    segments: [GAME_KEY_SEGMENT],
    params: {
      tab: { urlKey: "tab", kind: NavParamKind.Enum, values: SETTLE_GAME_TABS, hint: "draws | tenants." },
      from: FROM_PARAM,
      to: TO_PARAM,
      level: {
        urlKey: "level",
        kind: NavParamKind.Enum,
        values: SETTLE_GAME_LEVELS,
        hint: "list | draw-tenants | tenant-draws | players | entries.",
      },
      drawId: DRAW_ID_PARAM,
      tenantId: TENANT_ID_PARAM,
      accountId: ACCOUNT_ID_PARAM,
      playerName: PLAYER_NAME_PARAM,
      page: PAGE_PARAM,
    },
    autoNavigate: true,
    intent: "Báo cáo tài chính (đã settle) của 1 game cụ thể, drill 5 mức: kỳ → đại lý → player → entry.",
  },

  [NavPage.GameOutstanding]: {
    pathTemplate: "/games/:gameKey/reports/outstanding",
    label: "Outstanding game",
    group: NavGroupKey.Game,
    segments: [GAME_KEY_SEGMENT],
    params: {
      drawId: DRAW_ID_PARAM,
      tenantId: TENANT_ID_PARAM,
      accountId: ACCOUNT_ID_PARAM,
      playerName: PLAYER_NAME_PARAM,
    },
    autoNavigate: true,
    intent:
      "Vé cược đang mở (chưa settle) của 1 game — drill kỳ → đại lý → player → entry. Khớp `buildOutstandingHref` sẵn có.",
  },

  [NavPage.GameVoidReport]: {
    pathTemplate: "/games/:gameKey/reports/void",
    label: "Báo cáo huỷ vé",
    group: NavGroupKey.Game,
    segments: [GAME_KEY_SEGMENT],
    params: {
      from: FROM_PARAM,
      to: TO_PARAM,
      drawId: DRAW_ID_PARAM,
      tenantId: TENANT_ID_PARAM,
      accountId: ACCOUNT_ID_PARAM,
      playerName: PLAYER_NAME_PARAM,
    },
    autoNavigate: true,
    intent: "Vé/kỳ đã huỷ (void) của 1 game — tiền hoàn trả.",
  },

  [NavPage.GameConfig]: {
    pathTemplate: "/games/:gameKey/config/game",
    label: "Cấu hình game",
    group: NavGroupKey.Game,
    segments: [GAME_KEY_SEGMENT],
    // Tab hợp lệ PHỤ THUỘC nhóm game (§2.1 mục 2 plan) — KHÔNG khai `params` tĩnh.
    resolveParams: (segments) => ({
      tab: {
        urlKey: "tab",
        kind: NavParamKind.Enum,
        values: gameConfigTabsFor(segments.gameKey ?? ""),
        hint: "Tab hợp lệ phụ thuộc game — xem lại giá trị gameKey đã truyền.",
      },
    }),
    // Form sửa cấu hình (tiền giải, tỷ lệ, cap) — KHÔNG auto-push, chỉ hiện nút (§2.3 plan).
    autoNavigate: false,
    intent: "Cấu hình tiền giải/tỷ lệ/cap cược/jackpot của 1 game — trang CHỈNH SỬA, không phải xem số.",
  },

  [NavPage.GameTenantConfig]: {
    pathTemplate: "/games/:gameKey/config/tenant",
    label: "Cấu hình đại lý theo game",
    group: NavGroupKey.Game,
    segments: [GAME_KEY_SEGMENT],
    // Form sửa (hoa hồng, bật/tắt đại lý cho game) — KHÔNG auto-push (§2.3 plan).
    autoNavigate: false,
    intent: "Cấu hình hoa hồng/bật-tắt đại lý cho 1 game cụ thể — trang CHỈNH SỬA.",
  },

  [NavPage.GameJackpot]: {
    pathTemplate: "/games/:gameKey/jackpot",
    label: "Jackpot",
    group: NavGroupKey.Game,
    // Chỉ 3 game có Jackpot — truyền keno/max3d/... phải đỏ ở tầng validate, không phải 404 runtime.
    segments: [JACKPOT_GAME_KEY_SEGMENT],
    autoNavigate: true,
    intent: "Số dư Jackpot hiện tại + lịch sử các cycle của 1 trong 3 game có Jackpot (lotto535, mega645, power655).",
  },

  [NavPage.GuidesIndex]: {
    pathTemplate: "/guides",
    label: "Trung tâm hướng dẫn",
    group: NavGroupKey.Docs,
    autoNavigate: true,
    intent: "Trang chủ tài liệu vận hành staff — chọn game để xem runbook kết sổ lại (resettle).",
  },

  [NavPage.GuidesResettle]: {
    pathTemplate: "/guides/:gameKey/resettle/:docSlug",
    label: "Hướng dẫn kết sổ lại",
    group: NavGroupKey.Docs,
    segments: [
      {
        name: "gameKey",
        kind: NavParamKind.Enum,
        values: RESETTLE_GAME_KEYS,
        hint: "Chỉ 3 game có runbook resettle: power655, lotto535, mega645.",
      },
      {
        name: "docSlug",
        kind: NavParamKind.Enum,
        values: RESETTLE_DOC_SLUGS,
        hint: "type-a (sửa kỳ độc lập) | type-b1 (đổi người trúng Jackpot) | type-b2.",
      },
    ],
    autoNavigate: true,
    intent:
      "Runbook hướng dẫn từng bước kết sổ lại kỳ quay khi cần sửa kết quả đã công bố — 9 URL hợp lệ (3 game × 3 loại).",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Shape validators — theo `NavParamKind`, dùng CHUNG cho cả segment và param
// ─────────────────────────────────────────────────────────────────────────────

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DRAW_ID_RE = /^\d{4}-\d{2}-\d{2}\.\d{3}$/;
const INT_RE = /^\d+$/;

/** `true` nếu `value` khớp shape của `kind` — KHÔNG kiểm tra `values` (enum), gọi riêng ở caller. */
function matchesKindShape(kind: NavParamKind, value: string): boolean {
  switch (kind) {
    case NavParamKind.Date:
      return DATE_RE.test(value);
    case NavParamKind.DrawId:
      return DRAW_ID_RE.test(value);
    case NavParamKind.AccountId:
      return ULID_RE.test(value);
    case NavParamKind.Int:
      return INT_RE.test(value);
    case NavParamKind.Enum:
    case NavParamKind.Text:
      return value.length > 0;
    default:
      return false;
  }
}

/**
 * Resolve `params` thật của 1 entry — ưu tiên `resolveParams(segments)` nếu có (§2.1 mục 2 plan).
 * Export để `check-nav-registry.ts` dùng CHUNG, tránh 2 bản logic resolve lệch nhau.
 */
export function resolveEntryParams(
  entry: NavPageDefinition,
  segments: Readonly<Record<string, string>>,
): Readonly<Record<string, NavParamDef>> {
  if (entry.resolveParams) {
    return entry.resolveParams(segments);
  }
  return entry.params ?? {};
}

// ─────────────────────────────────────────────────────────────────────────────
// buildNavHref — hợp đồng DUY NHẤT dùng ở CẢ server (`navigateTo.ts`) và client (renderer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build href cho `page` từ `segments` + `params` — KHÔNG throw, trả discriminated union (§1.3 plan).
 *
 * Thứ tự validate: (1) page tồn tại → (2) mọi segment bắt buộc có mặt + đúng shape/enum → (3) mọi
 * param truyền vào nằm trong `params` của trang (đã resolve theo segment) + đúng shape/enum.
 * Segment/param rỗng hoặc `undefined` bị BỎ khỏi query (không lặng lẽ chấp nhận giá trị rác).
 */
export function buildNavHref(
  page: NavPage,
  args?: { segments?: Readonly<Record<string, string>>; params?: Readonly<Record<string, string>> },
): BuildNavHrefResult {
  const entry = NAV_REGISTRY[page];
  if (!entry) {
    return {
      ok: false,
      reason: NavBuildError.UnknownPage,
      validParams: Object.values(NavPage),
      hint: "`page` không tồn tại trong registry — chỉ dùng giá trị trong enum NavPage.",
    };
  }

  const rawSegments = args?.segments ?? {};
  const resolvedSegments: Record<string, string> = {};

  for (const segmentDef of entry.segments ?? []) {
    const value = rawSegments[segmentDef.name];
    if (value === undefined || value === "") {
      return {
        ok: false,
        reason: NavBuildError.MissingSegment,
        validParams: (entry.segments ?? []).map((s) => s.name),
        hint: `Thiếu segment bắt buộc "${segmentDef.name}". ${segmentDef.hint}`,
      };
    }
    const shapeOk = matchesKindShape(segmentDef.kind, value);
    const enumOk = segmentDef.kind !== NavParamKind.Enum || (segmentDef.values?.includes(value) ?? false);
    if (!shapeOk || !enumOk) {
      return {
        ok: false,
        reason: NavBuildError.InvalidSegmentValue,
        validParams: segmentDef.values ?? [],
        hint: `Segment "${segmentDef.name}" = "${value}" không hợp lệ. ${segmentDef.hint}`,
      };
    }
    resolvedSegments[segmentDef.name] = value;
  }

  const paramDefs = resolveEntryParams(entry, resolvedSegments);
  const rawParams = args?.params ?? {};
  const query = new URLSearchParams();

  for (const [canonicalKey, rawValue] of Object.entries(rawParams)) {
    if (rawValue === undefined || rawValue === "") {
      continue;
    }
    const paramDef = paramDefs[canonicalKey];
    if (!paramDef) {
      return {
        ok: false,
        reason: NavBuildError.UnknownParam,
        validParams: Object.keys(paramDefs),
        hint: `Trang "${page}" không nhận param "${canonicalKey}". Param hợp lệ: ${Object.keys(paramDefs).join(", ") || "(không có)"}.`,
      };
    }
    const shapeOk = matchesKindShape(paramDef.kind, rawValue);
    const enumOk = paramDef.kind !== NavParamKind.Enum || (paramDef.values?.includes(rawValue) ?? false);
    if (!shapeOk || !enumOk) {
      return {
        ok: false,
        reason: NavBuildError.InvalidParamValue,
        validParams: paramDef.values ?? [],
        hint: `Param "${canonicalKey}" = "${rawValue}" không hợp lệ. ${paramDef.hint}`,
      };
    }
    query.set(paramDef.urlKey, rawValue);
  }

  let path = entry.pathTemplate;
  for (const [name, value] of Object.entries(resolvedSegments)) {
    path = path.replace(`:${name}`, encodeURIComponent(value));
  }

  const queryString = query.toString();
  const href = queryString === "" ? path : `${path}?${queryString}`;

  return { ok: true, href, appliedLabel: buildAppliedLabel(entry, resolvedSegments, rawParams) };
}

/**
 * Nhãn ngắn mô tả đích đã resolve — vd "Vận hành kỳ quay · Keno · kỳ #2026-08-17.095".
 *
 * Phần tử ĐẦU luôn là tên trang; các phần tử sau là ngữ cảnh đã áp. Renderer client tách lại theo
 * dấu `" · "` để dựng 2 dòng (tên trang / ngữ cảnh) — xem `navigate-tool-card.tsx`. Vì vậy KHÔNG
 * dùng `" · "` bên trong một phần tử, và không đảo tên trang khỏi vị trí đầu.
 *
 * KHÔNG đưa `accountId` (ULID) vào nhãn: `player-display-username.mdc` §2 chốt accountId chỉ dùng
 * để DỰNG LINK, không hiển thị. Nó từng được ghép thẳng vào đây và staff nhận một nhãn kiểu
 * "Tài chính người chơi · player 01KK1H0RVS0ZQ40NVF4XB9110B" — dài gấp đôi tên trang, wrap 2 dòng
 * trong panel, mà không nói thêm điều gì (username thật nằm trong câu trả lời của trợ lý).
 */
function buildAppliedLabel(
  entry: NavPageDefinition,
  segments: Readonly<Record<string, string>>,
  params: Readonly<Record<string, string>>,
): string {
  const parts = [entry.label];
  if (segments.gameKey) {
    parts.push(GAME_LABELS[segments.gameKey as GameProduct] ?? segments.gameKey);
  }
  if (params.drawId) {
    parts.push(`kỳ #${params.drawId}`);
  }
  if (params.tenantId) {
    parts.push(`đại lý ${params.tenantId}`);
  }
  return parts.join(" · ");
}

/**
 * Kiểm tra `href` (nhận từ tool output) THẬT SỰ khớp 1 trang + tham số hợp lệ trong registry —
 * chặn prompt injection dụ agent trả `href` bất kỳ (vd `/admin/xyz`) rồi client tin tưởng navigate.
 * Defense-in-depth: dùng ở client TRƯỚC khi `router.push`, không tin riêng validate phía server.
 */
export function isKnownNavHref(href: string): boolean {
  const [path = "", queryString] = href.split("?", 2);
  const pathSegments = path.split("/").filter(Boolean);

  for (const entry of Object.values(NAV_REGISTRY)) {
    const templateSegments = entry.pathTemplate.split("/").filter(Boolean);
    if (templateSegments.length !== pathSegments.length) {
      continue;
    }

    const resolvedSegments: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < templateSegments.length; i++) {
      const templatePart = templateSegments[i];
      const actualPart = pathSegments[i];
      if (templatePart?.startsWith(":")) {
        const name = templatePart.slice(1);
        const decoded = decodeURIComponent(actualPart ?? "");
        const segmentDef = entry.segments?.find((s) => s.name === name);
        if (!segmentDef || !matchesKindShape(segmentDef.kind, decoded)) {
          matched = false;
          break;
        }
        if (segmentDef.kind === NavParamKind.Enum && !(segmentDef.values?.includes(decoded) ?? false)) {
          matched = false;
          break;
        }
        resolvedSegments[name] = decoded;
      } else if (templatePart !== actualPart) {
        matched = false;
        break;
      }
    }
    if (!matched) {
      continue;
    }

    if (!queryString) {
      return true;
    }
    const paramDefs = resolveEntryParams(entry, resolvedSegments);
    const urlKeyToDef = new Map(Object.values(paramDefs).map((def) => [def.urlKey, def] as const));
    const searchParams = new URLSearchParams(queryString);
    let queryOk = true;
    searchParams.forEach((value, key) => {
      const def = urlKeyToDef.get(key);
      if (!def || !matchesKindShape(def.kind, value)) {
        queryOk = false;
        return;
      }
      if (def.kind === NavParamKind.Enum && !(def.values?.includes(value) ?? false)) {
        queryOk = false;
      }
    });
    if (queryOk) {
      return true;
    }
  }
  return false;
}

/** Label hiển thị của 1 trang — dùng cho palette (`⌘J`) và tin nhắn "→ Đã tạo lối mở …". */
export function navPageLabel(page: NavPage): string {
  return NAV_REGISTRY[page].label;
}
