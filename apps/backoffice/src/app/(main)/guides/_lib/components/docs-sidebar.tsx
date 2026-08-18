"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { getGameMeta } from "../game-meta";
import { STAFF_GUIDE_MANIFEST } from "../staff-manifest";

/**
 * Cây điều hướng knowledge base: Game → Topic → Doc, dựng từ manifest staff.
 *
 * Active doc highlight theo màu brand game (`text-game-*` / `bg-game-*-muted`).
 * Mặc định mở game/topic chứa doc đang xem.
 *
 * @param onNavigate - Callback khi chọn doc (đóng Sheet trên mobile).
 */
export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      <Link
        href="/guides"
        onClick={onNavigate}
        className={cn(
          "rounded-md px-3 py-2 text-sm font-medium transition-colors",
          pathname === "/guides" ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
        )}
      >
        Tổng quan
      </Link>

      {STAFF_GUIDE_MANIFEST.map((game) => {
        const meta = getGameMeta(game.gameKey);
        const Icon = meta.icon;
        const gameActive = pathname.startsWith(`/guides/${game.gameKey}`);

        return (
          <Collapsible key={game.gameKey} defaultOpen={gameActive} className="mt-1">
            <CollapsibleTrigger className="group hover:bg-accent/50 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors">
              <Icon className={cn("size-4 shrink-0", meta.text)} />
              <span className="flex-1 text-left">{game.title}</span>
              <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 ml-3 flex flex-col gap-0.5 border-l pl-3">
              {game.topics.map((topic) =>
                topic.docs.map((doc) => {
                  const href = `/guides/${game.gameKey}/${topic.key}/${doc.slug}`;
                  const active = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onNavigate}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm transition-colors",
                        active
                          ? cn(meta.bgMuted, meta.text, "font-medium")
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      {doc.title}
                    </Link>
                  );
                }),
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </nav>
  );
}
