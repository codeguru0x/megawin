"use client";

import { useState } from "react";

import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { DocsSearch } from "./docs-search";
import { DocsSidebar } from "./docs-sidebar";

/**
 * Cột trái cho khung 3-pane: search palette + cây điều hướng.
 *
 * Desktop (`lg+`): cột cố định bên trái.
 * Mobile: ẩn, mở qua `Sheet` bằng nút "Mục lục".
 */
export function DocsSidebarShell() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[260px] shrink-0 border-r lg:block">
        <div className="sticky top-0 flex h-[calc(100dvh-3rem)] flex-col">
          <div className="border-b p-3">
            <DocsSearch />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <DocsSidebar />
          </div>
        </div>
      </aside>

      {/* Mobile trigger */}
      <div className="bg-background/80 sticky top-12 z-10 flex items-center gap-2 border-b py-2 backdrop-blur lg:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Menu className="size-4" />
              Mục lục
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] p-0">
            <SheetTitle className="sr-only">Điều hướng hướng dẫn</SheetTitle>
            <div className="border-b p-3">
              <DocsSearch />
            </div>
            <div className="overflow-y-auto p-3" onClick={() => setSheetOpen(false)}>
              <DocsSidebar onNavigate={() => setSheetOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex-1">
          <DocsSearch />
        </div>
      </div>
    </>
  );
}
