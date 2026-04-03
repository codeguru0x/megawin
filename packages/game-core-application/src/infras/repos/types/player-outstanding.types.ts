import type { GameProduct } from "@megawin/game-core/entities/game-core.enums";

/**
 * Một entry outstanding của player — dữ liệu tối thiểu hiển thị trên trang Player Detail.
 *
 * Aggregate trực tiếp từ {game}_ticket_entries (status = "scheduled").
 * Mỗi row = 1 entry đang chờ kết quả.
 */
export interface PlayerOutstandingEntry {
  /** Game product identifier (mega645, power655, ...). */
  gameProduct: GameProduct;
  /** Entry ID (ObjectId hex string) — dùng để fetch full doc cho EntryDetailDialog. */
  entryId: string;
  /** Ticket ID liên kết. */
  ticketId: string;
  /** Ticket number hiển thị (vd: "6/45-2026-0000123"). */
  ticketNo: string;
  /** Tenant ID — 1 player chỉ thuộc 1 tenant duy nhất. */
  tenantId: string;
  /** ID kỳ quay mà entry này tham gia. */
  drawId: string;
  /** Ngày tài chính YYYY-MM-DD. */
  financialDate: string;
  /** Tổng tiền cược (VND). */
  amount: number;
  /** Hoa hồng đại lý snapshot lúc đặt cược (VND). */
  commissionAmount: number;
  /**
   * Số boards trong vé = `entrySummary.boards.length`.
   * Tất cả 7 game đều có. `undefined` khi data cũ không truyền vào.
   */
  boardCount?: number;
  /**
   * Số lines sau khi expand (lotto535, mega645, power655, max3d, max3dpro).
   * Keno/Bingo18: `undefined`.
   */
  lineCount?: number;
  /**
   * Số đơn vị cược = Σ(expandedLines × betCount) cho games có lines,
   * hoặc Σ(board.betCount) cho Keno/Bingo18.
   * `undefined` khi data cũ chưa có field này.
   */
  betUnitCount?: number;
  /** Thời điểm tạo entry (ISO string). */
  createdAt: string;
}

/**
 * Summary outstanding của player — tổng hợp cross-game.
 *
 * Dùng cho KPI strip tab "Đang chờ".
 */
export interface PlayerOutstandingSummary {
  /** Tổng số entry đang chờ. */
  totalEntryCount: number;
  /** Tổng tiền cược đang chờ (VND). */
  totalStake: number;
  /** Tổng hoa hồng ước tính (VND). */
  totalCommission: number;
  /** Số game có entry outstanding. */
  activeGameCount: number;
  /** Chi tiết từng entry (sort by createdAt desc). */
  entries: PlayerOutstandingEntry[];
}
