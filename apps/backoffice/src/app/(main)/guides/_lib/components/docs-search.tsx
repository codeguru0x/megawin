"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { Search } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

import { getGameMeta } from "../game-meta";
import { flattenDocs } from "../navigation";

/**
 * Ô mở tìm kiếm + palette `Cmd/Ctrl+K`, index phẳng mọi doc staff.
 *
 * Chọn doc → điều hướng tới route tương ứng và đóng palette.
 */
export function DocsSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const docs = useMemo(() => flattenDocs(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:bg-accent/50 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Tìm kiếm hướng dẫn...</span>
        <kbd className="bg-muted pointer-events-none hidden rounded border px-1.5 font-mono text-[10px] sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Tìm kiếm hướng dẫn"
        description="Tìm theo tên tài liệu hoặc game"
      >
        <CommandInput placeholder="Nhập tên hướng dẫn, game..." />
        <CommandList>
          <CommandEmpty>Không tìm thấy hướng dẫn phù hợp.</CommandEmpty>
          <CommandGroup heading="Hướng dẫn">
            {docs.map((item) => {
              const meta = getGameMeta(item.game.gameKey);
              const Icon = meta.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`${item.game.title} ${item.doc.title} ${item.doc.description}`}
                  onSelect={() => {
                    router.push(item.href);
                    setOpen(false);
                  }}
                >
                  <Icon className={cn("size-4", meta.text)} />
                  <div className="flex flex-col">
                    <span className="text-sm">{item.doc.title}</span>
                    <span className="text-muted-foreground text-xs">{item.game.title}</span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
