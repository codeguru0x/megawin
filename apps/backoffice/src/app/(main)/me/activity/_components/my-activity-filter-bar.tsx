"use client";

import { RotateCcw } from "lucide-react";
import {
  AuditActionLabel,
  AuditStatus,
  AuditStatusLabel,
  SELF_ACTIVITY_ACTIONS,
} from "@megawin/audit/entities";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FinancialDateRangePicker } from "@/components/date-picker";

import { useMyActivityFilters } from "../_lib/use-filters";

/** Action self-visible — cố định, dùng cho dropdown "Hành động". */
const ACTION_OPTIONS = SELF_ACTIVITY_ACTIONS;

/**
 * Filter bar cho "Nhật ký của tôi" — nhật ký bảo mật cá nhân.
 *
 * CHỈ 3 chiều lọc có ý nghĩa: khoảng thời gian, loại hành động (đăng nhập/đăng
 * xuất, đổi mật khẩu, MFA), kết quả. BỎ actor/game/category/đối-tượng vì view
 * self-scoped và chỉ gồm nhóm action security.
 */
export function MyActivityFilterBar() {
  const { from, to, action, status, setRange, setAction, setStatus, resetFilters } =
    useMyActivityFilters();

  const hasActiveFilters = !!action || !!status;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FinancialDateRangePicker
        label=""
        from={from}
        to={to}
        onChange={(f, t) => setRange(f, t)}
        className="shrink-0 flex-nowrap gap-0!"
      />

      <Select value={action || "all"} onValueChange={(v) => setAction(v === "all" ? "" : v)}>
        <SelectTrigger size="sm" className="h-8 w-[220px] text-xs">
          <SelectValue placeholder="Hành động" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Mọi hành động</SelectItem>
          {ACTION_OPTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              {AuditActionLabel[a]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status ?? "all"}
        onValueChange={(v) => setStatus(v === "all" ? null : (v as AuditStatus))}
      >
        <SelectTrigger size="sm" className="h-8 w-[120px] text-xs">
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
          onClick={resetFilters}
          title="Xoá tất cả bộ lọc"
        >
          <RotateCcw className="size-3.5" />
          Đặt lại
        </Button>
      )}
    </div>
  );
}
