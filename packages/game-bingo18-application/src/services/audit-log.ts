import { record, dropUndefined, flattenChanges, type AuditActor } from "@megawin/audit/logger";
import {
  AUDIT_ACTIONS,
  AuditCategory,
  AuditTargetType,
  type AuditAction,
  type AuditScalar,
} from "@megawin/audit/entities";
import { GameProduct } from "@megawin/game-core/entities";

/**
 * Bingo 18 audit-log helpers — nhóm free functions ghi audit log cho domain Bingo 18.
 *
 * Đóng băng sẵn `game`/`category`/`targetType`/`action` của Bingo 18 → use-case
 * chỉ truyền payload nghiệp vụ tối thiểu (actor + id + diff).
 *
 * Phân tầng: `@megawin/audit/logger` cung cấp `record()` (low-level, generic).
 * Module này là tầng high-level riêng Bingo 18 — là **domain service** ("ghi lại
 * chuyện gì đã xảy ra trong domain Bingo 18"), nên đặt trong `services/` cùng các
 * domain service khác. Phụ thuộc domain type Bingo 18 (status, numbers…) nên
 * KHÔNG đặt trong `@megawin/audit` (tránh dependency ngược audit → game).
 *
 * Đây là **free functions stateless** — KHÔNG class, KHÔNG state, KHÔNG DI (khác
 * class `Bingo18TicketLookupService`). Bỏ suffix `Service` ở tên để phân biệt với
 * class `*Service`. Mỗi game tự có `services/audit-log.ts` tương tự.
 *
 * Mọi function đều **fire-and-forget** (gọi `record()`) — audit fail không bao
 * giờ làm hỏng nghiệp vụ.
 */

const GAME = GameProduct.Bingo18;

type PublishResultArgs = {
  actor: AuditActor;
  drawId: string;
  /**
   * 3 số kết quả xúc xắc (mỗi số 1-6), giữ nguyên thứ tự quay. VD `[3, 5, 2]`.
   * Bingo 18 dùng `number[]` (KHÁC Keno/Lotto zero-padded string) — số nhỏ,
   * không cần padding.
   */
  numbers: number[];
  /** Tổng 3 số (3-18) = numbers[0] + numbers[1] + numbers[2]. */
  sum: number;
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
 * Audit huỷ kỳ quay Bingo 18.
 *
 * @param args.actor - Chủ thể thực hiện (đã normalize ở tầng route/worker).
 * @param args.drawId - Id kỳ quay (`bingo18_{drawDate}_{drawNo}`).
 * @param args.prevStatus - Trạng thái draw trước khi void (để ghi diff).
 * @param args.reason - Lý do huỷ (tuỳ chọn).
 */
export function auditDrawVoid(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
  reason?: string;
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
    metadata: { extra: dropUndefined({ reason: args.reason }) },
  });
}

/**
 * Core dùng chung cho publish & republish — chỉ khác `action`. Không export:
 * caller luôn đi qua {@link auditPublishResult} / {@link auditRepublishResult}
 * để cố định đúng action, tránh truyền nhầm.
 *
 * Bộ số trúng (+ tổng) là NỘI DUNG của thay đổi (before: chưa có kết quả →
 * after: có kết quả) nên ghi vào `changes`, KHÔNG phải `metadata.extra`. UI hiển
 * thị dạng "3, 5, 2 (tổng 10)" dễ đọc.
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
    changes: { after: { numbers: args.numbers, sum: args.sum } },
    metadata: {
      extra: dropUndefined({
        vietlottDrawPeriod: args.vietlottRef?.drawPeriod,
        vietlottDrawDate: args.vietlottRef?.drawDate,
      }),
    },
  });
}

/**
 * Audit công bố kết quả kỳ quay Bingo 18 (publish lần đầu / sửa trước khi settle).
 *
 * Kết quả được sửa SAU khi đã settle dùng {@link auditRepublishResult} (ghi action
 * `draw.republish_result` để phân biệt luồng resettle).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`bingo18_{drawDate}_{drawNo}`).
 * @param args.numbers - 3 số xúc xắc (1-6), giữ thứ tự quay.
 * @param args.sum - Tổng 3 số (3-18).
 * @param args.vietlottRef - Tham chiếu Vietlott (drawPeriod/drawDate) nếu có.
 */
export function auditPublishResult(args: PublishResultArgs): void {
  recordPublishResult(AUDIT_ACTIONS.draw.publishResult, args);
}

/**
 * Audit công bố LẠI kết quả kỳ quay Bingo 18 — sửa kết quả sau khi kỳ đã settle
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
 * Audit staff BẤM NÚT kết sổ kỳ quay Bingo 18 (settle lần đầu) từ BO.
 *
 * Đây là action chủ động của người thật (`draw.settle`) — KHÁC
 * `system.settle_finalized` do worker ghi khi SFN kết sổ chạy xong.
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`bingo18_{drawDate}_{drawNo}`).
 * @param args.prevStatus - Trạng thái draw trước khi transition sang settling.
 */
export function auditSettle(args: { actor: AuditActor; drawId: string; prevStatus: string }): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.settle, {
    ...args,
  });
}

/**
 * Audit staff BẤM NÚT kết sổ LẠI kỳ quay Bingo 18 (resettle) từ BO — sau khi đã
 * republish kết quả.
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`bingo18_{drawDate}_{drawNo}`).
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
 * Audit staff mở bán kỳ quay Bingo 18 từ BO (`scheduled|sales_closed → sales_open`).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`bingo18_{drawDate}_{drawNo}`).
 * @param args.prevStatus - Trạng thái draw trước khi mở bán.
 */
export function auditOpenSales(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
}): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.openSales, {
    ...args,
  });
}

/**
 * Audit staff đóng bán kỳ quay Bingo 18 từ BO (`sales_open → sales_closed`).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`bingo18_{drawDate}_{drawNo}`).
 * @param args.prevStatus - Trạng thái draw trước khi đóng bán.
 */
export function auditCloseSales(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
}): void {
  recordStatusTransition(AUDIT_ACTIONS.draw.closeSales, {
    ...args,
  });
}

/**
 * Audit staff cập nhật lịch bán/quay của kỳ quay Bingo 18 từ BO.
 *
 * Ghi diff lịch trước/sau (mở/đóng bán + giờ quay) để tái dựng ai đổi lịch gì.
 * Field `undefined` bị loại khỏi diff (không ghi `null`/`undefined` vào DB).
 *
 * @param args.actor - Chủ thể thực hiện.
 * @param args.drawId - Id kỳ quay (`bingo18_{drawDate}_{drawNo}`).
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
 * Audit cập nhật cấu hình game Bingo 18 toàn cục.
 *
 * Chỉ ghi **giá trị mới** (`changes.after`) của các nhóm field đã đổi
 * (rates/singleNumPrizes/…). KHÔNG ghi `before`: config append-only + có
 * `version`, muốn biết đổi gì thì trace ngược record version trước.
 *
 * Nhóm lồng sâu (sumTotalPrizes) được flatten theo dot-path để giữ **chính xác
 * giá trị sâu** — VD `sumTotalPrizes.10 = 5`, không tóm tắt chung chung.
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
 * Audit cập nhật cấu hình Bingo 18 riêng của 1 tenant (upsert).
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
