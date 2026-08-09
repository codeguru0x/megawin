"use client";

import { useMemo, useState } from "react";

import { Check, ChevronsUpDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TenantComboboxOption {
  /** Tenant ID (stored/URL value). */
  value: string;
  /** Hiển thị phụ — số orders trong range (không bắt buộc). */
  count?: number;
}

export interface TenantComboboxProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: TenantComboboxOption[];
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Cho phép user gõ ID không có trong options (power user). */
  allowFreeType?: boolean;
  className?: string;
  /** Id gắn cho trigger button — dùng để liên kết với `<label htmlFor>` bên ngoài. */
  id?: string;
}

/**
 * Combobox chọn tenant từ danh sách facet (distinct tenantIds theo range).
 *
 * - Trigger hiển thị `value` hoặc placeholder.
 * - Popover mở `<Command>` với search-as-you-type và option count.
 * - Nếu `allowFreeType`, cho phép Enter để confirm ID tuỳ biến.
 */
export function TenantCombobox({
  value,
  onChange,
  options,
  isLoading,
  disabled,
  placeholder = "Chọn Tenant…",
  allowFreeType = true,
  className,
  id,
}: TenantComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.value.toLowerCase().includes(lower));
  }, [options, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between gap-1 font-mono text-xs font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <div className="flex items-center gap-1">
            {value && !disabled && (
              <X
                className="size-3.5 shrink-0 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            )}
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Nhập Tenant ID…"
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.key === "Enter" && allowFreeType && search.trim() && filtered.length === 0) {
                onChange(search.trim());
                setOpen(false);
                setSearch("");
              }
            }}
          />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Đang tải…</div>
            ) : (
              <>
                <CommandEmpty>
                  {allowFreeType && search.trim() ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      Nhấn <kbd className="rounded border bg-muted px-1">Enter</kbd> để dùng{" "}
                      <span className="font-mono">{search.trim()}</span>
                    </div>
                  ) : (
                    "Không tìm thấy tenant."
                  )}
                </CommandEmpty>
                {filtered.length > 0 && (
                  <CommandGroup>
                    {filtered.map((opt) => (
                      <CommandItem
                        key={opt.value}
                        value={opt.value}
                        onSelect={() => {
                          onChange(opt.value === value ? null : opt.value);
                          setOpen(false);
                          setSearch("");
                        }}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="flex items-center gap-2 truncate font-mono text-xs">
                          <Check
                            className={cn("size-3.5 shrink-0", value === opt.value ? "opacity-100" : "opacity-0")}
                          />
                          {opt.value}
                        </span>
                        {opt.count !== undefined && (
                          <span className="text-xs tabular-nums text-muted-foreground">{opt.count}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
