"use client";

/**
 * GameEntryDetailDialog — wrapper hiển thị EntryDetailDialog đúng game.
 *
 * Dispatch theo gameProduct sang dialog game-specific đã tồn tại trong reports/settle.
 *
 * LƯU Ý hiển thị theo trạng thái entry:
 * - scheduled (outstanding): chỉ có entrySummary + amount + drawId — KHÔNG có payout/result.
 *   Dialog sẽ ẩn các section kết quả quay và giải trúng.
 * - settled: có payout (nếu win), result, outcome. Dialog hiển thị đầy đủ.
 * - void: có voidInfo. Dialog có thể hiển thị thông tin hoàn trả (xử lý bởi dialog game-specific).
 */

import { Bingo18EntryDetailDialog } from "@/app/(main)/games/bingo18/reports/settle/_lib/sections/entry-detail-dialog";
import { KenoEntryDetailDialog } from "@/app/(main)/games/keno/reports/settle/_lib/sections/entry-detail-dialog";
import { Lotto535EntryDetailDialog } from "@/app/(main)/games/lotto535/reports/settle/_lib/sections/entry-detail-dialog";
import { Max3dEntryDetailDialog } from "@/app/(main)/games/max3d/reports/settle/_lib/sections/entry-detail-dialog";
import { Max3dproEntryDetailDialog } from "@/app/(main)/games/max3dpro/reports/settle/_lib/sections/entry-detail-dialog";
import { Mega645EntryDetailDialog } from "@/app/(main)/games/mega645/reports/settle/_lib/sections/entry-detail-dialog";
import { Power655EntryDetailDialog } from "@/app/(main)/games/power655/reports/settle/_lib/sections/entry-detail-dialog";

export interface GameEntryDetailDialogProps {
  /** Game product string (e.g. "mega645", "keno"...). */
  game: string;
  /**
   * Full entry doc — game-specific TicketEntryEntity.
   * null hoặc undefined → dialog đóng.
   *
   * Với outstanding entries (scheduled): không có payout/result — dialog hiển thị
   * bộ số đặt cược + thông tin kỳ, KHÔNG hiển thị kết quả.
   * Với settled entries: hiển thị đầy đủ.
   */
  // biome-ignore lint/suspicious/noExplicitAny: wrapper dùng chung cho TicketEntryEntity của 7 game khác nhau — mỗi game-specific dialog con tự narrow type.
  entry: any | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Wrapper render đúng EntryDetailDialog game-specific theo `game` prop.
 * Reuse 100% dialog logic đã implement trong reports/settle của từng game.
 */
export function GameEntryDetailDialog({ game, entry, open, onClose }: GameEntryDetailDialogProps) {
  const props = { entry, open, onClose };

  switch (game) {
    case "mega645":
      return <Mega645EntryDetailDialog {...props} />;
    case "lotto535":
      return <Lotto535EntryDetailDialog {...props} />;
    case "keno":
      return <KenoEntryDetailDialog {...props} />;
    case "max3d":
      return <Max3dEntryDetailDialog {...props} />;
    case "max3dpro":
      return <Max3dproEntryDetailDialog {...props} />;
    case "bingo18":
      return <Bingo18EntryDetailDialog {...props} />;
    case "power655":
      return <Power655EntryDetailDialog {...props} />;
    default:
      return null;
  }
}
