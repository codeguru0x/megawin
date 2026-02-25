"use client";
"use no memo";

import type { Table } from "@tanstack/react-table";
import { CheckIcon, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const toggleableColumns = table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== "undefined" && column.getCanHide(),
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto hidden h-8 lg:flex"
        >
          <Settings2 />
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[150px]">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {toggleableColumns.map((column) => {
          const isVisible = column.getIsVisible();
          return (
            <button
              key={column.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={isVisible}
              className={cn(
                "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pr-2 pl-8 text-sm capitalize outline-none",
                "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
              )}
              onClick={() => {
                table.setColumnVisibility((prev) => ({
                  ...prev,
                  [column.id]: !isVisible,
                }));
              }}
            >
              <span className="absolute left-2 flex size-3.5 items-center justify-center">
                {isVisible && <CheckIcon className="size-4" />}
              </span>
              {column.id}
            </button>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
