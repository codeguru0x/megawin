"use client";

import { useEffect, useState } from "react";

import { TxLogEventType, TxLogStatus } from "@megawin/tenant-gateway/entities";
import { TX_LOG_EVENT_TYPE_LABELS, TX_LOG_STATUS_LABELS } from "@megawin/tenant-gateway/shared/labels";
import { Search, X } from "lucide-react";

import { FinancialDateRangePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { useTxLogFilters } from "../_lib/use-filters";

/**
 * Filter bar cho danh sách tx logs.
 *
 * - Left: tìm theo `tx` (UUID) — enter để search, clear để xoá.
 * - Right: date range + status + eventType.
 * - Khi có `tx` → right cluster bị disable để tránh confusion.
 */
export function TxLogFilterBar() {
  const { tx, from, to, status, eventType, isTxMode, setTx, setRange, setStatus, setEventType } = useTxLogFilters();

  // Local input state — chỉ commit vào URL khi user submit để tránh
  // refetch mỗi ký tự.
  const [txInput, setTxInput] = useState(tx);

  useEffect(() => {
    setTxInput(tx);
  }, [tx]);

  function handleSubmitTx() {
    setTx(txInput);
  }

  function handleClearTx() {
    setTxInput("");
    setTx("");
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
      {/* Left cluster — chiếm cột 1 (bằng 1 KPI card) */}
      <div className="flex items-center gap-1.5 lg:col-start-1">
        <Input
          value={txInput}
          onChange={(e) => setTxInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmitTx();
            }
            if (e.key === "Escape") {
              handleClearTx();
            }
          }}
          placeholder="Tìm theo Tx ID …"
          className="h-8 min-w-0 flex-1 font-mono text-xs"
        />
        {isTxMode ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2 text-xs"
            onClick={handleClearTx}
            title="Xoá tìm theo tx"
          >
            <X className="size-3.5" />
            Xoá
          </Button>
        ) : (
          <Button size="sm" className="h-8 shrink-0 px-3 text-xs" onClick={handleSubmitTx} disabled={!txInput.trim()}>
            <Search className="size-3.5" />
            Tìm
          </Button>
        )}
      </div>

      <div className={cn("flex items-center justify-end gap-2 lg:col-span-2 lg:col-start-3")}>
        <FinancialDateRangePicker
          label=""
          from={from}
          to={to}
          onChange={(f, t) => setRange(f, t)}
          className="shrink-0 flex-nowrap gap-0!"
        />

        <Select
          value={status ?? "all"}
          onValueChange={(v) => setStatus(v === "all" ? null : (v as TxLogStatus))}
          disabled={isTxMode}
        >
          <SelectTrigger size="sm" className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {Object.values(TxLogStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {TX_LOG_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={eventType ?? "all"}
          onValueChange={(v) => setEventType(v === "all" ? null : (v as TxLogEventType))}
          disabled={isTxMode}
        >
          <SelectTrigger size="sm" className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="Loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            {Object.values(TxLogEventType).map((t) => (
              <SelectItem key={t} value={t}>
                {TX_LOG_EVENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
