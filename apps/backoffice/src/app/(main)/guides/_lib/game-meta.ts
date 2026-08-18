import type { LucideIcon } from "lucide-react";
import { ChessBishop, ChessKing, ChessKnight, ChessPawn, ChessQueen, ChessRook } from "lucide-react";

/**
 * Metadata hiển thị cho từng game trong knowledge base: icon + class màu brand.
 *
 * Class màu tham chiếu token `--color-game-{key}` trong globals.css (Tailwind v4
 * `@theme`), nên viết tường minh từng class để Tailwind giữ lại khi quét source.
 */
export interface GameMeta {
  /** Icon game, khớp sidebar chính. */
  icon: LucideIcon;
  /** Class chữ màu brand. VD: `text-game-power655`. */
  text: string;
  /** Class nền brand nhạt. VD: `bg-game-power655-muted`. */
  bgMuted: string;
  /** Class viền brand. VD: `border-game-power655`. */
  border: string;
}

/**
 * Bảng tra metadata theo `gameKey`. Tường minh từng class để Tailwind không
 * tree-shake nhầm (không dùng class động `text-game-${key}`).
 */
export const GAME_META: Record<string, GameMeta> = {
  power655: {
    icon: ChessQueen,
    text: "text-game-power655",
    bgMuted: "bg-game-power655-muted",
    border: "border-game-power655",
  },
  lotto535: {
    icon: ChessKing,
    text: "text-game-lotto535",
    bgMuted: "bg-game-lotto535-muted",
    border: "border-game-lotto535",
  },
  mega645: {
    icon: ChessRook,
    text: "text-game-mega645",
    bgMuted: "bg-game-mega645-muted",
    border: "border-game-mega645",
  },
  keno: {
    icon: ChessBishop,
    text: "text-game-keno",
    bgMuted: "bg-game-keno-muted",
    border: "border-game-keno",
  },
  max3d: {
    icon: ChessRook,
    text: "text-game-max3d",
    bgMuted: "bg-game-max3d-muted",
    border: "border-game-max3d",
  },
  max3dpro: {
    icon: ChessPawn,
    text: "text-game-max3dpro",
    bgMuted: "bg-game-max3dpro-muted",
    border: "border-game-max3dpro",
  },
  bingo18: {
    icon: ChessKnight,
    text: "text-game-bingo18",
    bgMuted: "bg-game-bingo18-muted",
    border: "border-game-bingo18",
  },
};

/**
 * Lấy metadata game; fallback an toàn về màu trung tính nếu chưa khai báo.
 *
 * @param gameKey - Game key.
 * @returns Metadata + class màu.
 */
export function getGameMeta(gameKey: string): GameMeta {
  return (
    GAME_META[gameKey] ?? {
      icon: ChessRook,
      text: "text-foreground",
      bgMuted: "bg-muted",
      border: "border-border",
    }
  );
}
