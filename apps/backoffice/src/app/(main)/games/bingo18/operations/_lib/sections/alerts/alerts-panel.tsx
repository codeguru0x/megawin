"use client";

/**
 * Bingo 18 Operations — Alerts Panel (tab Giám sát)
 *
 * Hiển thị cảnh báo vận hành của 1 kỳ, **gộp theo `type`** (grouped=true) — mỗi nhóm
 * 1 accordion: label + count + severity màu; expand xem raw item (payload đã format) +
 * nút Ack từng item. KHÔNG toast tự bung.
 *
 * **Hành vi Ack (UI v6 Keno 30/07 — guideline §4):** alert đã ack KHÔNG biến mất
 * (mất audit trail — ack ≠ hết rủi ro) nhưng cũng KHÔNG lẫn cùng cấp với alert cần
 * xử lý — đẩy vào disclosure "Xem N đã xử lý ▾" cuối mỗi nhóm (toggle per-group).
 * Đặc biệt quan trọng với Bingo 18: ngưỡng nhạy + 160 kỳ/ngày dễ sinh nhiều alert
 * `bucket_concentration` per-bucket.
 *
 * Fetch on-demand: `useAlerts` chỉ chạy khi panel active (tab Giám sát mở). Không
 * timer riêng, badge count đọc từ snapshot. Ack → invalidate cả panel lẫn badge.
 */

import { useState } from "react";

import Link from "next/link";

import type { Bingo18OpsAlertEntity, Bingo18TopPotential } from "@megawin/game-bingo18/entities";
import { Bingo18OpsAlertType, OpsAlertSeverity, OpsAlertStatus } from "@megawin/game-bingo18/entities";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { displayVNTimeWithSeconds, formatNumber } from "@megawin/shared/utils";
import { AlertTriangle, BellRing, Check, ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";

import { buildOutstandingHref, PlayerName } from "@/components/player-name";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { BINGO18_DIRECTION_LABELS, BINGO18_OPS_ALERT_TYPE_LABELS, describeHighBucket } from "../../ops-constants";
import { useAckAlert, useAlerts } from "../../use-operations";

// ─── Severity → màu ───────────────────────────────────────────────────────────

const SEVERITY_LABEL: Record<string, string> = {
  [OpsAlertSeverity.Info]: "Thông tin",
  [OpsAlertSeverity.Warning]: "Cảnh báo",
  [OpsAlertSeverity.Critical]: "Nghiêm trọng",
};

function severityBadgeClass(severity: string): string {
  if (severity === OpsAlertSeverity.Critical) {
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  }
  if (severity === OpsAlertSeverity.Warning) {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  }
  return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
}

/** Màu chấm + viền trái item theo severity — dấu hiệu quét mắt nhanh. */
function severityAccent(severity: string): { dot: string; border: string } {
  if (severity === OpsAlertSeverity.Critical) {
    return { dot: "bg-red-500", border: "border-l-red-500" };
  }
  if (severity === OpsAlertSeverity.Warning) {
    return { dot: "bg-amber-500", border: "border-l-amber-500" };
  }
  return { dot: "bg-sky-500", border: "border-l-sky-500" };
}

// ─── Mô tả alert dạng người-đọc (thay JSON payload thô) ───────────────────────

/** 1 chip metric nổi bật trong item — nhãn nhỏ + giá trị đậm. */
interface AlertChip {
  label: string;
  value: string;
  /** Tô đỏ khi là số rủi ro/tiền lớn cần chú ý. */
  danger?: boolean;
}

/** Kết quả mô tả 1 alert: 1 câu tóm tắt + các chip số liệu. */
interface AlertDescription {
  summary: string;
  chips: AlertChip[];
}

function toNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

/**
 * Chuyển payload alert thô → mô tả tiếng Việt dễ đọc + chip số liệu theo TỪNG loại
 * (guideline §4 — không lộ JSON/`[object Object]`). Payload shape khớp evaluator
 * `evaluateBingo18Alerts` (p0-04). Loại chưa có formatter → fallback field primitive.
 */
function describeAlert(type: string, payload: Record<string, unknown>): AlertDescription {
  switch (type) {
    case Bingo18OpsAlertType.LargeBet: {
      const count = toNum(payload.count);
      const threshold = toNum(payload.threshold);
      return {
        summary: `${formatNumber(count)} cược lớn trong kỳ (ngưỡng ≥ ${formatNumber(threshold)} VND).`,
        chips: [
          { label: "Số cược lớn", value: formatNumber(count), danger: true },
          { label: "Ngưỡng", value: `${formatNumber(threshold)} VND` },
        ],
      };
    }
    case Bingo18OpsAlertType.ExposureThreshold: {
      const worst = toNum(payload.worstCase);
      const pct = toNum(payload.pct);
      const revenue = toNum(payload.revenue);
      const numbers = Array.isArray(payload.worstNumbers) ? (payload.worstNumbers as number[]).join("-") : "";
      return {
        summary: `Worst-case chi trả ${formatNumber(worst)} VND = ${pct}% doanh thu kỳ (kết quả xấu nhất: ${numbers}, tổng ${toNum(payload.worstSum)}).`,
        chips: [
          { label: "Worst-case", value: `${formatNumber(worst)} VND`, danger: true },
          { label: "% doanh thu", value: `${pct}%`, danger: true },
          { label: "Doanh thu kỳ", value: `${formatNumber(revenue)} VND` },
          { label: "Kỳ vọng trả", value: `${formatNumber(toNum(payload.expectedPayout))} VND` },
        ],
      };
    }
    case Bingo18OpsAlertType.SidebetSkew: {
      const pct = toNum(payload.pct);
      const total = toNum(payload.total);
      const dirKey = String(payload.direction ?? "");
      const dir = BINGO18_DIRECTION_LABELS[dirKey as keyof typeof BINGO18_DIRECTION_LABELS] ?? dirKey;
      return {
        summary: `Tiền cược Lớn/Hòa/Nhỏ dồn ${pct}% về hướng ${dir} (xác suất nền Nhỏ 49% · Hòa 25% · Lớn 26%).`,
        chips: [
          { label: "Hướng dồn", value: dir },
          { label: "Tỷ lệ lệch", value: `${pct}%`, danger: pct >= 90 },
          { label: "Tổng 3 hướng", value: `${formatNumber(total)} VND` },
        ],
      };
    }
    case Bingo18OpsAlertType.BucketConcentration: {
      const amount = toNum(payload.amount);
      const sets = toNum(payload.sets);
      const bucket = describeHighBucket(String(payload.playType ?? ""), String(payload.bucketKey ?? ""));
      return {
        summary: `Tiền dồn cửa nhân cao "${bucket}" (×120): ${formatNumber(amount)} VND — trúng phải trả ${formatNumber(sets * 1_200_000)} VND (theo giải default).`,
        chips: [
          { label: "Cửa", value: bucket },
          { label: "Tiền dồn", value: `${formatNumber(amount)} VND`, danger: true },
          { label: "Số bộ", value: formatNumber(sets) },
          { label: "Ngưỡng", value: `${formatNumber(toNum(payload.threshold))} VND` },
        ],
      };
    }
    default: {
      // Fallback: liệt kê field primitive (bỏ object/array để tránh "[object Object]").
      const chips: AlertChip[] = [];
      for (const [k, v] of Object.entries(payload)) {
        if (v === null || v === undefined || typeof v === "object") continue;
        chips.push({ label: k, value: typeof v === "number" ? formatNumber(v) : String(v) });
      }
      return { summary: "", chips };
    }
  }
}

// ─── Danh sách entry/người liên quan trong alert (large_bet) ──────────────────

/** Đọc `payload.top` (mảng Bingo18TopPotential) an toàn — chỉ large_bet có. */
function readTopEntries(payload: Record<string, unknown>): Bingo18TopPotential[] {
  const top = payload.top;
  if (!Array.isArray(top)) return [];
  return top as Bingo18TopPotential[];
}

/**
 * Render danh sách entry lớn của alert `large_bet`: username (đồng nhất) + tiền cược +
 * rủi ro, mỗi dòng link → outstanding player kỳ này (staff thấy toàn bộ entry + detail).
 */
function AlertTopEntries({ drawId, payload }: { drawId: string; payload: Record<string, unknown> }) {
  const entries = readTopEntries(payload);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1 rounded-md border border-border/50 divide-y divide-border/40 overflow-hidden">
      {entries.map((e) => {
        const href = buildOutstandingHref(GameProduct.Bingo18, drawId, e.accountId, e.username);
        return (
          <div key={e.entryId} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/20">
            <div className="min-w-0 flex-1">
              <PlayerName username={e.username} accountId={e.accountId} className="text-xs" />
            </div>
            <span className="text-xs font-semibold tabular-nums text-foreground shrink-0">
              {formatNumber(e.amount)}
            </span>
            {e.potentialWin > 0 && (
              <span
                className="text-[11px] tabular-nums text-red-500/80 shrink-0"
                title="Rủi ro chi trả nếu trúng (exact trên 216 kết quả)"
              >
                ⚠ {formatNumber(e.potentialWin)}
              </span>
            )}
            {href && (
              <Link
                href={href}
                className="inline-flex items-center text-muted-foreground/60 hover:text-foreground shrink-0"
                title="Xem outstanding player ở kỳ này"
              >
                <ExternalLink className="size-3.5" />
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 1 alert item ─────────────────────────────────────────────────────────────

function AlertItemRow({ alert }: { alert: Bingo18OpsAlertEntity }) {
  const ack = useAckAlert();
  const isAcked = alert.status !== OpsAlertStatus.New;
  const accent = severityAccent(alert.severity);
  const { summary, chips } = describeAlert(alert.type, alert.payload);

  return (
    <div
      className={cn(
        "rounded-lg border border-l-2 bg-card px-3 py-2.5 transition-colors",
        accent.border,
        isAcked ? "opacity-60" : "hover:bg-muted/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          {summary && <p className="text-xs font-medium text-foreground leading-snug wrap-break-word">{summary}</p>}
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <span
                  key={c.label}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] tabular-nums",
                    c.danger ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-muted text-muted-foreground",
                  )}
                >
                  <span className="opacity-70">{c.label}</span>
                  <span className="font-semibold">{c.value}</span>
                </span>
              ))}
            </div>
          )}
          {/* Danh sách người/entry liên quan (large_bet) — minh bạch ai/cược gì/bao nhiêu. */}
          <AlertTopEntries drawId={alert.drawId} payload={alert.payload} />
          <p className="text-[11px] text-muted-foreground/70 tabular-nums">
            {displayVNTimeWithSeconds(new Date(alert.createdAt))}
          </p>
        </div>
        {isAcked ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 shrink-0">
            <ShieldCheck className="size-3.5" />
            Đã xử lý
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 shrink-0"
            onClick={() => ack.mutate(alert.id)}
            disabled={ack.isPending}
          >
            <Check className="size-3.5" />
            Ack
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── 1 nhóm alert (tách new/acked, thu gọn phần đã xử lý — UI v6) ─────────────

/** Nút thu gọn "N đã xử lý ▾" cuối 1 nhóm — bấm để mở xem lịch sử ack trong nhóm đó. */
function AckedDisclosure({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground"
    >
      <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      <ShieldCheck className="size-3.5" />
      <span>
        {open ? "Ẩn" : "Xem"} {formatNumber(count)} đã xử lý
      </span>
    </button>
  );
}

/**
 * 1 nhóm alert trong accordion. Mặc định chỉ hiện item `status=new` (cần xử lý) —
 * item đã `ack` gộp xuống {@link AckedDisclosure} cuối nhóm, KHÔNG hiện lẫn cùng cấp
 * (UI v6 — tránh panel dài khi ngưỡng nhạy sinh nhiều alert).
 */
function AlertGroupContent({ items }: { items: Bingo18OpsAlertEntity[] }) {
  const [showAcked, setShowAcked] = useState(false);
  const activeItems = items.filter((it) => it.status === OpsAlertStatus.New);
  const ackedItems = items.filter((it) => it.status !== OpsAlertStatus.New);

  return (
    <>
      {activeItems.map((item) => (
        <AlertItemRow key={item.id} alert={item} />
      ))}
      {/* Không còn alert cần xử lý nhưng nhóm vẫn có lịch sử ack — báo yên tâm. */}
      {activeItems.length === 0 && ackedItems.length > 0 && (
        <p className="px-1 py-1 text-xs text-muted-foreground">Đã xử lý hết cảnh báo mới của nhóm này.</p>
      )}
      <AckedDisclosure count={ackedItems.length} open={showAcked} onToggle={() => setShowAcked((v) => !v)} />
      {showAcked && ackedItems.map((item) => <AlertItemRow key={item.id} alert={item} />)}
    </>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

/**
 * @param drawId - Kỳ đang xem.
 * @param active - Tab Giám sát đang mở → fetch alerts (on-demand). Tab đóng = không fetch.
 */
export function AlertsPanel({ drawId, active }: { drawId: string | undefined; active: boolean }) {
  const { data, isLoading } = useAlerts(drawId, undefined, active);
  const groups = data?.groups ?? [];

  // Loading trước tick đầu — skeleton mỏng, không dựng card lớn.
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-xl" />
        ))}
      </div>
    );
  }

  // Không có cảnh báo → 1 dòng mảnh (đứng đầu tab, không chiếm chỗ vô ích).
  if (groups.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/10 px-4 py-2.5">
        <ShieldCheck className="size-4 text-emerald-500/70 shrink-0" />
        <span className="text-xs text-muted-foreground">Không có cảnh báo cho kỳ này.</span>
      </div>
    );
  }

  // Nhóm còn alert cần xử lý → mở sẵn; nhóm chỉ toàn alert đã ack → đóng (không chiếm mắt).
  const defaultOpen = groups.filter((g) => g.items.some((it) => it.status === OpsAlertStatus.New)).map((g) => g.type);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50 shrink-0">
            <BellRing className="size-3.5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Cảnh báo vận hành</CardTitle>
            <CardDescription className="text-xs mt-0.5">Gộp theo loại · Ack từng cảnh báo</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
          {groups.map((g) => {
            const activeCount = g.items.filter((it) => it.status === OpsAlertStatus.New).length;
            const accent = severityAccent(g.severity);
            const isCritical = g.severity === OpsAlertSeverity.Critical;
            return (
              <AccordionItem key={g.type} value={g.type} className="border-b last:border-b-0">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn("size-2 rounded-full shrink-0", accent.dot)} />
                    {isCritical && activeCount > 0 && <AlertTriangle className="size-3.5 text-red-500 shrink-0" />}
                    <span className="text-sm font-semibold truncate">
                      {BINGO18_OPS_ALERT_TYPE_LABELS[g.type] ?? g.type}
                    </span>
                    {/* Badge đếm CHỈ alert cần xử lý — khớp ý nghĩa với badge header,
                        KHÔNG cộng cả phần đã ack (UI v6). */}
                    <Badge variant={activeCount > 0 ? "secondary" : "outline"} className="tabular-nums shrink-0">
                      {formatNumber(activeCount)}
                    </Badge>
                    {activeCount > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0",
                          severityBadgeClass(g.severity),
                        )}
                      >
                        {SEVERITY_LABEL[g.severity] ?? g.severity}
                      </span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-1.5 pb-3">
                  <AlertGroupContent items={g.items} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

// ─── Header Badge ──────────────────────────────────────────────────────────────

/**
 * Badge cảnh báo trên header — đọc `alertCounts` từ snapshot (KHÔNG timer riêng).
 * Đỏ khi `critical > 0`, neutral khi `new > 0`, ẩn khi cả 2 = 0. Click → mở tab Giám sát.
 */
export function AlertHeaderBadge({
  counts,
  onClick,
}: {
  counts: { new: number; critical: number };
  onClick?: () => void;
}) {
  if (counts.new === 0 && counts.critical === 0) return null;

  const isCritical = counts.critical > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        isCritical
          ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300"
          : "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300",
      )}
    >
      <BellRing className="size-3.5" />
      <span className="tabular-nums">
        {isCritical ? `${formatNumber(counts.critical)} nghiêm trọng` : `${formatNumber(counts.new)} mới`}
      </span>
    </button>
  );
}
