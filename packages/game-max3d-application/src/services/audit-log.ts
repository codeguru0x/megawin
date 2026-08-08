import { record, dropUndefined, flattenChanges, type AuditActor } from "@megawin/audit/logger";
import {
  AUDIT_ACTIONS,
  AuditCategory,
  AuditTargetType,
  type AuditAction,
  type AuditScalar,
} from "@megawin/audit/entities";
import { GameProduct } from "@megawin/game-core/entities";
import type { Max3dDrawResult } from "@megawin/game-max3d/entities";

/**
 * Max 3D audit-log helpers — nhóm free functions ghi audit log cho domain Max 3D.
 *
 * Đóng băng sẵn `game`/`category`/`targetType`/`action` của Max 3D → use-case
 * chỉ truyền payload nghiệp vụ tối thiểu (actor + id + diff).
 *
 * Phân tầng: `@megawin/audit/logger` cung cấp `record()` (low-level, generic).
 * Module này là tầng high-level riêng Max 3D — là **domain service** ("ghi lại
 * chuyện gì đã xảy ra trong domain Max 3D"), nên đặt trong `services/` cùng các
 * domain service khác. Phụ thuộc domain type Max 3D (status, Max3dDrawResult…)
 * nên KHÔNG đặt trong `@megawin/audit` (tránh dependency ngược audit → game).
 *
 * Đây là **free functions stateless** — KHÔNG class, KHÔNG state, KHÔNG DI (khác
 * class `Max3dTicketLookupService`). Bỏ suffix `Service` ở tên để phân biệt với
 * class `*Service`. Mỗi game tự có `services/audit-log.ts` tương tự (mirror
 * pattern của Keno — game non-jackpot chuẩn).
 *
 * Max 3D không có Jackpot tích lũy → không có `auditReopenForCascade` (chỉ game
 * có Jackpot mới cần reopen kỳ để cascade).
 *
 * Mọi function đều **fire-and-forget** (gọi `record()`) — audit fail không bao
 * giờ làm hỏng nghiệp vụ.
 */

const GAME = GameProduct.Max3d;

type PublishResultArgs = {
  actor: AuditActor;
  drawId: string;
  /**
   * Kết quả quay — 20 bộ ba số chia 4 hạng (2 ĐB + 4 Nhất + 6 Nhì + 8 Ba),
   * mỗi phần tử là triplet zero-padded `"000"`–`"999"`.
   */
  result: Max3dDrawResult;
  /**
   * Tham chiếu Vietlott (drawPeriod + drawDate) nếu staff nhập/sửa cùng lúc.
   * KHÔNG tham gia matching/payout — chỉ là metadata đối soát nên ghi vào
   * `metadata.extra`, không phải `changes`. Bỏ qua nếu không kèm ref.
   */
  vietlottRef?: { drawPeriod: string; drawDate: string };
};

/** Spread 5 field actor + ip → DRY giữa các audit function. */
function actorFields(a: AuditActor) {
  return {
    actorId: a.id,
    actorType: a.type,
    actorName: a.name,
    actorRoles: a.roles,
    tenantId: a.tenantId,
    ip: a.ip,
  };
}

/**
 * Audit huỷ kỳ quay Max 3D.
 *
 * @param args.actor - Chủ thể thực hiện (đã normalize ở tầng route/worker).
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi void (để ghi diff).
 * @param args.reason - Lý do huỷ (tuỳ chọn).
 */
export function auditDrawVoid(args: { actor: AuditActor; drawId: string; prevStatus: string; reason?: string }): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.draw.void,
    category: AuditCategory.Draw,
    game: GAME,
    targetType: AuditTargetType.Draw,
    targetId: args.drawId,
    targetLabel: `Kỳ ${args.drawId}`,
    changes: { before: { status: args.prevStatus } },
    metadata: { extra: dropUndefined({ reason: args.reason }) },
  });
}

/**
 * Core dùng chung cho publish & republish — chỉ khác `action`. Không export:
 * caller luôn đi qua {@link auditPublishResult} / {@link auditRepublishResult}
 * để cố định đúng action, tránh truyền nhầm.
 *
 * Bộ số trúng (4 hạng special/first/second/third) là NỘI DUNG của thay đổi
 * (before: chưa có kết quả → after: có kết quả) nên ghi vào `changes`, KHÔNG
 * phải `metadata.extra`. Flatten từng hạng thành field riêng để UI dễ hiển thị.
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
      after: {
        special: args.result.special,
        first: args.result.first,
        second: args.result.second,
        third: args.result.third,
      },
    },
    metadata: {
      extra: dropUndefined({
        vietlottDrawPeriod: args.vietlottRef?.drawPeriod,
        vietlottDrawDate: args.vietlottRef?.drawDate,
      }),
    },
  });
}

/**
 * Audit công bố kết quả kỳ quay Max 3D (publish lần đầu / sửa trước khi settle).
 *
 * Kết quả được sửa SAU khi đã settle dùng {@link auditRepublishResult} (ghi action
 * `draw.republish_result` để phân biệt luồng resettle).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.result - Kết quả quay (4 hạng, mỗi triplet `"000"`–`"999"`).
 * @param args.vietlottRef - Tham chiếu Vietlott (drawPeriod/drawDate) nếu có.
 */
export function auditPublishResult(args: PublishResultArgs): void {
  recordPublishResult(AUDIT_ACTIONS.draw.publishResult, args);
}

/**
 * Audit công bố LẠI kết quả kỳ quay Max 3D — sửa kết quả sau khi kỳ đã settle
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
 * sales, settle, resettle) — cùng shape, chỉ khác `action`.
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
    changes: { before: { status: args.prevStatus } },
    metadata: { extra: args.extra },
  });
}

/**
 * Audit staff BẤM NÚT kết sổ kỳ quay Max 3D (settle lần đầu) từ BO.
 *
 * Đây là action chủ động của người thật (`draw.settle`) — KHÁC
 * `system.settle_finalized` do worker ghi khi SFN kết sổ chạy xong.
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi transition sang settling.
 */
export function auditSettle(args: { actor: AuditActor; drawId: string; prevStatus: string }): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.settle, {
    ...args,
  });
}

/**
 * Audit staff BẤM NÚT kết sổ LẠI kỳ quay Max 3D (resettle) từ BO — sau khi đã
 * republish kết quả.
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi transition sang settling.
 * @param args.resettleId - Session key của phiên resettle (tracing/snapshot).
 */
export function auditResettle(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
  resettleId?: string;
}): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.resettle, {
    actor: args.actor,
    drawId: args.drawId,
    prevStatus: args.prevStatus,
    extra: dropUndefined({ resettleId: args.resettleId }),
  });
}

/**
 * Audit staff mở bán kỳ quay Max 3D từ BO (`scheduled|sales_closed → sales_open`).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi mở bán.
 */
export function auditOpenSales(args: { actor: AuditActor; drawId: string; prevStatus: string }): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.openSales, {
    ...args,
  });
}

/**
 * Audit staff đóng bán kỳ quay Max 3D từ BO (`sales_open → sales_closed`).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.prevStatus - Trạng thái draw trước khi đóng bán.
 */
export function auditCloseSales(args: { actor: AuditActor; drawId: string; prevStatus: string }): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.closeSales, {
    ...args,
  });
}

/**
 * Audit staff cập nhật lịch bán/quay của kỳ quay Max 3D từ BO.
 *
 * Ghi diff lịch trước/sau (mở/đóng bán + giờ quay) để tái dựng ai đổi lịch gì.
 * Field `undefined` bị loại khỏi diff (không ghi `null`/`undefined` vào DB).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`YYYY-MM-DD.NNN`).
 * @param args.before - Lịch cũ (ISO 8601): openAt/closeAt/drawTime.
 * @param args.after - Lịch mới (ISO 8601): openAt/closeAt/drawTime.
 */
export function auditUpdateSchedule(args: {
  actor: AuditActor;
  drawId: string;
  before: { openAt?: string; closeAt?: string; drawTime?: string };
  after: { openAt: string; closeAt: string; drawTime: string };
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
  });
}

/**
 * Audit cập nhật cấu hình game Max 3D toàn cục.
 *
 * Chỉ ghi **giá trị mới** (`changes.after`) của các nhóm field đã đổi
 * (rates/defaultPrizes/play). KHÔNG ghi `before`: config append-only + có
 * `version`, muốn biết đổi gì thì trace ngược record version trước.
 *
 * Nhóm lồng sâu (defaultPrizes.basic/combo/plus) được flatten theo dot-path để
 * giữ **chính xác giá trị sâu** — VD `defaultPrizes.basic.special = 20000000`,
 * không tóm tắt chung chung.
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.version - Version config sau khi upsert (đã auto-increment).
 * @param args.changed - Các nhóm field đã đổi kèm giá trị mới.
 */
export function auditUpdateGameConfig(args: {
  actor: AuditActor;
  version: number;
  changed: Record<string, unknown>;
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
    metadata: { extra: { version: args.version } },
  });
}

/** Snapshot 2 field mutable của TenantConfig để ghi giá trị mới. */
type TenantConfigSnapshot = {
  commissionRate?: number;
  isEnabled?: boolean;
};

/**
 * Audit cập nhật cấu hình Max 3D riêng của 1 tenant (upsert).
 *
 * `targetId` = tenantId → deep-link tới đúng trang cấu hình tenant ở BO. Chỉ ghi
 * **giá trị mới** (`changes.after`) 2 field mutable (commissionRate, isEnabled) —
 * config có `version`, trace ngược record trước để biết giá trị cũ.
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.tenantId - Id tenant sở hữu cấu hình.
 * @param args.version - Version config sau khi upsert (đã auto-increment).
 * @param args.after - Snapshot config sau khi sửa.
 */
export function auditUpdateTenantConfig(args: {
  actor: AuditActor;
  tenantId: string;
  version: number;
  after: TenantConfigSnapshot;
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
      extra: { version: args.version },
    },
  });
}
