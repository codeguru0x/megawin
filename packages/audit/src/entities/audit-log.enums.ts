/**
 * Enums & action registry cho audit log.
 *
 * Mọi enum dùng pattern `const object + type` (không `enum` keyword) — đồng bộ
 * convention monorepo (vd `GameProduct`, `TicketStatus`). Value là string ổn
 * định lưu thẳng vào Mongo, không phụ thuộc thứ tự khai báo.
 */

/**
 * Loại chủ thể thực hiện hành động.
 *
 * - `company` — staff/admin nội bộ (Backoffice).
 * - `agent` — đại lý.
 * - `player` — người chơi (hiếm khi là actor của audit, chủ yếu là target).
 * - `system` — máy tự chạy (worker Step Function, cron, queue consumer).
 * - `unknown` — KHÔNG map được loại tài khoản về 4 giá trị trên (vd loại tài khoản
 *   mới chưa khai báo, data migrate lỗi). Là **cờ forensic**: query `actorType =
 *   "unknown"` để truy ra audit bất thường cần sửa code adapter — KHÔNG dùng làm
 *   giá trị hợp lệ trong luồng bình thường.
 */
export const AuditActorType = {
  Company: "company",
  Agent: "agent",
  Player: "player",
  System: "system",
  Unknown: "unknown",
} as const;
export type AuditActorType = (typeof AuditActorType)[keyof typeof AuditActorType];

/**
 * Nhóm hành động — tiền tố của {@link AuditAction} (`{category}.{verb}`).
 *
 * Là 1 chiều filter top-level có index (`{ category: 1, ts: -1 }`).
 */
export const AuditCategory = {
  Draw: "draw",
  Player: "player",
  Config: "config",
  Auth: "auth",
  Account: "account",
  Finance: "finance",
  System: "system",
  Worker: "worker",
  /** Quyết định người verify/reject kết quả ResultFeed (`03-consensus.plan.md §5`). */
  ResultFeed: "resultfeed",
} as const;
export type AuditCategory = (typeof AuditCategory)[keyof typeof AuditCategory];

/** Kết quả hành động — `success` hoặc `failure`. */
export const AuditStatus = {
  Success: "success",
  Failure: "failure",
} as const;
export type AuditStatus = (typeof AuditStatus)[keyof typeof AuditStatus];

/**
 * Loại đối tượng bị tác động — dùng cho deep-link resolver ở BO.
 *
 * `(targetType, game, targetId)` đủ để build URL nội bộ tới trang chi tiết đối
 * tượng. VD `draw` + `keno` + `2026-03-07.095` → trang vận hành kỳ Keno.
 */
export const AuditTargetType = {
  Draw: "draw",
  Player: "player",
  GameConfig: "game_config",
  TenantConfig: "tenant_config",
  Account: "account",
  Tenant: "tenant",
  Worker: "worker",
  /** 1 doc `consensus` ResultFeed (game × kỳ) — target của `AUDIT_ACTIONS.consensus.*`. */
  ResultFeedConsensus: "resultfeed_consensus",
  /** 1 doc `sources` ResultFeed (nguồn thu thập) — target của `AUDIT_ACTIONS.resultfeed.updateSource`. */
  ResultFeedSource: "resultfeed_source",
} as const;
export type AuditTargetType = (typeof AuditTargetType)[keyof typeof AuditTargetType];

/**
 * Registry toàn bộ audit action — nhóm theo {@link AuditCategory}.
 *
 * QUY TẮC mở rộng (đọc kỹ trước khi thêm):
 * 1. Value format `{category}.{verb}` — snake_case cho verb. PHẢI UNIQUE toàn cục.
 *    Vì category là prefix nên format này tự đảm bảo unique.
 * 2. Thêm verb mới → thêm vào đúng nhóm category bên dưới (KHÔNG tạo nhóm rời rạc).
 * 3. Thêm category mới → (a) thêm vào {@link AuditCategory}, (b) tạo nhóm mới ở
 *    đây, (c) bổ sung label ở `AuditActionLabel` (labels.ts) — `Record` ép buộc
 *    nên quên label sẽ lỗi compile.
 * 4. KHÔNG xoá action đã ship (log cũ vẫn tham chiếu) — chỉ deprecate qua comment.
 * 5. Mỗi action map tới 1 {@link AuditCategory} + (thường) 1 {@link AuditTargetType}
 *    nhất quán — xem bảng §3.2 trong plan.
 * 6. **TUYỆT ĐỐI KHÔNG nhúng tên game vào action.** Verb dùng CHUNG cho cả 7 game
 *    — game phân biệt qua field `game` riêng trong {@link AuditLogDoc}, KHÔNG qua
 *    action. Đúng: `draw.void` + `game: "keno"`. SAI: `keno.draw.void`,
 *    `AUDIT_ACTIONS.keno.*`. Nhờ vậy thêm 1 game = 0 dòng đổi ở registry này;
 *    registry chỉ phình theo số *loại hành động*, không theo số game.
 *
 * @example
 * ```ts
 * record({ action: AUDIT_ACTIONS.draw.void, ... });
 * // action === "draw.void"
 * ```
 */
export const AUDIT_ACTIONS = {
  /** category=draw, target=draw. Vận hành kỳ quay. */
  draw: {
    publishResult: "draw.publish_result",
    republishResult: "draw.republish_result",
    void: "draw.void",
    // `settle`/`resettle` = staff BẤM NÚT kết sổ / kết sổ lại từ BO (hành động
    // chủ động, ghi actor người thật). KHÁC `system.settle_finalized` bên dưới —
    // đó là worker báo ĐÃ HOÀN TẤT sau khi SFN chạy xong (actor = system).
    settle: "draw.settle",
    resettle: "draw.resettle",
    // Thao tác vòng đời bán vé + lịch — staff chủ động đổi trạng thái kỳ ở BO.
    openSales: "draw.open_sales",
    closeSales: "draw.close_sales",
    updateSchedule: "draw.update_schedule",
    // Mở lại kỳ đã settled để chạy cascade jackpot (split cycle) — CHỈ game có
    // jackpot (lotto535/mega645/power655). Keno/max3d/max3dpro/bingo18 không có.
    reopenForCascade: "draw.reopen_for_cascade",
  },
  /** category=player, target=player. Quản trị tài khoản người chơi. */
  player: {
    suspend: "player.suspend",
    activate: "player.activate",
  },
  /** category=config, target=game_config|tenant. Cập nhật cấu hình. */
  config: {
    updateGlobal: "config.update_global",
    updateTenant: "config.update_tenant",
  },
  /** category=auth, target=account. Đăng nhập/đăng xuất — CHỈ ghi cho tài khoản
   * `company` và `agent` (KHÔNG ghi `player` để tránh rác dữ liệu volume lớn). */
  auth: {
    login: "auth.login",
    logout: "auth.logout",
  },
  /**
   * category=account, target=account. Thao tác QUẢN TRỊ tài khoản (đổi mật khẩu,
   * bật/tắt MFA). Phân biệt với `auth` (login/logout — phiên đăng nhập).
   *
   * `setPassword` = 1 tài khoản đặt lại pass CHO tài khoản KHÁC (cross-account —
   * ghi đầy đủ actor + target). `changeOwnPassword`/`enableMfa`/`disableMfa` =
   * thao tác lên CHÍNH tài khoản mình (self — chỉ ghi sự kiện, KHÔNG ghi chi tiết
   * nhạy cảm như password/secret).
   */
  account: {
    setPassword: "account.set_password",
    changeOwnPassword: "account.change_own_password",
    enableMfa: "account.enable_mfa",
    disableMfa: "account.disable_mfa",
  },
  /** category=finance, target=account. Điều chỉnh tài chính. */
  finance: {
    adjustBalance: "finance.adjust_balance",
  },
  /** category=system, target=draw. Action hệ thống tự chạy (worker). */
  system: {
    settleFinalized: "system.settle_finalized",
    voidFinalized: "system.void_finalized",
  },
  /**
   * category=worker, target=worker. Thao tác vận hành worker nền từ trang BO
   * "Sức khoẻ worker" (`/system/workers`) — hiện chỉ có kill-switch.
   */
  worker: {
    setEnabled: "worker.set_enabled",
  },
  /**
   * category=resultfeed, target=resultfeed_consensus|resultfeed_source. Quyết định NGƯỜI đưa
   * ra trên kết quả tổng hợp từ nhiều nguồn (`03-consensus.plan.md §5`) và thay đổi cấu hình
   * nguồn thu thập (`07-admin-management-page.plan.md §3.2`) — KHÁC quyết định MÁY
   * (`applyMachineDecision`, không audit vì chạy tự động mọi tick, audit sẽ ngập log vô
   * nghĩa). Chỉ audit hành động CON NGƯỜI bấm nút.
   */
  resultfeed: {
    verifyConsensus: "resultfeed.verify_consensus",
    rejectConsensus: "resultfeed.reject_consensus",
    /** Sửa `role`/`trustWeight`/`isEnabled`/... của 1 nguồn thu thập (trang `/resultfeed/sources`). */
    updateSource: "resultfeed.update_source",
  },
} as const;

/**
 * Tập action **self-visible** — hiện ở trang "Nhật ký của tôi" (`/me/activity`)
 * để CHÍNH CHỦ tự giám sát bảo mật tài khoản (phát hiện đăng nhập lạ, bị đổi
 * mật khẩu / MFA).
 *
 * Đây là nguồn chân lý DUY NHẤT cho cả API whitelist lẫn UI filter — tránh lệch
 * giữa 2 tầng. CỐ Ý chỉ gồm sự kiện bảo mật **SELF** (actor = target: mình tự
 * đăng nhập / đổi mật khẩu / bật-tắt MFA của mình), KHÔNG gồm hành động nghiệp
 * vụ (`draw.*`, `config.*`, `finance.*`, `player.*`, `system.*`).
 *
 * ## Vì sao loại hành động nghiệp vụ?
 *
 * Theo nguyên tắc **separation of duties** (SOC2 / NIST): người thực hiện KHÔNG
 * tự giám sát nhật ký nghiệp vụ của chính mình — việc đó thuộc quản lý/auditor
 * xem qua trang admin (`/audit-logs`). Trang cá nhân chỉ là "security activity"
 * kiểu Google/GitHub/AWS: login, logout, đổi mật khẩu, MFA.
 *
 * ## Vì sao KHÔNG có `account.set_password` (CROSS action)?
 *
 * `set_password` là action **CROSS**: actor (admin/staff) ≠ target (nạn nhân bị
 * reset pass). Cho target xem record này = lộ danh tính + **IP của admin** cho
 * cấp dưới, và mọi `changes`/`metadata` thêm sau sẽ tự động rò rỉ. Vì vậy CỐ Ý
 * loại — chỉ giữ action SELF nơi actor = target, an toàn tuyệt đối.
 *
 * ## Ngữ nghĩa chiều target — {@link SELF_ACTIVITY_TARGET_ACTIONS}
 *
 * Mặc định query self-scope chỉ match `actorId = me` (SELF). Chiều "mình là
 * target" là tính năng ĐỘC LẬP, chỉ bật cho whitelist hẹp
 * {@link SELF_ACTIVITY_TARGET_ACTIONS} — hiện RỖNG. Muốn cho nạn nhân thấy 1
 * CROSS action nào đó thì phải thêm CÓ CHỦ ĐÍCH vào whitelist đó (sau khi review
 * nó không lộ thông tin actor nhạy cảm), KHÔNG mở mặc định cho mọi action.
 *
 * @example
 * ```ts
 * if (SELF_ACTIVITY_ACTION_SET.has(action)) {
 *   // action được phép hiện ở trang cá nhân
 * }
 * ```
 */
export const SELF_ACTIVITY_ACTIONS = [
  AUDIT_ACTIONS.auth.login,
  AUDIT_ACTIONS.auth.logout,
  AUDIT_ACTIONS.account.changeOwnPassword,
  AUDIT_ACTIONS.account.enableMfa,
  AUDIT_ACTIONS.account.disableMfa,
] as const;

/** Union các action self-visible — hẹp hơn {@link AuditAction}. */
export type SelfActivityAction = (typeof SELF_ACTIVITY_ACTIONS)[number];

/**
 * `Set` để lookup O(1) — dùng ở API whitelist / guard.
 * Khai `Set<AuditAction>` (không hẹp) để nhận input `AuditAction` bất kỳ khi check.
 */
export const SELF_ACTIVITY_ACTION_SET: ReadonlySet<AuditAction> = new Set<AuditAction>(SELF_ACTIVITY_ACTIONS);

/**
 * Whitelist action được match ở **chiều target** trên trang "Nhật ký của tôi" —
 * record mà user là ĐỐI TƯỢNG bị tác động (không phải người thực hiện).
 *
 * ## Vì sao tách riêng khỏi {@link SELF_ACTIVITY_ACTIONS}?
 *
 * Chiều target chỉ có ý nghĩa với **CROSS action** (actor ≠ target): admin reset
 * pass / tắt MFA CHO user — tín hiệu bị chiếm quyền mà nạn nhân nên biết. NHƯNG
 * cho target xem CROSS record = lộ `actorName`/`actorRoles`/`ip` của admin. Vì
 * vậy chiều này KHÔNG bật mặc định — chỉ action nằm trong whitelist NÀY mới được
 * match qua target, buộc mọi bổ sung phải cân nhắc rủi ro lộ thông tin actor.
 *
 * ## Hiện trạng: RỖNG (cố ý)
 *
 * `account.set_password` là ứng viên duy nhất nhưng đã loại: (1) rủi ro lộ IP +
 * danh tính admin cho cấp dưới; (2) `auditSetAccountPassword` ghi
 * `targetId = username` (không phải accountId) nên chiều target vốn không khớp.
 * Muốn bật lại: sửa handler ghi `targetId = accountId`, ẩn actor khi target xem,
 * rồi thêm vào đây.
 *
 * Rỗng ⇒ query bỏ hẳn nhánh `$or` target ⇒ hành vi thuần SELF (`actorId = me`).
 */
export const SELF_ACTIVITY_TARGET_ACTIONS = [] as const satisfies readonly AuditAction[];

/** `Set` lookup O(1) cho whitelist chiều target. Hiện rỗng. */
export const SELF_ACTIVITY_TARGET_ACTION_SET: ReadonlySet<AuditAction> = new Set<AuditAction>(
  SELF_ACTIVITY_TARGET_ACTIONS,
);

/** Lấy union mọi value của object. Distributive — áp lên từng member của union. */
type ValueOf<T> = T extends unknown ? T[keyof T] : never;

/**
 * Union mọi giá trị action — type cho `AuditLogDoc.action`.
 *
 * `ValueOf` 2 lần: lần đầu lấy từng nhóm category, lần hai distribute lấy mọi
 * verb trong từng nhóm. `ValueOf` phải distributive (dùng `extends unknown`) vì
 * các nhóm khác shape — `keyof` trên union nhóm = giao key = rỗng = `never`.
 * Ép `action` chỉ nhận string trong {@link AUDIT_ACTIONS} (compile-time guard).
 */
export type AuditAction = ValueOf<ValueOf<typeof AUDIT_ACTIONS>>;
