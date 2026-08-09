"use client";

/**
 * Power 6/55 — Config tab "Vận hành"
 *
 * Ngưỡng cảnh báo rủi ro + bật/tắt 4 alert P0 + nhịp worker & top-K. Mirror
 * `keno/config/game/_lib/ops-section.tsx` nhưng KHÁC:
 * - Ngưỡng exposure là VND TUYỆT ĐỐI (`fixedExposureWarnAmount`), KHÔNG phải % (Power 6/55
 *   không có `maxPerDraw` để tính phần trăm — analysis §3.10).
 * - KHÔNG có `sidebet_skew`/`cap_sets_near`; THÊM `bao_high_stake` (ngưỡng giá board Bao cao).
 * - Chỉ 4 alert P0 có toggle; `revenue_anomaly`/`settle_stuck` để dành (không hiện).
 *
 * Range PHẢI khớp Zod server (`api/power655/config/_lib/schema.ts` §ops).
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { OpsAlertSeverity, Power655OpsAlertType } from "@megawin/game-power655/entities";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { BellOff, Coins, HelpCircle, Layers, type LucideIcon, Save, ShieldAlert, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { GameConfig } from "./use-game-config";

type AlertSeverity = (typeof OpsAlertSeverity)[keyof typeof OpsAlertSeverity];

/** Style token severity — icon + accent của từng hàng alert. */
const SEVERITY_STYLES: Record<AlertSeverity, { badge: string; icon: string; ring: string; label: string }> = {
  [OpsAlertSeverity.Critical]: {
    badge: "bg-red-50 dark:bg-red-950/40",
    icon: "text-red-600 dark:text-red-400",
    ring: "ring-red-200/70 dark:ring-red-800/50",
    label: "Nghiêm trọng",
  },
  [OpsAlertSeverity.Warning]: {
    badge: "bg-amber-50 dark:bg-amber-950/40",
    icon: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-200/70 dark:ring-amber-800/50",
    label: "Cảnh báo",
  },
  [OpsAlertSeverity.Info]: {
    badge: "bg-sky-50 dark:bg-sky-950/40",
    icon: "text-sky-600 dark:text-sky-400",
    ring: "ring-sky-200/70 dark:ring-sky-800/50",
    label: "Thông tin",
  },
};

/** Metadata mô tả từng alert bật/tắt ở P0 — icon, severity, mô tả, tooltip. */
interface AlertMeta {
  type: Power655OpsAlertType;
  label: string;
  icon: LucideIcon;
  severity: AlertSeverity;
  /** Mô tả 1 dòng inline dưới tên alert. */
  summary: string;
  /** Giải thích đầy đủ (tooltip) — ý nghĩa · điều kiện bắn · ngưỡng · tác động khi tắt. */
  tip: string;
}

/**
 * 4 alert P0 (bỏ `RevenueAnomaly`/`SettleStuck` để dành). Thứ tự = mức nghiêm trọng
 * giảm dần để người vận hành quét từ trên xuống. Điều kiện bật lấy từ JSDoc §3.7
 * (ops-alert.ts).
 */
const ALERT_META: AlertMeta[] = [
  {
    type: Power655OpsAlertType.ExposureThreshold,
    label: "Rủi ro chi trả giải cố định",
    icon: ShieldAlert,
    severity: OpsAlertSeverity.Critical,
    summary: "Worst-case giải cố định chạm ngưỡng 'Exposure cảnh báo' (VND).",
    tip: "Ý nghĩa: khi tổng worst-case payout giải cố định của kỳ (fixedWorstCase) ≥ ngưỡng → bắn alert. · Ngưỡng liên quan: 'Exposure cảnh báo (VND)' ở trên. · Nâng Critical khi ≥ 2× ngưỡng. · Tác động khi TẮT: không còn cảnh báo rủi ro trả thưởng giải cố định.",
  },
  {
    type: Power655OpsAlertType.BaoHighStake,
    label: "Vé Bao mức cao",
    icon: Layers,
    severity: OpsAlertSeverity.Warning,
    summary: "Board Bao 13–18 có giá ≥ ngưỡng 'Giá board Bao cao' (VND).",
    tip: "Ý nghĩa: playType nhóm bao13..bao18 có board với giá chuẩn (BAO_COMBINATIONS × unitPrice) ≥ ngưỡng → bắn alert (rủi ro tập trung tiền lớn 1 vé). · Ngưỡng liên quan: 'Giá board Bao cao (VND)' ở trên. · Nâng Critical khi playType = Bao 18. · Tác động khi TẮT: không nổi bật vé Bao cao rủi ro cao.",
  },
  {
    type: Power655OpsAlertType.LargeBet,
    label: "Cược lớn",
    icon: Coins,
    severity: OpsAlertSeverity.Warning,
    summary: "Entry có tổng tiền ≥ ngưỡng 'Ngưỡng cược lớn' (VND).",
    tip: "Ý nghĩa: entry có tổng tiền cược ≥ 'Ngưỡng cược lớn' → đánh dấu và bắn alert large_bet. · Ngưỡng liên quan: 'Ngưỡng cược lớn (VND)' ở trên. · Nâng Critical khi ≥ 10 cược lớn trong kỳ. · Tác động khi TẮT: mất tín hiệu sớm về dòng tiền bất thường.",
  },
  {
    type: Power655OpsAlertType.ComboConcentration,
    label: "Dồn bộ số",
    icon: Users,
    severity: OpsAlertSeverity.Warning,
    summary: "Nhiều account cùng cược 1 bộ số (nghi syndicate).",
    tip: "Ý nghĩa: số account distinct cùng cược 1 bộ số ≥ ngưỡng → bắn alert combo_concentration (nghi mua chung/syndicate). · Ngưỡng liên quan: 'Số người dồn 1 bộ số' ở trên. · Nâng Critical khi ≥ 2× ngưỡng. · Tác động khi TẮT: không phát hiện hành vi gom bộ số phối hợp.",
  },
];

// Range PHẢI khớp Zod server (`api/power655/config/_lib/schema.ts` §ops).
const opsFormSchema = z.object({
  largeBetAmount: z.coerce.number().int().positive("Phải > 0"),
  fixedExposureWarnAmount: z.coerce.number().int().positive("Phải > 0"),
  comboAccountsWarn: z.coerce.number().int().min(2, "≥ 2"),
  baoHighStakeAmount: z.coerce.number().int().positive("Phải > 0"),
  tickSeconds: z.coerce.number().int().min(5, "5–60").max(60, "5–60"),
  topCombosK: z.coerce.number().int().min(20, "20–200").max(200, "20–200"),
  topPotentialK: z.coerce.number().int().min(20, "20–100").max(100, "20–100"),
  topAccountsK: z.coerce.number().int().min(20, "20–100").max(100, "20–100"),
  enabled: z.record(z.string(), z.boolean()),
});

type OpsFormValues = z.infer<typeof opsFormSchema>;

interface OpsSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

function LabelWithTooltip({ label, tip, className }: { label: string; tip: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="size-3.5 cursor-help text-muted-foreground/60" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-80 text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

/** Ô nhập số nguyên (MoneyInput) với label + tooltip 4 phần. */
function IntField({
  form,
  name,
  label,
  tip,
  suffix,
}: {
  form: ReturnType<typeof useForm<OpsFormValues>>;
  name: keyof OpsFormValues;
  label: string;
  tip: string;
  suffix?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs text-muted-foreground">
            <LabelWithTooltip label={label} tip={tip} />
          </FormLabel>
          <FormControl>
            <div className="relative">
              <MoneyInput
                className="font-semibold"
                value={field.value as number}
                onValueChange={(v) => field.onChange(v ?? 0)}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
              {suffix ? (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                  {suffix}
                </span>
              ) : null}
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** 1 hàng bật/tắt alert — icon severity, tên + tooltip, mô tả, switch. */
function AlertToggleRow({
  meta,
  checked,
  onToggle,
}: {
  meta: AlertMeta;
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  const style = SEVERITY_STYLES[meta.severity];
  const Icon = meta.icon;
  const rowId = `alert-toggle-${meta.type}`;

  return (
    <label
      htmlFor={rowId}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer",
        checked ? "border-border/60 bg-card" : "border-dashed border-border/50 bg-muted/30",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ring-1 transition-opacity",
          style.badge,
          style.ring,
          checked ? "opacity-100" : "opacity-40",
        )}
      >
        <Icon className={cn("size-4", style.icon)} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-sm font-medium transition-colors",
              checked ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {meta.label}
          </span>
          <span className={cn("rounded px-1.5 py-px text-[10px] font-medium leading-tight", style.badge, style.icon)}>
            {style.label}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="size-3.5 cursor-help text-muted-foreground/60" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-80 text-xs">
              {meta.tip}
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{meta.summary}</p>
      </div>

      <Switch id={rowId} className="mt-1.5" checked={checked} onCheckedChange={onToggle} />
    </label>
  );
}

export function OpsSection({ config, onSave, isPending }: OpsSectionProps) {
  const { alerts, stats } = config.ops;

  const form = useForm<OpsFormValues>({
    resolver: zodResolver(opsFormSchema) as never,
    values: {
      largeBetAmount: alerts.largeBetAmount,
      fixedExposureWarnAmount: alerts.fixedExposureWarnAmount,
      comboAccountsWarn: alerts.comboAccountsWarn,
      baoHighStakeAmount: alerts.baoHighStakeAmount,
      tickSeconds: stats.tickSeconds,
      topCombosK: stats.topCombosK,
      topPotentialK: stats.topPotentialK,
      topAccountsK: stats.topAccountsK,
      enabled: { ...alerts.enabled },
    },
  });

  function handleSubmit(values: OpsFormValues) {
    onSave({
      ops: {
        alerts: {
          largeBetAmount: values.largeBetAmount,
          fixedExposureWarnAmount: values.fixedExposureWarnAmount,
          comboAccountsWarn: values.comboAccountsWarn,
          baoHighStakeAmount: values.baoHighStakeAmount,
          enabled: values.enabled,
        },
        stats: {
          tickSeconds: values.tickSeconds,
          topCombosK: values.topCombosK,
          topPotentialK: values.topPotentialK,
          topAccountsK: values.topAccountsK,
        },
      },
    });
  }

  const enabled = form.watch("enabled");
  const enabledCount = ALERT_META.reduce((count, meta) => count + (enabled?.[meta.type] ? 1 : 0), 0);

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-2">
              {/* Cột trái — Ngưỡng cảnh báo */}
              <div className="space-y-5 p-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Ngưỡng cảnh báo rủi ro</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Worker so ngưỡng này mỗi chu kỳ để sinh alert. Đổi có hiệu lực trong ~1 chu kỳ worker (không cần
                    deploy).
                  </p>
                </div>

                <IntField
                  form={form}
                  name="largeBetAmount"
                  label="Ngưỡng cược lớn"
                  suffix="VND"
                  tip="Ý nghĩa: entry có tổng tiền ≥ giá trị này bị đánh dấu 'cược lớn' và tính vào alert large_bet. · Hợp lệ: số nguyên > 0. · Mặc định: 30.000.000 (cao hơn Keno vì vé Bao phổ biến lớn). · Tác động: hạ ngưỡng → nhiều entry bị coi là lớn hơn; hiệu lực trong ~1 chu kỳ worker."
                />

                <IntField
                  form={form}
                  name="fixedExposureWarnAmount"
                  label="Exposure cảnh báo"
                  suffix="VND"
                  tip="Ý nghĩa: khi tổng worst-case payout giải cố định (fixedWorstCase) ≥ giá trị này → alert exposure_threshold. VND TUYỆT ĐỐI (không phải %) vì Power 6/55 không có maxPerDraw. · Hợp lệ: số nguyên > 0. · Mặc định: 2.000.000.000. · Tác động: giảm → cảnh báo sớm hơn khi rủi ro trả thưởng tăng."
                />

                <IntField
                  form={form}
                  name="baoHighStakeAmount"
                  label="Giá board Bao cao"
                  suffix="VND"
                  tip="Ý nghĩa: playType nhóm bao13..bao18 có board với giá chuẩn (BAO_COMBINATIONS × unitPrice) ≥ giá trị này → alert bao_high_stake. · Hợp lệ: số nguyên > 0. · Mặc định: 30.000.000 (board bao13 = 17,16tr chưa chạm; bao14 = 30,03tr đã chạm). · Tác động: giảm → nhạy hơn với vé Bao mức cao."
                />

                <IntField
                  form={form}
                  name="comboAccountsWarn"
                  label="Số người dồn 1 bộ số"
                  suffix="người"
                  tip="Ý nghĩa: số account distinct cùng cược 1 bộ số ≥ giá trị này → alert combo_concentration (nghi syndicate). · Hợp lệ: số nguyên ≥ 2. · Mặc định: 5. · Tác động: giảm → nhạy hơn với hành vi mua chung."
                />

                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Bật / tắt loại alert
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="size-3.5 cursor-help text-muted-foreground/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-80 text-xs">
                          Chọn loại rủi ro worker sẽ giám sát và sinh alert mỗi chu kỳ. Tắt một loại nghĩa là ngưng theo
                          dõi rủi ro đó — dùng khi muốn giảm nhiễu, KHÔNG nên tắt loại 'Nghiêm trọng' trừ khi có lý do
                          rõ ràng.
                        </TooltipContent>
                      </Tooltip>
                    </p>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {enabledCount}/{ALERT_META.length} đang bật
                    </span>
                  </div>

                  {enabledCount === 0 ? (
                    <div className="flex items-center gap-2 rounded-md border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-400">
                      <BellOff className="size-4 shrink-0" />
                      Tất cả alert đang tắt — worker sẽ không sinh cảnh báo rủi ro nào.
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {ALERT_META.map((meta) => (
                      <AlertToggleRow
                        key={meta.type}
                        meta={meta}
                        checked={enabled?.[meta.type] ?? false}
                        onToggle={(v) =>
                          form.setValue("enabled", { ...enabled, [meta.type]: v }, { shouldDirty: true })
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Cột phải — Nhịp & Top-K */}
              <div className="border-t p-6 lg:border-l lg:border-t-0 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Nhịp worker & Top-K</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Điều chỉnh tần suất cập nhật stats và số bản ghi top lưu mỗi kỳ. Ảnh hưởng chi phí worker và độ
                    'tươi' của dashboard.
                  </p>
                </div>

                <IntField
                  form={form}
                  name="tickSeconds"
                  label="Nhịp cập nhật"
                  suffix="giây"
                  tip="Ý nghĩa: worker cập nhật stats mỗi bao nhiêu giây (loop trong 1 invocation). Dashboard cũng poll theo nhịp này. · Hợp lệ: số nguyên 5–60. · Mặc định: 10. · Tác động: giảm → dữ liệu tươi hơn nhưng tốn tài nguyên worker hơn."
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <IntField
                    form={form}
                    name="topCombosK"
                    label="Top combo"
                    tip="Ý nghĩa: số combo phổ biến nhất derive khi đọc snapshot mỗi kỳ. · Hợp lệ: số nguyên 20–200. · Mặc định: 100. · Tác động: tăng → giữ nhiều combo hơn cho drill-down."
                  />
                  <IntField
                    form={form}
                    name="topPotentialK"
                    label="Top tiềm năng"
                    tip="Ý nghĩa: số entry có potential payout giải cố định cao nhất lưu mỗi kỳ (bảng theo dõi rủi ro). · Hợp lệ: số nguyên 20–100. · Mặc định: 50. · Tác động: tăng → theo dõi nhiều entry rủi ro hơn."
                  />
                  <IntField
                    form={form}
                    name="topAccountsK"
                    label="Top account"
                    tip="Ý nghĩa: số account cược nhiều tiền nhất derive khi đọc snapshot mỗi kỳ. · Hợp lệ: số nguyên 20–100. · Mặc định: 50. · Tác động: tăng → thấy nhiều account lớn hơn trong dashboard."
                  />
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="justify-end border-t px-6 py-3">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
              Lưu cấu hình vận hành
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
