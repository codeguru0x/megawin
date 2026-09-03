"use client";

/**
 * Shared UI — Player display + outstanding link helpers.
 *
 * Chuẩn hoá cách hiển thị người chơi trên **toàn backoffice**: `<primary> · <tenantId>`
 * (rule `player-display-username.mdc`). Trước đây mỗi trang tự parse — alert/top risk
 * show raw `player4@devone`, nơi khác show `player4 · devone` — bất nhất. Component này
 * là 1 nguồn duy nhất, dùng ở mọi game (operations, reports outstanding/settle/void, jackpot…).
 *
 * `buildOutstandingHref` dựng link tới trang Outstanding của **đúng game** (`gameProduct`),
 * drill sẵn vào kỳ × đại lý × player để staff minh bạch: thấy toàn bộ entry của player kỳ
 * đó + mở entry detail dialog (có sẵn ở trang outstanding mọi game). Tenant suy từ suffix
 * `@tenantId` của megawin username. Mọi game dùng cùng shape query (`drawId`/`tenantId`/
 * `accountId`/`playerName`) tại `/games/{gameProduct}/reports/outstanding` — xem
 * `use-outstanding-filters.ts` của từng game.
 */

import Link from "next/link";

import type { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { splitBackofficeUsername } from "@megawin/shared/utils";
import type { Route } from "next";

import { cn } from "@/lib/utils";

/**
 * Tên người chơi hiển thị nhất quán: `<primary> · <tenantId>`.
 *
 * `tenantId` hiện mờ phía sau (có thể ẩn qua `showTenant={false}` ở chỗ quá chật).
 * KHÔNG hiển thị `accountId` — accountId chỉ dùng để dựng link (xem `buildOutstandingHref`),
 * search/nhận diện dùng username là đủ (§ rule `player-display-username.mdc`).
 */
export function PlayerName({
  username,
  accountId,
  className,
  showTenant = true,
}: {
  /** Megawin username `<id>@<tenantId>` (snapshot lúc cược). */
  username: string;
  /** Fallback khi `username` rỗng. */
  accountId?: string;
  className?: string;
  showTenant?: boolean;
}) {
  const { primary, tenantId } = splitBackofficeUsername(username || accountId || "");
  return (
    <span className={cn("inline-flex items-baseline gap-1 min-w-0", className)}>
      <span className="font-medium text-foreground truncate">{primary}</span>
      {showTenant && tenantId && <span className="text-muted-foreground/70 text-[11px] shrink-0">· {tenantId}</span>}
    </span>
  );
}

/**
 * Dựng href tới trang Outstanding của `gameProduct`, drill sẵn vào kỳ × đại lý × player.
 *
 * Trả `null` khi username không có suffix `@tenantId` (không đủ dữ liệu drill tới level
 * player — outstanding cần cả tenant). Caller fallback link tới level draw hoặc bỏ link.
 *
 * @param gameProduct - Game đang xem (route slug trùng giá trị enum, vd `"keno"`).
 * @param drawId - Kỳ của alert/entry.
 * @param accountId - ID account (param `accountId`).
 * @param username - Megawin username; tenant + tên hiển thị suy từ đây.
 */
export function buildOutstandingHref(
  gameProduct: GameProduct,
  drawId: string,
  accountId: string,
  username: string,
): Route | null {
  const { primary, tenantId } = splitBackofficeUsername(username);
  if (!tenantId) return null;
  const params = new URLSearchParams({
    drawId,
    tenantId,
    accountId,
    playerName: primary,
  });
  return `/games/${gameProduct}/reports/outstanding?${params.toString()}` as Route;
}

/**
 * Link "→ Outstanding" cho player ở 1 kỳ của `gameProduct`. Nếu không dựng được href
 * (thiếu tenant) → render `PlayerName` tĩnh (không link). Dùng trong alert item + top
 * risk để staff drill nhanh.
 */
export function PlayerOutstandingLink({
  gameProduct,
  drawId,
  accountId,
  username,
  className,
}: {
  gameProduct: GameProduct;
  drawId: string;
  accountId: string;
  username: string;
  className?: string;
}) {
  const href = buildOutstandingHref(gameProduct, drawId, accountId, username);
  if (!href) return <PlayerName username={username} accountId={accountId} className={className} />;
  return (
    <Link
      prefetch={false}
      href={href}
      className={cn("hover:underline underline-offset-2 decoration-dotted", className)}
      title="Xem outstanding player ở kỳ này"
    >
      <PlayerName username={username} accountId={accountId} />
    </Link>
  );
}
