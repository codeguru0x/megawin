import { getGameColors } from "@/lib/game-colors";
import { getGameLabel } from "@/lib/game-labels";
import { cn } from "@/lib/utils";

export interface GameBadgeProps {
  /** Game product ID — VD: `"keno"`, `"mega645"`. Fallback về gray nếu không nhận diện. */
  gameProduct: string;
  /** Class bổ sung — override kích thước/margin nếu cần. */
  className?: string;
}

/**
 * Badge hiển thị tên game với brand color — nền mờ + chữ + viền theo màu game.
 *
 * Lấy màu từ `getGameColors` (single source of truth) để mọi bảng/list
 * nhận biết game qua màu nhất quán với dashboard, reports, ...
 */
export function GameBadge({ gameProduct, className }: GameBadgeProps) {
  const c = getGameColors(gameProduct);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        c.twBgMuted,
        c.twText,
        c.twBorder,
        className,
      )}
    >
      {getGameLabel(gameProduct)}
    </span>
  );
}
