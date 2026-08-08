"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bingo18OpsAlertType, OpsAlertSeverity } from "@megawin/game-bingo18/entities";
import { DEFAULT_BINGO18_CONFIG } from "@megawin/game-bingo18/rules";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { BellOff, Coins, HelpCircle, type LucideIcon, Save, Scale, ShieldAlert, Sigma } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { Bingo18GameConfig } from "./use-game-config";

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
  type: Bingo18OpsAlertType;
  label: string;
  icon: LucideIcon;
  severity: AlertSeverity;
  /** Mô tả 1 dòng hiển thị inline dưới tên alert. */
  summary: string;
  /** Giải thích đầy đủ (tooltip) — ý nghĩa · ngưỡng liên quan · tác động khi tắt. */
  tip: string;
}

/**
 * Danh sách alert bật/tắt ở P0 (bỏ `RevenueAnomaly`/`SettleStuck` để dành).
 * Thứ tự = mức nghiêm trọng giảm dần. NHÃN PHẢI KHỚP `BINGO18_OPS_ALERT_TYPE_LABELS`
 * (operations/_lib/ops-constants.ts) — 2 trang cùng nhãn cho cùng alert type (guideline §4).
 */
const ALERT_META: AlertMeta[] = [
  {
    type: Bingo18OpsAlertType.ExposureThreshold,
    label: "Rủi ro chi trả",
    icon: ShieldAlert,
    severity: OpsAlertSeverity.Critical,
    summary: "Worst-case payout (chính xác trên 216 kết quả) vượt % doanh thu kỳ.",
    tip: "Ý nghĩa: worst-case payout của kỳ ≥ max(sàn tuyệt đối, % doanh thu kỳ) → bắn alert. Bingo 18 không có cap kỳ nên mẫu số là doanh thu. · Ngưỡng liên quan: 'Exposure cảnh báo (%)' + 'Sàn exposure (VND)' ở trên. · Tác động khi TẮT: không còn cảnh báo rủi ro trả thưởng vượt doanh thu — chỉ tắt khi chấp nhận theo dõi thủ công.",
  },
  {
    type: Bingo18OpsAlertType.BucketConcentration,
    label: "Dồn cửa nhân cao",
    icon: Sigma,
    severity: OpsAlertSeverity.Warning,
    summary: "Tiền dồn 1 cửa nhân ×120 (tổng 3/18, bộ ba cụ thể) vượt ngưỡng.",
    tip: "Ý nghĩa: tổng tiền cược vào 1 cửa nhân cao (tổng 3/18 hoặc bộ ba số cụ thể — trả ×120) ≥ ngưỡng → bắn alert (5tr vào tổng 3 = trả 600tr nếu trúng). · Ngưỡng liên quan: 'Dồn cửa nhân cao (VND)' ở trên. · Tác động khi TẮT: không phát hiện tiền dồn vào cửa trả thưởng lớn nhất của game.",
  },
  {
    type: Bingo18OpsAlertType.LargeBet,
    label: "Cược lớn",
    icon: Coins,
    severity: OpsAlertSeverity.Warning,
    summary: "Entry có tổng tiền ≥ ngưỡng 'Ngưỡng cược lớn'.",
    tip: "Ý nghĩa: entry có tổng tiền cược ≥ giá trị 'Ngưỡng cược lớn' → đánh dấu và bắn alert. · Ngưỡng liên quan: 'Ngưỡng cược lớn (VND)' ở trên. · Tác động khi TẮT: không còn nổi bật các vé giá trị lớn — mất tín hiệu sớm về dòng tiền bất thường.",
  },
  {
    type: Bingo18OpsAlertType.SidebetSkew,
    label: "Lệch Lớn/Hòa/Nhỏ",
    icon: Scale,
    severity: OpsAlertSeverity.Warning,
    summary: "Một hướng Lớn/Hòa/Nhỏ chiếm ≥ % tổng tiền (xác suất nền 49/25/26%).",
    tip: "Ý nghĩa: 1 hướng Lớn/Hòa/Nhỏ chiếm ≥ % này tổng tiền 3 hướng → bắn alert. Lưu ý xác suất nền KHÔNG đối xứng: Nhỏ 49,07% · Hòa 25% · Lớn 25,93%. · Ngưỡng liên quan: 'Lệch Lớn/Hòa/Nhỏ (%)' ở trên. · Tác động khi TẮT: không phát hiện dòng tiền dồn lệch 1 hướng.",
  },
];

// Range PHẢI khớp Zod server (`api/bingo18/config/_lib/schema.ts` §ops).
const opsFormSchema = z.object({
  largeBetAmount: z.coerce.number().int().positive("Phải > 0"),
  exposureWarnRevenuePct: z.coerce.number().int().min(100, "100–1000").max(1000, "100–1000"),
  exposureWarnMinAmount: z.coerce.number().int().positive("Phải > 0"),
  sidebetSkewPct: z.coerce.number().int().min(50, "50–95").max(95, "50–95"),
  bucketConcentrationAmount: z.coerce.number().int().positive("Phải > 0"),
  tickSeconds: z.coerce.number().int().min(5, "5–60").max(60, "5–60"),
  topPotentialK: z.coerce.number().int().min(20, "20–100").max(100, "20–100"),
  topAccountsK: z.coerce.number().int().min(20, "20–100").max(100, "20–100"),
  enabled: z.record(z.string(), z.boolean()),
});

type OpsFormValues = z.infer<typeof opsFormSchema>;

interface OpsSectionProps {
  config: Bingo18GameConfig;
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
  // Doc cũ chưa có section ops → fallback default (khớp fallback server-side p0-03 §3).
  const ops = config.ops ?? DEFAULT_BINGO18_CONFIG.ops;
  const { alerts, stats } = ops;

  const form = useForm<OpsFormValues>({
    resolver: zodResolver(opsFormSchema) as never,
    values: {
      largeBetAmount: alerts.largeBetAmount,
      exposureWarnRevenuePct: alerts.exposureWarnRevenuePct,
      exposureWarnMinAmount: alerts.exposureWarnMinAmount,
      sidebetSkewPct: alerts.sidebetSkewPct,
      bucketConcentrationAmount: alerts.bucketConcentrationAmount,
      tickSeconds: stats.tickSeconds,
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
          exposureWarnRevenuePct: values.exposureWarnRevenuePct,
          exposureWarnMinAmount: values.exposureWarnMinAmount,
          sidebetSkewPct: values.sidebetSkewPct,
          bucketConcentrationAmount: values.bucketConcentrationAmount,
          enabled: values.enabled,
        },
        // KHÔNG có topCombosK — Bingo 18 dùng OpsStatsConfigBase (chốt §7 Q3).
        stats: {
          tickSeconds: values.tickSeconds,
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
                  tip="Ý nghĩa: entry có tổng tiền ≥ giá trị này bị đánh dấu 'cược lớn' và tính vào alert large_bet. · Hợp lệ: số nguyên > 0. · Mặc định: 1.000.000 (trần thắng/board Bingo 18 chỉ 12tr nên ngưỡng thấp hơn Keno). · Tác động: hạ ngưỡng → nhiều entry bị coi là lớn hơn; hiệu lực trong ~1 chu kỳ worker."
                />

                <div className="grid grid-cols-2 gap-3">
                  <IntField
                    form={form}
                    name="exposureWarnRevenuePct"
                    label="Exposure cảnh báo"
                    suffix="%"
                    tip="Ý nghĩa: worst-case payout (chính xác trên 216 kết quả) ≥ % này của DOANH THU kỳ → alert exposure_threshold. Bingo 18 không có cap kỳ nên mẫu số là doanh thu. · Hợp lệ: số nguyên 100–1000. · Mặc định: 300 (worst-case gấp 3 doanh thu). · Tác động: giảm → cảnh báo sớm hơn."
                  />
                  <IntField
                    form={form}
                    name="exposureWarnMinAmount"
                    label="Sàn exposure"
                    suffix="VND"
                    tip="Ý nghĩa: worst-case DƯỚI mức này KHÔNG cảnh báo dù vượt % doanh thu — chống noise kỳ vắng khách (doanh thu nhỏ → % luôn cao). Đi CẶP với 'Exposure cảnh báo (%)'. · Hợp lệ: số nguyên > 0. · Mặc định: 50.000.000. · Tác động: tăng → bớt alert ở kỳ doanh thu thấp."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <IntField
                    form={form}
                    name="sidebetSkewPct"
                    label="Lệch Lớn/Hòa/Nhỏ"
                    suffix="%"
                    tip="Ý nghĩa: 1 hướng Lớn/Hòa/Nhỏ chiếm ≥ % này tổng tiền 3 hướng → alert sidebet_skew. Xác suất nền không đối xứng (Nhỏ 49,07% · Hòa 25% · Lớn 25,93%). · Hợp lệ: số nguyên 50–95. · Mặc định: 70. · Tác động: giảm → nhạy hơn với dòng tiền dồn 1 hướng."
                  />
                  <IntField
                    form={form}
                    name="bucketConcentrationAmount"
                    label="Dồn cửa nhân cao"
                    suffix="VND"
                    tip="Ý nghĩa: tổng tiền cược vào 1 cửa nhân ×120 (tổng 3/18, bộ ba số cụ thể) ≥ giá trị này → alert bucket_concentration. Ví dụ 5tr vào tổng 3 = liability 600tr nếu trúng. · Hợp lệ: số nguyên > 0. · Mặc định: 5.000.000. · Tác động: giảm → nhạy hơn với tiền dồn cửa trả lớn."
                  />
                </div>

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
                  tip="Ý nghĩa: worker cập nhật stats mỗi bao nhiêu giây (loop trong 1 invocation). Dashboard cũng poll theo nhịp này. · Hợp lệ: số nguyên 5–60. · Mặc định: 10 (kỳ 6 phút cần nhịp nhanh). · Tác động: giảm → dữ liệu tươi hơn nhưng tốn tài nguyên worker hơn."
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <IntField
                    form={form}
                    name="topPotentialK"
                    label="Top tiềm năng"
                    tip="Ý nghĩa: số entry có potential payout cao nhất lưu mỗi kỳ (bảng theo dõi rủi ro — tính CHÍNH XÁC trên 216 kết quả). · Hợp lệ: số nguyên 20–100. · Mặc định: 50. · Tác động: tăng → theo dõi nhiều entry rủi ro hơn."
                  />
                  <IntField
                    form={form}
                    name="topAccountsK"
                    label="Top account"
                    tip="Ý nghĩa: số account cược nhiều tiền nhất lưu mỗi kỳ. · Hợp lệ: số nguyên 20–100. · Mặc định: 50. · Tác động: tăng → thấy nhiều account lớn hơn trong dashboard."
                  />
                </div>

                <p className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                  Bingo 18 KHÔNG có cấu hình Top combo — không gian cược chỉ 38 cửa cố định, bảng phân bổ đầy đủ đã hiển
                  thị trên trang Vận hành (không cần cắt top).
                </p>
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
