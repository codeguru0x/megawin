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
        className={cn("gap-1", meta.bgMuted, meta.text, "border-transparent")}
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
