"use client";

/**
 * Lotto 5/35 Operations — Alerts Panel (tab Giám sát)
 *
 * Hiển thị cảnh báo vận hành 1 kỳ, **gộp theo `type`** (grouped=true) — mỗi nhóm 1
 * accordion: label + count + severity màu; expand xem raw item + nút Ack. KHÔNG toast
 * tự bung (mirror Power 6/55/Keno). Mặc định chỉ hiện alert `new`, phần đã ack gộp
 * xuống 1 dòng "N đã xử lý" mỗi nhóm.
 *
 * Fetch on-demand: `useAlerts` chỉ chạy khi panel active (tab Giám sát mở) — tải MỌI
 * status trong 1 query, lọc hiển thị client. Không timer riêng, badge count đọc snapshot.
 *
 * 5 loại alert (KHÁC Power 6/55): `large_bet`, `exposure_threshold`, `combo_concentration`,
 * `cover_high_stake` (đổi từ `bao_high_stake`, đánh giá `byPlayType` nhóm mainCover6-15),
 * `special_skew` (MỚI, đặc thù Lotto 5/35 — dồn tiền vào 1 số ĐB). `describeAlert` format
 * theo payload từng loại do `evaluate-alerts.ts` sinh (KHÔNG hiện JSON thô).
 */

import { useState } from "react";

import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import type { Lotto535OpsAlertEntity, Lotto535TopPotential } from "@megawin/game-lotto535/entities";
import {
  Lotto535OpsAlertType,
  Lotto535StatsPlayKey,
  OpsAlertSeverity,
  OpsAlertStatus,
} from "@megawin/game-lotto535/entities";
import { displayVNTimeWithSeconds, formatNumber } from "@megawin/shared/utils";
import { AlertTriangle, BellRing, Check, ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { buildOutstandingHref, PlayerName } from "@/components/player-name";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { describeStatsPlayKey, LOTTO535_OPS_ALERT_TYPE_LABELS } from "../../ops-constants";
import { useAckAlert, useAlerts } from "../../use-operations";
import { NumberBadge } from "../analytics/number-heatmap";

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

/** 1 key `mainCoverN` chạm ngưỡng trong payload `cover_high_stake`. */
interface CoverTriggered {
  key: string;
  boardPrice: number;
  boards: number;
}

/** Đọc `payload.triggered` (mảng CoverTriggered) an toàn — chỉ cover_high_stake có. */
function readCoverTriggered(payload: Record<string, unknown>): CoverTriggered[] {
  const t = payload.triggered;
  if (!Array.isArray(t)) return [];
  return t as CoverTriggered[];
}

/**
 * Chuyển payload alert thô → mô tả tiếng Việt dễ đọc + chip số liệu theo TỪNG loại.
 *
 * Format theo type để staff đọc hiểu ngay (KHÔNG lộ JSON / "[object Object]" với payload
 * nested như `large_bet.top`, `cover_high_stake.triggered`, `combo_concentration.mainNumbers`).
 * Loại chưa có formatter riêng → fallback liệt kê field primitive (bỏ object/array).
 */
function describeAlert(type: string, payload: Record<string, unknown>): AlertDescription {
  switch (type) {
    case Lotto535OpsAlertType.LargeBet: {
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
    case Lotto535OpsAlertType.ExposureThreshold: {
      const worst = toNum(payload.fixedWorstCase);
      const threshold = toNum(payload.threshold);
      return {
        summary: `Rủi ro chi trả giải cố định chạm ${formatNumber(worst)} VND (ngưỡng cảnh báo ${formatNumber(threshold)} VND).`,
        chips: [
          { label: "Worst-case", value: `${formatNumber(worst)} VND`, danger: true },
          { label: "Ngưỡng", value: `${formatNumber(threshold)} VND` },
        ],
      };
    }
    case Lotto535OpsAlertType.ComboConcentration: {
      const players = toNum(payload.players);
      const sets = toNum(payload.sets);
      const amount = toNum(payload.amount);
      return {
        summary: `${formatNumber(players)} người chơi cùng dồn 1 bộ số — dấu hiệu syndicate.`,
        chips: [
          { label: "Người chơi", value: formatNumber(players), danger: true },
          { label: "Số bộ", value: formatNumber(sets) },
          { label: "Tổng tiền", value: `${formatNumber(amount)} VND` },
        ],
      };
    }
    case Lotto535OpsAlertType.CoverHighStake: {
      const triggered = readCoverTriggered(payload);
      const threshold = toNum(payload.threshold);
      const names = triggered.map((t) => describeStatsPlayKey(t.key as Lotto535StatsPlayKey)).join(", ");
      return {
        summary: `Có vé Bao mức cao (${names}) — giá 1 board ≥ ${formatNumber(threshold)} VND.`,
        chips: triggered.map((t) => ({
          label: describeStatsPlayKey(t.key as Lotto535StatsPlayKey),
          value: `${formatNumber(t.boards)} board · ${formatNumber(t.boardPrice)} VND`,
          danger: t.key === "mainCover15",
        })),
      };
    }
    case Lotto535OpsAlertType.SpecialSkew: {
      const number = String(payload.number ?? "");
      const amount = toNum(payload.amount);
      const totalAmount = toNum(payload.totalAmount);
      const ratio = toNum(payload.ratio);
      return {
        summary: `Số đặc biệt ${number} bị dồn ${(ratio * 100).toFixed(1)}% tổng tiền cược ĐB kỳ này.`,
        chips: [
          { label: "Tỷ trọng", value: `${(ratio * 100).toFixed(1)}%`, danger: true },
          { label: "Tiền dồn vào số", value: `${formatNumber(amount)} VND` },
          { label: "Tổng tiền ĐB", value: `${formatNumber(totalAmount)} VND` },
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

/** Đọc `payload.top` (mảng Lotto535TopPotential) an toàn — chỉ large_bet có. */
function readTopEntries(payload: Record<string, unknown>): Lotto535TopPotential[] {
  const top = payload.top;
  if (!Array.isArray(top)) return [];
  return top as Lotto535TopPotential[];
}

/**
 * Render danh sách entry lớn của alert `large_bet`: username + tiền cược + rủi ro
 * (fixedPotential), mỗi dòng link → outstanding player kỳ này. Alert không có `top` →
 * không render gì.
 */
function AlertTopEntries({ drawId, payload }: { drawId: string; payload: Record<string, unknown> }) {
  const entries = readTopEntries(payload);
  if (entries.length === 0) return null;

  return (
    <div className="mt-1 rounded-md border border-border/50 divide-y divide-border/40 overflow-hidden">
      {entries.map((e) => {
        const href = buildOutstandingHref(GameProduct.Lotto535, drawId, e.accountId, e.username);
        return (
          <div key={e.entryId} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/20">
            <div className="min-w-0 flex-1">
              <PlayerName username={e.username} accountId={e.accountId} className="text-xs" />
            </div>
            <span className="text-xs font-semibold tabular-nums text-foreground shrink-0">
              {formatNumber(e.amount)}
            </span>
            {e.fixedPotential > 0 && (
              <span
                className="text-[11px] tabular-nums text-red-500/80 shrink-0"
                title="Rủi ro chi trả giải cố định nếu trúng tối đa"
              >
                ⚠ {formatNumber(e.fixedPotential)}
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

/** Render số chính + số ĐB liên quan alert `combo_concentration` — 2 chiều số Lotto 5/35. */
function AlertComboNumbers({ payload }: { payload: Record<string, unknown> }) {
  const mainNumbers = Array.isArray(payload.mainNumbers) ? (payload.mainNumbers as string[]) : [];
  const specialNumbers = Array.isArray(payload.specialNumbers) ? (payload.specialNumbers as string[]) : [];
  if (mainNumbers.length === 0 && specialNumbers.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {mainNumbers.map((n) => (
        <NumberBadge key={`m-${n}`} num={n} variant="soft" ballVariant="main" />
      ))}
      {specialNumbers.map((n) => (
        <NumberBadge key={`s-${n}`} num={n} variant="soft" ballVariant="special" />
      ))}
    </div>
  );
}

// ─── 1 alert item ─────────────────────────────────────────────────────────────

function AlertItemRow({ alert }: { alert: Lotto535OpsAlertEntity }) {
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
          {/* Bộ số liên quan (combo_concentration) — main + special. */}
          <AlertComboNumbers payload={alert.payload} />
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

// ─── 1 nhóm alert (tách new/acked, thu gọn phần đã xử lý) ─────────────────────

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
 * (mirror Power 6/55/Keno — tránh panel dài khi ngưỡng quá nhạy sinh nhiều alert).
 */
function AlertGroupContent({ items }: { items: Lotto535OpsAlertEntity[] }) {
  const [showAcked, setShowAcked] = useState(false);
  const activeItems = items.filter((it) => it.status === OpsAlertStatus.New);
  const ackedItems = items.filter((it) => it.status !== OpsAlertStatus.New);

  return (
    <>
      {activeItems.map((item) => (
        <AlertItemRow key={item.id} alert={item} />
      ))}
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

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-xl" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed bg-muted/10 px-4 py-2.5">
        <ShieldCheck className="size-4 text-emerald-500/70 shrink-0" />
        <span className="text-xs text-muted-foreground">Không có cảnh báo cho kỳ này.</span>
      </div>
    );
  }

  // Nhóm còn alert cần xử lý → mở sẵn; nhóm chỉ toàn alert đã ack → đóng.
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
                      {LOTTO535_OPS_ALERT_TYPE_LABELS[g.type] ?? g.type}
                    </span>
                    {/* Badge đếm CHỈ alert cần xử lý — khớp badge header (mới/critical). */}
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
 * Badge cảnh báo trên header — đọc `alertCounts` (Record theo status) từ snapshot (KHÔNG
 * timer riêng). Hiện số alert `new` (chưa ack) dạng amber; ẩn khi `new === 0`. Click → mở
 * tab Giám sát. Snapshot Lotto 5/35 KHÔNG mang severity → không phân biệt "critical" như
 * Keno, chỉ đếm alert chưa xử lý.
 */
export function AlertHeaderBadge({
  counts,
  onClick,
}: {
  counts: Record<OpsAlertStatus, number>;
  onClick?: () => void;
}) {
  const newCount = counts[OpsAlertStatus.New] ?? 0;
  if (newCount === 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300",
      )}
    >
      <BellRing className="size-3.5" />
      <span className="tabular-nums">{formatNumber(newCount)} cảnh báo mới</span>
    </button>
  );
}
