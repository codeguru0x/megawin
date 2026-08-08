"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KenoOpsAlertType, OpsAlertSeverity } from "@megawin/game-keno/entities";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { BellOff, Coins, HelpCircle, Layers, Save, ShieldAlert, Users, type LucideIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { KenoGameConfig } from "./use-game-config";

type AlertSeverity = (typeof OpsAlertSeverity)[keyof typeof OpsAlertSeverity];

/** Style token severity — dùng cho icon + accent của từng hàng alert. */
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

/** Metadata mô tả từng loại alert bật/tắt được ở P0 — icon, severity, mô tả, tooltip. */
interface AlertMeta {
  type: KenoOpsAlertType;
  label: string;
  icon: LucideIcon;
  severity: AlertSeverity;
  /** Mô tả 1 dòng hiển thị inline dưới tên alert. */
  summary: string;
  /** Giải thích đầy đủ (tooltip) — ý nghĩa · điều kiện bắn · ngưỡng liên quan · tác động khi tắt. */
  tip: string;
}

/**
 * Danh sách alert bật/tắt ở P0 (bỏ `RevenueAnomaly`/`SettleStuck` để dành).
 * Thứ tự = mức nghiêm trọng giảm dần để người vận hành quét từ trên xuống.
 */
const ALERT_META: AlertMeta[] = [
  {
    type: KenoOpsAlertType.ExposureThreshold,
    label: "Rủi ro chi trả",
    icon: ShieldAlert,
    severity: OpsAlertSeverity.Critical,
    summary: "Worst-case payout chạm % cap kỳ (theo 'Exposure cảnh báo').",
    tip: "Ý nghĩa: khi tổng worst-case payout của kỳ chạm % cap (maxPerDraw) → bắn alert. · Ngưỡng liên quan: 'Exposure cảnh báo (%)' ở trên. · Tác động khi TẮT: không còn cảnh báo rủi ro trả thưởng vượt cap — chỉ tắt khi thật sự chấp nhận theo dõi thủ công.",
  },
  {
    type: KenoOpsAlertType.CapSetsNear,
    label: "Gần chạm cap",
    icon: Layers,
    severity: OpsAlertSeverity.Critical,
    summary: "Số bộ pick8/9/10 gần ngưỡng chuyển sang chia đều 10 tỷ.",
    tip: "Ý nghĩa: số bộ cappable (pick8/9/10) trong kỳ ≥ ngưỡng cảnh báo → bắn alert trước khi chạm cap thật (50/12/5 bộ). · Ngưỡng liên quan: nhóm 'Số bộ gần cap' ở trên. · Tác động khi TẮT: không được báo trước khi kỳ sắp chuyển sang chia đều 10 tỷ.",
  },
  {
    type: KenoOpsAlertType.LargeBet,
    label: "Cược lớn",
    icon: Coins,
    severity: OpsAlertSeverity.Warning,
    summary: "Entry có tổng tiền ≥ ngưỡng 'Ngưỡng cược lớn'.",
    tip: "Ý nghĩa: entry có tổng tiền cược ≥ giá trị 'Ngưỡng cược lớn' → đánh dấu và bắn alert. · Ngưỡng liên quan: 'Ngưỡng cược lớn (VND)' ở trên. · Tác động khi TẮT: không còn nổi bật các vé giá trị lớn — mất tín hiệu sớm về dòng tiền bất thường.",
  },
  {
    type: KenoOpsAlertType.SidebetSkew,
    label: "Lệch side bet",
    icon: ShieldAlert,
    severity: OpsAlertSeverity.Warning,
    summary: "Một hướng cược bổ sung chiếm ≥ % tổng cặp (theo 'Lệch side bet').",
    tip: "Ý nghĩa: khi 1 hướng cược bổ sung (lớn/nhỏ, chẵn/lẻ) chiếm ≥ % tổng tiền của cặp → bắn alert. · Ngưỡng liên quan: 'Lệch side bet (%)' ở trên. · Tác động khi TẮT: không phát hiện dòng tiền dồn lệch 1 hướng side bet.",
  },
  {
    type: KenoOpsAlertType.ComboConcentration,
    label: "Dồn bộ số",
    icon: Users,
    severity: OpsAlertSeverity.Warning,
    summary: "Nhiều account cùng cược 1 bộ số cappable (nghi syndicate).",
    tip: "Ý nghĩa: số account distinct cùng cược 1 bộ số cappable ≥ ngưỡng → bắn alert (nghi mua chung/syndicate). · Ngưỡng liên quan: 'Số người dồn 1 bộ số' ở trên. · Tác động khi TẮT: không phát hiện hành vi gom bộ số phối hợp.",
  },
];

// Range PHẢI khớp Zod server (`api/keno/config/_lib/schema.ts` §ops).
const opsFormSchema = z.object({
  largeBetAmount: z.coerce.number().int().positive("Phải > 0"),
  exposureWarnPct: z.coerce.number().int().min(0, "0–100").max(100, "0–100"),
  sidebetSkewPct: z.coerce.number().int().min(0, "0–100").max(100, "0–100"),
  comboSetsWarnPick8: z.coerce.number().int().positive("Phải > 0"),
  comboSetsWarnPick9: z.coerce.number().int().positive("Phải > 0"),
  comboSetsWarnPick10: z.coerce.number().int().positive("Phải > 0"),
  comboAccountsWarn: z.coerce.number().int().positive("Phải > 0"),
  tickSeconds: z.coerce.number().int().min(5, "5–60").max(60, "5–60"),
  topCombosK: z.coerce.number().int().min(20, "20–200").max(200, "20–200"),
  topPotentialK: z.coerce.number().int().min(20, "20–100").max(100, "20–100"),
  topAccountsK: z.coerce.number().int().min(20, "20–100").max(100, "20–100"),
  enabled: z.record(z.string(), z.boolean()),
});

type OpsFormValues = z.infer<typeof opsFormSchema>;

interface OpsSectionProps {
  config: KenoGameConfig;
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

/** Ô nhập số nguyên với label + tooltip 4 phần. */
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
      exposureWarnPct: alerts.exposureWarnPct,
      sidebetSkewPct: alerts.sidebetSkewPct,
      comboSetsWarnPick8: alerts.comboSetsWarn.pick8,
      comboSetsWarnPick9: alerts.comboSetsWarn.pick9,
      comboSetsWarnPick10: alerts.comboSetsWarn.pick10,
      comboAccountsWarn: alerts.comboAccountsWarn,
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
          exposureWarnPct: values.exposureWarnPct,
          sidebetSkewPct: values.sidebetSkewPct,
          comboSetsWarn: {
            pick8: values.comboSetsWarnPick8,
            pick9: values.comboSetsWarnPick9,
            pick10: values.comboSetsWarnPick10,
          },
          comboAccountsWarn: values.comboAccountsWarn,
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
                  tip="Ý nghĩa: entry có tổng tiền ≥ giá trị này bị đánh dấu 'cược lớn' và tính vào alert large_bet. · Hợp lệ: số nguyên > 0. · Mặc định: 5.000.000. · Tác động: hạ ngưỡng → nhiều entry bị coi là lớn hơn; hiệu lực trong ~1 chu kỳ worker."
                />

                <div className="grid grid-cols-2 gap-3">
                  <IntField
                    form={form}
                    name="exposureWarnPct"
                    label="Exposure cảnh báo"
                    suffix="%"
                    tip="Ý nghĩa: khi tổng worst-case payout chạm % này của cap kỳ (maxPerDraw) → alert exposure_threshold. · Hợp lệ: số nguyên 0–100. · Mặc định: 60. · Tác động: giảm → cảnh báo sớm hơn khi rủi ro trả thưởng tăng."
                  />
                  <IntField
                    form={form}
                    name="sidebetSkewPct"
                    label="Lệch side bet"
                    suffix="%"
                    tip="Ý nghĩa: khi 1 hướng cược bổ sung (lớn/nhỏ, chẵn/lẻ) chiếm ≥ % này tổng tiền cặp → alert sidebet_skew. · Hợp lệ: số nguyên 0–100. · Mặc định: 70. · Tác động: giảm → nhạy hơn với dòng tiền dồn 1 hướng."
                  />
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                    Số bộ gần cap (cảnh báo trước chia đều)
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <IntField
                      form={form}
                      name="comboSetsWarnPick8"
                      label="Pick 8"
                      tip="Ý nghĩa: số bộ pick8 trong kỳ ≥ giá trị này → alert cap_sets_near. Cap thật 50 bộ (vượt → chia đều 10 tỷ). · Hợp lệ: số nguyên > 0. · Mặc định: 40. · Tác động: đặt gần cap để biết sớm khi sắp chuyển chia đều."
                    />
                    <IntField
                      form={form}
                      name="comboSetsWarnPick9"
                      label="Pick 9"
                      tip="Ý nghĩa: số bộ pick9 ≥ giá trị này → alert cap_sets_near. Cap thật 12 bộ. · Hợp lệ: số nguyên > 0. · Mặc định: 10. · Tác động: cảnh báo trước khi chạm cap 12."
                    />
                    <IntField
                      form={form}
                      name="comboSetsWarnPick10"
                      label="Pick 10"
                      tip="Ý nghĩa: số bộ pick10 ≥ giá trị này → alert cap_sets_near. Cap thật 5 bộ. · Hợp lệ: số nguyên > 0. · Mặc định: 4. · Tác động: cảnh báo trước khi chạm cap 5."
                    />
                  </div>
                </div>

                <IntField
                  form={form}
                  name="comboAccountsWarn"
                  label="Số người dồn 1 bộ số"
                  suffix="người"
                  tip="Ý nghĩa: số account distinct cùng cược 1 bộ số cappable ≥ giá trị này → alert combo_concentration (nghi syndicate). · Hợp lệ: số nguyên > 0. · Mặc định: 5. · Tác động: giảm → nhạy hơn với hành vi mua chung."
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
                    tip="Ý nghĩa: số combo phổ biến nhất lưu trong stats doc mỗi kỳ. · Hợp lệ: số nguyên 20–200. · Mặc định: 100. · Tác động: tăng → giữ nhiều combo hơn cho drill-down, doc lớn hơn."
                  />
                  <IntField
                    form={form}
                    name="topPotentialK"
                    label="Top tiềm năng"
                    tip="Ý nghĩa: số entry có potential payout cao nhất lưu mỗi kỳ (bảng theo dõi rủi ro). · Hợp lệ: số nguyên 20–100. · Mặc định: 50. · Tác động: tăng → theo dõi nhiều entry rủi ro hơn."
                  />
                  <IntField
                    form={form}
                    name="topAccountsK"
                    label="Top account"
                    tip="Ý nghĩa: số account cược nhiều tiền nhất lưu mỗi kỳ. · Hợp lệ: số nguyên 20–100. · Mặc định: 50. · Tác động: tăng → thấy nhiều account lớn hơn trong dashboard."
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
