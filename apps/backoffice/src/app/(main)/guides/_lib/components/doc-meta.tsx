import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { getGameMeta } from "../game-meta";

/**
 * Thanh metadata đầu bài: badge game (màu brand) + topic + thời gian đọc.
 *
 * @param gameKey - Game key (cho màu + icon).
 * @param gameTitle - Tên game hiển thị.
 * @param topicTitle - Tên topic hiển thị.
 * @param minutes - Thời gian đọc ước lượng (phút).
 */
export function DocMeta({
  gameKey,
  gameTitle,
  topicTitle,
  minutes,
}: {
  gameKey: string;
  gameTitle: string;
  topicTitle: string;
  minutes: number;
}) {
  const meta = getGameMeta(gameKey);
  const Icon = meta.icon;

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-transparent",
          gameKey === "power655" && "bg-game-power655-muted text-game-power655",
          gameKey === "lotto535" && "bg-game-lotto535-muted text-game-lotto535",
          gameKey === "mega645" && "bg-game-mega645-muted text-game-mega645",
          gameKey === "keno" && "bg-game-keno-muted text-game-keno",
          gameKey === "max3d" && "bg-game-max3d-muted text-game-max3d",
          gameKey === "max3dpro" && "bg-game-max3dpro-muted text-game-max3dpro",
          gameKey === "bingo18" && "bg-game-bingo18-muted text-game-bingo18",
          !(
            gameKey === "power655" ||
            gameKey === "lotto535" ||
            gameKey === "mega645" ||
            gameKey === "keno" ||
            gameKey === "max3d" ||
            gameKey === "max3dpro" ||
            gameKey === "bingo18"
          ) && "bg-muted text-foreground",
        )}
      >
        <Icon className="size-3" />
        {gameTitle}
      </Badge>
      <span>·</span>
      <span>{topicTitle}</span>
      <span>·</span>
      <span>{minutes} phút đọc</span>
    </div>
  );
}
