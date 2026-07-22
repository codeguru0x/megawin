"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Search, Target } from "lucide-react";
import {
  AUDIT_ACTIONS,
  AuditActionLabel,
  AuditActorType,
  AuditActorTypeLabel,
  AuditCategory,
  AuditCategoryLabel,
  AuditStatus,
  AuditStatusLabel,
  AuditTargetType,
  AuditTargetTypeLabel,
} from "@megawin/audit/entities";
import type { AuditAction } from "@megawin/audit/entities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FinancialDateRangePicker } from "@/components/date-picker";
import { GAME_PRODUCT_OPTIONS } from "@/lib/game-labels";

import { useAuditLogFilters } from "../_lib/use-filters";

/**
 * Map từng action → category (prefix trước dấu `.`) để filter action-list theo
 * category đang chọn. Build 1 lần ở module scope — action registry tĩnh.
 */
const ACTION_TO_CATEGORY = new Map<AuditAction, AuditCategory>(
  Object.values(AUDIT_ACTIONS).flatMap((group) =>
    Object.values(group).map((action) => [action, action.split(".")[0] as AuditCategory] as const),
  ),
);

const ALL_ACTIONS = Object.keys(AuditActionLabel) as AuditAction[];

export function AuditLogsFilterBar() {
  const {
    from,
    to,
    actor,
    actorType,
    game,
    category,
    action,
    targetType,
    targetId,
    status,
    setRange,
    setActor,
    setActorType,
    setGame,
    setCategory,
    setAction,
    setTargetType,
    setTargetId,
    setStatus,
    resetFilters,
  } = useAuditLogFilters();

  // Local input state cho text field — chỉ commit vào URL khi submit/blur.
  const [actorInput, setActorInput] = useState(actor);
  const [targetInput, setTargetInput] = useState(targetId);

  useEffect(() => {
    setActorInput(actor);
  }, [actor]);
  useEffect(() => {
    setTargetInput(targetId);
  }, [targetId]);

  // Action options phụ thuộc category: chọn category → chỉ show action nhóm đó.
  const actionOptions = useMemo(() => {
    if (!category) return ALL_ACTIONS;
    return ALL_ACTIONS.filter((a) => ACTION_TO_CATEGORY.get(a) === category);
  }, [category]);

  const hasActiveFilters =
    !!actor ||
    !!actorType ||
    !!game ||
    !!category ||
    !!action ||
    !!targetType ||
    !!targetId ||
    !!status;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FinancialDateRangePicker
        label=""
        from={from}
        to={to}
        onChange={(f, t) => setRange(f, t)}
        className="shrink-0 flex-nowrap gap-0!"
      />

      {/* Ô search actor — khớp accountId chính xác HOẶC username (chứa). */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={actorInput}
          onChange={(e) => setActorInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setActor(actorInput);
            if (e.key === "Escape") {
              setActorInput("");
              setActor("");
            }
          }}
          onBlur={() => setActor(actorInput)}
          placeholder="Người thực hiện (tên / ID)"
          className="h-8 w-50 pl-8 text-xs"
        />
      </div>

      {/* Ô search đối tượng theo ID (drawId, accountId…). */}
      <div className="relative">
        <Target className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={targetInput}
          onChange={(e) => setTargetInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setTargetId(targetInput);
            if (e.key === "Escape") {
              setTargetInput("");
              setTargetId("");
            }
          }}
          onBlur={() => setTargetId(targetInput)}
          placeholder="Đối tượng ID"
          className="h-8 w-[170px] pl-8 font-mono text-xs"
        />
      </div>

      <Select
        value={actorType ?? "all"}
        onValueChange={(v) => setActorType(v === "all" ? null : (v as AuditActorType))}
      >
        <SelectTrigger size="sm" className="h-8 w-[130px] text-xs">
          <SelectValue placeholder="Loại actor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Mọi loại actor</SelectItem>
          {Object.values(AuditActorType).map((t) => (
            <SelectItem key={t} value={t}>
              {AuditActorTypeLabel[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={game || "all"} onValueChange={(v) => setGame(v === "all" ? "" : v)}>
        <SelectTrigger size="sm" className="h-8 w-30 text-xs">
          <SelectValue placeholder="Game" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Mọi game</SelectItem>
          {GAME_PRODUCT_OPTIONS.map((g) => (
            <SelectItem key={g.value} value={g.value}>
              {g.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={category ?? "all"}
        onValueChange={(v) => setCategory(v === "all" ? null : (v as AuditCategory))}
      >
        <SelectTrigger size="sm" className="h-8 w-30 text-xs">
          <SelectValue placeholder="Nhóm" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Mọi nhóm</SelectItem>
          {Object.values(AuditCategory).map((c) => (
            <SelectItem key={c} value={c}>
              {AuditCategoryLabel[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={action || "all"} onValueChange={(v) => setAction(v === "all" ? "" : v)}>
        <SelectTrigger size="sm" className="h-8 w-[190px] text-xs">
          <SelectValue placeholder="Hành động" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Mọi hành động</SelectItem>
          {actionOptions.map((a) => (
            <SelectItem key={a} value={a}>
              {AuditActionLabel[a]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={targetType ?? "all"}
        onValueChange={(v) => setTargetType(v === "all" ? null : (v as AuditTargetType))}
      >
        <SelectTrigger size="sm" className="h-8 w-35 text-xs">
          <SelectValue placeholder="Loại đối tượng" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Mọi đối tượng</SelectItem>
          {Object.values(AuditTargetType).map((t) => (
            <SelectItem key={t} value={t}>
              {AuditTargetTypeLabel[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status ?? "all"}
        onValueChange={(v) => setStatus(v === "all" ? null : (v as AuditStatus))}
      >
        <SelectTrigger size="sm" className="h-8 w-30 text-xs">
          <SelectValue placeholder="Kết quả" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Mọi kết quả</SelectItem>
          {Object.values(AuditStatus).map((s) => (
            <SelectItem key={s} value={s}>
              {AuditStatusLabel[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => {
            setActorInput("");
            setTargetInput("");
            resetFilters();
          }}
          title="Xoá tất cả bộ lọc"
        >
          <RotateCcw className="size-3.5" />
          Đặt lại
        </Button>
      )}
    </div>
  );
}
