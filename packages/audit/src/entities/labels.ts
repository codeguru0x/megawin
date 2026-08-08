import type { AuditAction } from "./audit-log.enums";
import { AUDIT_ACTIONS, AuditActorType, AuditCategory, AuditStatus, AuditTargetType } from "./audit-log.enums";

/** Nhãn tiếng Việt cho loại chủ thể thực hiện hành động. */
export const AuditActorTypeLabel: Record<AuditActorType, string> = {
  [AuditActorType.Company]: "Nhân viên Cty",
  [AuditActorType.Agent]: "Đại lý",
  [AuditActorType.Player]: "Người chơi",
  [AuditActorType.System]: "Hệ thống",
  [AuditActorType.Unknown]: "Không xác định",
};

/**
 * Nhãn tiếng Việt cho từng action — key là value của {@link AUDIT_ACTIONS}.
 *
 * `Record<AuditAction, string>` ép **mọi action phải có label** (compile-time):
 * thêm action mới vào `AUDIT_ACTIONS` mà quên label → TypeScript báo lỗi. Đây là
 * lý do label sống cạnh enum (tái dùng ở BO web, email report, consumer khác),
 * không tách rời ở từng consumer.
 */
export const AuditActionLabel: Record<AuditAction, string> = {
  // draw
  [AUDIT_ACTIONS.draw.publishResult]: "Công bố kết quả kỳ",
  [AUDIT_ACTIONS.draw.republishResult]: "Công bố lại kết quả",
  [AUDIT_ACTIONS.draw.void]: "Huỷ kỳ quay",
  [AUDIT_ACTIONS.draw.settle]: "Kết sổ kỳ",
  [AUDIT_ACTIONS.draw.resettle]: "Kết sổ lại kỳ",
  [AUDIT_ACTIONS.draw.openSales]: "Mở bán kỳ",
  [AUDIT_ACTIONS.draw.closeSales]: "Đóng bán kỳ",
  [AUDIT_ACTIONS.draw.updateSchedule]: "Cập nhật lịch kỳ",
  [AUDIT_ACTIONS.draw.reopenForCascade]: "Mở lại kỳ (cascade jackpot)",

  // player
  [AUDIT_ACTIONS.player.suspend]: "Khoá người chơi",
  [AUDIT_ACTIONS.player.activate]: "Mở khoá người chơi",

  // config
  [AUDIT_ACTIONS.config.updateGlobal]: "Cập nhật cấu hình game",
  [AUDIT_ACTIONS.config.updateTenant]: "Cập nhật cấu hình tenant",

  // auth
  [AUDIT_ACTIONS.auth.login]: "Đăng nhập",
  [AUDIT_ACTIONS.auth.logout]: "Đăng xuất",

  // account
  [AUDIT_ACTIONS.account.setPassword]: "Đặt lại mật khẩu tài khoản",
  [AUDIT_ACTIONS.account.changeOwnPassword]: "Đổi mật khẩu của mình",
  [AUDIT_ACTIONS.account.enableMfa]: "Bật xác thực 2 lớp (MFA)",
  [AUDIT_ACTIONS.account.disableMfa]: "Tắt xác thực 2 lớp (MFA)",

  // finance
  [AUDIT_ACTIONS.finance.adjustBalance]: "Điều chỉnh số dư",

  // system
  [AUDIT_ACTIONS.system.settleFinalized]: "Hoàn tất tính thưởng",
  [AUDIT_ACTIONS.system.voidFinalized]: "Hoàn tất huỷ kỳ",

  // worker
  [AUDIT_ACTIONS.worker.setEnabled]: "Bật/tắt worker",
};

/** Nhãn tiếng Việt cho từng nhóm action. */
export const AuditCategoryLabel: Record<AuditCategory, string> = {
  [AuditCategory.Draw]: "Kỳ quay",
  [AuditCategory.Player]: "Người chơi",
  [AuditCategory.Config]: "Cấu hình",
  [AuditCategory.Auth]: "Xác thực",
  [AuditCategory.Account]: "Tài khoản",
  [AuditCategory.Finance]: "Tài chính",
  [AuditCategory.System]: "Hệ thống",
  [AuditCategory.Worker]: "Worker",
};

/** Nhãn tiếng Việt cho kết quả hành động. */
export const AuditStatusLabel: Record<AuditStatus, string> = {
  [AuditStatus.Success]: "Thành công",
  [AuditStatus.Failure]: "Thất bại",
};

/** Nhãn tiếng Việt cho loại đối tượng bị tác động. */
export const AuditTargetTypeLabel: Record<AuditTargetType, string> = {
  [AuditTargetType.Draw]: "Kỳ quay",
  [AuditTargetType.Player]: "Người chơi",
  [AuditTargetType.GameConfig]: "Cấu hình game",
  [AuditTargetType.TenantConfig]: "Cấu hình tenant",
  [AuditTargetType.Account]: "Tài khoản",
  [AuditTargetType.Tenant]: "Tenant",
  [AuditTargetType.Worker]: "Worker",
};
