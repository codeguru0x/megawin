import { record, dropUndefined, flattenChanges, type AuditActor } from "@megawin/audit/logger";
import {
  AUDIT_ACTIONS,
  AuditCategory,
  AuditTargetType,
  type AuditAction,
  type AuditHttpContext,
  type AuditScalar,
} from "@megawin/audit/entities";
import { GameProduct } from "@megawin/game-core/entities";

/**
 * Power 6/55 audit-log helpers — nhóm free functions ghi audit log cho domain
 * Power 6/55.
 *
 * Đóng băng sẵn `game`/`category`/`targetType`/`action` của Power 6/55 → use-case
 * chỉ truyền payload nghiệp vụ tối thiểu (actor + id + diff).
 *
 * Phân tầng: `@megawin/audit/logger` cung cấp `record()` (low-level, generic).
 * Module này là tầng high-level riêng Power 6/55 — là **domain service** ("ghi lại
 * chuyện gì đã xảy ra trong domain Power 6/55"), nên đặt trong `services/` cùng các
 * domain service khác. Phụ thuộc domain type Power 6/55 (status, winningMain…) nên
 * KHÔNG đặt trong `@megawin/audit` (tránh dependency ngược audit → game).
 *
 * Đây là **free functions stateless** — KHÔNG class, KHÔNG state, KHÔNG DI. Mỗi
 * game tự có `services/audit-log.ts` tương tự (mirror pattern của Lotto 5/35).
 *
 * Mọi function đều **fire-and-forget** (gọi `record()`) — audit fail không bao
 * giờ làm hỏng nghiệp vụ.
 *
 * LƯU Ý JACKPOT KÉP: Power 6/55 có 2 jackpot (JP1 + JP2), nhưng audit KHÔNG ghi
 * chi tiết jackpot — chỉ ghi số trúng + status transitions. Logic giống hệt
 * Lotto 5/35, chỉ khác shape số trúng (bonusNumber thay winningSpecial).
 */

const GAME = GameProduct.Power655;

type PublishResultArgs = {
  actor: AuditActor;
  drawId: string;
  /** 6 số chính trúng thưởng (zero-padded `"01"`–`"55"`). */
  winningMain: string[];
  /** 1 số bonus trúng thưởng (zero-padded `"01"`–`"55"`), khác 6 số chính. */
  bonusNumber: string;
  /**
   * Tham chiếu Vietlott (drawPeriod + drawDate) nếu staff nhập/sửa cùng lúc.
   * KHÔNG tham gia matching/payout — chỉ là metadata đối soát nên ghi vào
   * `metadata.extra`, không phải `changes`. Bỏ qua nếu không kèm ref.
   */
  vietlottRef?: { drawPeriod: string; drawDate: string };
  meta?: AuditHttpContext;
};

/** Spread 5 field actor → DRY giữa các audit function. */
function actorFields(a: AuditActor) {
  return {
    actorId: a.id,
    actorType: a.type,
    actorName: a.name,
    actorRoles: a.roles,
    tenantId: a.tenantId,
  };
}

/**
 * Audit huỷ kỳ quay Power 6/55.
 *
 * @param args.actor - Chủ thể thực hiện (đã normalize ở tầng route/worker).
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi void (để ghi diff).
 * @param args.reason - Lý do huỷ (tuỳ chọn).
 * @param args.meta - Context HTTP (ip/userAgent/requestId…) nếu có.
 */
export function auditDrawVoid(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
  reason?: string;
  meta?: AuditHttpContext;
}): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.draw.void,
    category: AuditCategory.Draw,
    game: GAME,
    targetType: AuditTargetType.Draw,
    targetId: args.drawId,
    targetLabel: `Kỳ ${args.drawId}`,
    changes: { before: { status: args.prevStatus } },
    metadata: { http: args.meta, extra: dropUndefined({ reason: args.reason }) },
  });
}

/**
 * Core dùng chung cho publish & republish — chỉ khác `action`. Không export:
 * caller luôn đi qua {@link auditPublishResult} / {@link auditRepublishResult}
 * để cố định đúng action, tránh truyền nhầm.
 *
 * Bộ số trúng (winningMain + bonusNumber) là NỘI DUNG của thay đổi (before:
 * chưa có kết quả → after: có kết quả) nên ghi vào `changes`, KHÔNG phải
 * `metadata.extra`.
 *
 * `vietlottRef` (nếu có) là metadata đối soát — KHÔNG tham gia matching/payout —
 * nên flatten vào `metadata.extra` (`vietlottDrawPeriod`, `vietlottDrawDate`),
 * KHÔNG nhét vào `changes`. `dropUndefined` loại field rỗng khi không kèm ref.
 */
function recordPublishResult(
  action: typeof AUDIT_ACTIONS.draw.publishResult | typeof AUDIT_ACTIONS.draw.republishResult,
  args: PublishResultArgs,
): void {
  record({
    ...actorFields(args.actor),
    action,
    category: AuditCategory.Draw,
    game: GAME,
    targetType: AuditTargetType.Draw,
    targetId: args.drawId,
    targetLabel: `Kỳ ${args.drawId}`,
    changes: {
      after: { winningMain: args.winningMain, bonusNumber: args.bonusNumber },
    },
    metadata: {
      http: args.meta,
      extra: dropUndefined({
        vietlottDrawPeriod: args.vietlottRef?.drawPeriod,
        vietlottDrawDate: args.vietlottRef?.drawDate,
      }),
    },
  });
}

/**
 * Audit công bố kết quả kỳ quay Power 6/55 (publish lần đầu / sửa trước settle).
 *
 * Kết quả được sửa SAU khi đã settle dùng {@link auditRepublishResult} (ghi action
 * `draw.republish_result` để phân biệt luồng resettle).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.winningMain - 6 số chính (zero-padded `"01"`–`"55"`).
 * @param args.bonusNumber - 1 số bonus (zero-padded `"01"`–`"55"`), khác số chính.
 * @param args.vietlottRef - Tham chiếu Vietlott (drawPeriod/drawDate) nếu có.
 * @param args.meta - Context HTTP nếu có.
 */
export function auditPublishResult(args: PublishResultArgs): void {
  recordPublishResult(AUDIT_ACTIONS.draw.publishResult, args);
}

/**
 * Audit công bố LẠI kết quả kỳ quay Power 6/55 — sửa kết quả sau khi kỳ đã settle
 * (mở luồng resettle). Payload y hệt {@link auditPublishResult}, chỉ khác action
 * để lọc riêng "kết quả bị sửa sau settle" trong audit trail.
 *
 * @param args - Giống {@link auditPublishResult}.
 */
export function auditRepublishResult(args: PublishResultArgs): void {
  recordPublishResult(AUDIT_ACTIONS.draw.republishResult, args);
}

/**
 * Core dùng chung cho các audit chỉ ghi diff status của kỳ quay (open/close
 * sales, settle, resettle, reopen) — cùng shape, chỉ khác `action`.
 *
 * Chỉ ghi `changes.before.status` (trạng thái TRƯỚC — dữ liệu runtime, giúp phát
 * hiện transition bất thường). KHÔNG ghi status SAU: nó là hằng số suy ra trực
 * tiếp từ `action` (VD `draw.open_sales` → luôn `sales_open`) nên dư thừa.
 */
function recordStatusTransition(
  action: AuditAction,
  args: {
    actor: AuditActor;
    drawId: string;
    prevStatus: string;
    meta?: AuditHttpContext;
    extra?: Record<string, AuditScalar>;
  },
): void {
  record({
    ...actorFields(args.actor),
    action,
    category: AuditCategory.Draw,
    game: GAME,
    targetType: AuditTargetType.Draw,
    targetId: args.drawId,
    targetLabel: `Kỳ ${args.drawId}`,
    changes: {
      before: { status: args.prevStatus },
    },
    metadata: { http: args.meta, extra: args.extra },
  });
}

/**
 * Audit staff BẤM NÚT kết sổ kỳ quay Power 6/55 (settle lần đầu) từ BO.
 *
 * Đây là action chủ động của người thật (`draw.settle`) — KHÁC
 * `system.settle_finalized` do worker ghi khi SFN kết sổ chạy xong.
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi transition sang settling.
 * @param args.meta - Context HTTP nếu có.
 */
export function auditSettle(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
  meta?: AuditHttpContext;
}): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.settle, {
    ...args,
  });
}

/**
 * Audit staff BẤM NÚT kết sổ LẠI kỳ quay Power 6/55 (resettle) từ BO — sau khi
 * đã republish kết quả.
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi transition sang settling.
 * @param args.resettleId - Session key của phiên resettle (tracing/snapshot).
 * @param args.meta - Context HTTP nếu có.
 */
export function auditResettle(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
  resettleId?: string;
  meta?: AuditHttpContext;
}): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.resettle, {
    actor: args.actor,
    drawId: args.drawId,
    prevStatus: args.prevStatus,
    meta: args.meta,
    extra: dropUndefined({ resettleId: args.resettleId }),
  });
}

/**
 * Audit staff mở LẠI kỳ quay đã settled để chạy cascade jackpot.
 *
 * Riêng game có jackpot (Power 6/55 — dual JP1 + JP2). Cascade B2 sửa kết quả kỳ T
 * kéo theo các kỳ T+1…T+n đã settle phải re-settle vì pool jackpot đổi — số quay
 * KHÔNG đổi. Reopen re-stamp `publishedAt`, chuyển `settled → published` để mở cổng
 * resettle. Ghi diff status (không có `after` cố định, dừng ở "reopen").
 *
 * @param args.actor - Chủ thể thực hiện (staff, đã xác nhận DBA).
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi mở lại (thường `settled`).
 * @param args.meta - Context HTTP nếu có.
 */
export function auditReopenForCascade(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
  meta?: AuditHttpContext;
}): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.reopenForCascade, {
    actor: args.actor,
    drawId: args.drawId,
    prevStatus: args.prevStatus,
    meta: args.meta,
  });
}

/**
 * Audit staff mở bán kỳ quay Power 6/55 từ BO (`scheduled|sales_closed → sales_open`).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi mở bán.
 * @param args.meta - Context HTTP nếu có.
 */
export function auditOpenSales(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
  meta?: AuditHttpContext;
}): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.openSales, {
    ...args,
  });
}

/**
 * Audit staff đóng bán kỳ quay Power 6/55 từ BO (`sales_open → sales_closed`).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi đóng bán.
 * @param args.meta - Context HTTP nếu có.
 */
export function auditCloseSales(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
  meta?: AuditHttpContext;
}): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.closeSales, {
    ...args,
  });
}

/**
 * Audit staff cập nhật lịch bán/quay của kỳ quay Power 6/55 từ BO.
 *
 * Ghi diff lịch trước/sau (mở/đóng bán + giờ quay) để tái dựng ai đổi lịch gì.
 * Field `undefined` bị loại khỏi diff (không ghi `null`/`undefined` vào DB).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.before - Lịch cũ (ISO 8601): openAt/closeAt/drawTime.
 * @param args.after - Lịch mới (ISO 8601): openAt/closeAt/drawTime.
 * @param args.meta - Context HTTP nếu có.
 */
export function auditUpdateSchedule(args: {
  actor: AuditActor;
  drawId: string;
  before: { openAt?: string; closeAt?: string; drawTime?: string };
  after: { openAt: string; closeAt: string; drawTime: string };
  meta?: AuditHttpContext;
}): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.draw.updateSchedule,
    category: AuditCategory.Draw,
    game: GAME,
    targetType: AuditTargetType.Draw,
    targetId: args.drawId,
    targetLabel: `Kỳ ${args.drawId}`,
    changes: { before: dropUndefined(args.before), after: args.after },
    metadata: { http: args.meta },
  });
}

/**
 * Audit cập nhật cấu hình game Power 6/55 toàn cục.
 *
 * Chỉ ghi **giá trị mới** (`changes.after`) của các nhóm field đã đổi
 * (jackpot/rates/defaultPrizes/play). KHÔNG ghi `before`: config append-only +
 * có `version`, muốn biết đổi gì thì trace ngược record version trước.
 *
 * Nhóm lồng sâu (jackpot.jackpot1, defaultPrizes.tier1…) được flatten theo
 * dot-path để giữ **chính xác giá trị sâu**, không tóm tắt chung chung.
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.version - Version config sau khi upsert (đã auto-increment).
 * @param args.changed - Các nhóm field đã đổi kèm giá trị mới.
 * @param args.meta - Context HTTP nếu có.
 */
export function auditUpdateGameConfig(args: {
  actor: AuditActor;
  version: number;
  changed: Record<string, unknown>;
  meta?: AuditHttpContext;
}): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.config.updateGlobal,
    category: AuditCategory.Config,
    game: GAME,
    targetType: AuditTargetType.GameConfig,
    targetId: GAME,
    targetLabel: "Cấu hình game",
    changes: { after: flattenChanges(args.changed) },
    metadata: { http: args.meta, extra: { version: args.version } },
  });
}

/** Snapshot 2 field mutable của TenantConfig để ghi giá trị mới. */
type TenantConfigSnapshot = {
  commissionRate?: number;
  isEnabled?: boolean;
};

/**
 * Audit cập nhật cấu hình Power 6/55 riêng của 1 tenant (upsert).
 *
 * `targetId` = tenantId → deep-link tới đúng trang cấu hình tenant ở BO. Chỉ ghi
 * **giá trị mới** (`changes.after`) 2 field mutable (commissionRate, isEnabled) —
 * config có `version`, trace ngược record trước để biết giá trị cũ.
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.tenantId - Id tenant sở hữu cấu hình.
 * @param args.version - Version config sau khi upsert (đã auto-increment).
 * @param args.after - Snapshot config sau khi sửa.
 * @param args.meta - Context HTTP nếu có.
 */
export function auditUpdateTenantConfig(args: {
  actor: AuditActor;
  tenantId: string;
  version: number;
  after: TenantConfigSnapshot;
  meta?: AuditHttpContext;
}): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.config.updateTenant,
    category: AuditCategory.Config,
    game: GAME,
    targetType: AuditTargetType.TenantConfig,
    targetId: args.tenantId,
    targetLabel: `Cấu hình tenant ${args.tenantId}`,
    changes: { after: dropUndefined(args.after) },
    metadata: {
      http: args.meta,
      extra: { version: args.version },
    },
  });
}
