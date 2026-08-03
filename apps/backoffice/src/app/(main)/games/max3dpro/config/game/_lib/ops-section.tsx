"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Max3dproOpsAlertType, OpsAlertSeverity } from "@megawin/game-max3dpro/entities";
import { DEFAULT_MAX3D_PRO_CONFIG } from "@megawin/game-max3dpro/rules";
import { MoneyInput } from "@megawin/ui/components/money-input";
import {
  Coins,
  HelpCircle,
  Link2,
  Save,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { GameConfig } from "./use-game-config";

type AlertSeverity = (typeof OpsAlertSeverity)[keyof typeof OpsAlertSeverity];

/** Style token severity — dùng cho icon + accent của từng hàng alert. */
const SEVERITY_STYLES: Record<
  AlertSeverity,
  { badge: string; icon: string; ring: string; label: string }
> = {
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
  type: Max3dproOpsAlertType;
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
 * Thứ tự = mức nghiêm trọng giảm dần. NHÃN PHẢI KHỚP `MAX3DPRO_OPS_ALERT_TYPE_LABELS`
 * (operations/_lib/ops-constants.ts) — 2 trang cùng nhãn cho cùng alert type.
 */
const ALERT_META: AlertMeta[] = [
  {
    type: Max3dproOpsAlertType.PairLiability,
    label: "Liability cặp (2 chiều)",
    icon: Link2,
    severity: OpsAlertSeverity.Critical,
    summary: "1 cặp (gộp 2 chiều) tích luỹ liability ĐB ×200.000 + phụ ĐB ×40.000 (KHÔNG cap) vượt ngưỡng.",
    tip: "Ý nghĩa: liability nếu cặp ra ĐB = units đúng chiều × 2 tỷ + units chiều ngược × 400tr (phụ ĐB) ≥ ngưỡng → bắn alert riêng cho TỪNG cặp. Rủi ro số 1 của Pro: 1 unit 10.000đ đúng chiều = liability 2 tỷ; kỳ bán nhiều ngày nên phải biết TRƯỚC ngày quay. · Ngưỡng liên quan: 'Liability cặp (VND)' ở trên. · Tác động khi TẮT: mất cảnh báo rủi ro lớn nhất — KHÔNG nên tắt.",
  },
  {
    type: Max3dproOpsAlertType.ExposureThreshold,
    label: "Rủi ro chi trả",
    icon: ShieldAlert,
    severity: OpsAlertSeverity.Warning,
    summary: "Worst-case tổng (basic exact + cặp ĐB + đuôi plus) vượt ngưỡng tuyệt đối.",
    tip: "Ý nghĩa: worst-case tổng của kỳ ≥ ngưỡng 'Ngưỡng exposure (VND)' → bắn alert. Basic tính CHÍNH XÁC (greedy per-tier); phần plus là ước lượng thiên cao. Dùng ngưỡng tuyệt đối vì kỳ bán nhiều ngày, doanh thu không ổn định làm mẫu số. · Ngưỡng liên quan: 'Ngưỡng exposure (VND)'. · Tác động khi TẮT: không còn cảnh báo tổng mức phải trả.",
  },
  {
    type: Max3dproOpsAlertType.LargeBet,
    label: "Cược lớn",
    icon: Coins,
    severity: OpsAlertSeverity.Warning,
    summary: "Entry có tổng tiền ≥ ngưỡng 'Ngưỡng cược lớn'.",
    tip: "Ý nghĩa: entry có tổng tiền cược ≥ giá trị 'Ngưỡng cược lớn' → đánh dấu và bắn alert. Max 3D Pro kỳ 2-3 ngày, doanh thu/kỳ lớn hơn game nhanh → ngưỡng 5tr (cao hơn Keno/Bingo18). · Ngưỡng liên quan: 'Ngưỡng cược lớn (VND)'. · Tác động khi TẮT: mất tín hiệu sớm về dòng tiền bất thường.",
  },
  {
    type: Max3dproOpsAlertType.ComboConcentration,
    label: "Nhiều người cùng cặp",
    icon: Users,
    severity: OpsAlertSeverity.Warning,
    summary: "1 cặp (cùng chiều) có ≥ N account khác nhau cùng cược (nghi syndicate).",
    tip: "Ý nghĩa: 1 cặp có ≥ 'Ngưỡng account cùng cặp' account distinct cùng cược → bắn alert (dấu hiệu phối hợp đánh 1 cặp). · Ngưỡng liên quan: 'Account cùng cặp' ở trên. · Tác động khi TẮT: không phát hiện syndicate dồn cặp.",
  },
];

// Range PHẢI khớp Zod server (`api/max3d/config/_lib/schema.ts` §ops).
const opsFormSchema = z.object({
  largeBetAmount: z.coerce.number().int().positive("Phải > 0"),
  exposureWarnAmount: z.coerce.number().int().positive("Phải > 0"),
  pairLiabilityWarnAmount: z.coerce.number().int().positive("Phải > 0"),
  comboAccountsWarn: z.coerce.number().int().min(2, "2–50").max(50, "2–50"),
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

function LabelWithTooltip({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1">
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
          <span
            className={cn(
              "rounded px-1.5 py-px text-[10px] font-medium leading-tight",
              style.badge,
              style.icon,
            )}
          >
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
  // Doc cũ chưa có section ops → fallback default (khớp fallback server-side p0-03).
  const ops = config.ops ?? DEFAULT_MAX3D_PRO_CONFIG.ops;
  const { alerts, stats } = ops;

  const form = useForm<OpsFormValues>({
    resolver: zodResolver(opsFormSchema) as never,
    values: {
      largeBetAmount: alerts.largeBetAmount,
      exposureWarnAmount: alerts.exposureWarnAmount,
      pairLiabilityWarnAmount: alerts.pairLiabilityWarnAmount,
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
          exposureWarnAmount: values.exposureWarnAmount,
          pairLiabilityWarnAmount: values.pairLiabilityWarnAmount,
          comboAccountsWarn: values.comboAccountsWarn,
          enabled: values.enabled,
        },
        // CÓ topCombosK — Max 3D Pro dùng OpsStatsConfig đầy đủ (cắt topPairs).
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
  const enabledCount = ALERT_META.reduce(
    (count, meta) => count + (enabled?.[meta.type] ? 1 : 0),
    0,
  );

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
                    Ngưỡng TUYỆT ĐỐI VND (kỳ bán nhiều ngày — không dùng % doanh thu). Worker so
                    mỗi chu kỳ; đổi có hiệu lực trong ~1 chu kỳ (không cần deploy).
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <IntField
                    form={form}
                    name="pairLiabilityWarnAmount"
                    label="Liability cặp"
                    suffix="VND"
                    tip="Ý nghĩa: liability ĐB của 1 cặp (đúng chiều ×2 tỷ + chiều ngược phụ ĐB ×400tr) ≥ giá trị này → alert pair_liability (1 alert/cặp). RỦI RO SỐ 1: 1 unit 10.000đ đúng chiều = liability 2 tỷ, KHÔNG có cap. · Hợp lệ: số nguyên > 0. · Mặc định: 4.000.000.000 (≈ 2 unit đúng chiều). · Tác động: giảm → cảnh báo sớm hơn (thiên an toàn)."
                  />
                  <IntField
                    form={form}
                    name="exposureWarnAmount"
                    label="Ngưỡng exposure"
                    suffix="VND"
                    tip="Ý nghĩa: worst-case tổng (cặp ĐB max + đuôi Năm/Sáu ước tính) ≥ giá trị này → alert exposure_threshold. · Hợp lệ: số nguyên > 0. · Mặc định: 5.000.000.000. · Tác động: giảm → nhạy hơn với tổng mức phải trả."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <IntField
                    form={form}
                    name="largeBetAmount"
                    label="Ngưỡng cược lớn"
                    suffix="VND"
                    tip="Ý nghĩa: entry có tổng tiền ≥ giá trị này bị đánh dấu 'cược lớn' và tính vào alert large_bet. · Hợp lệ: số nguyên > 0. · Mặc định: 10.000.000 (multiNumber 20 bộ = 3,8tr/kỳ với betCount 1 — ngưỡng 5tr sẽ noise). · Tác động: hạ → nhiều entry bị coi là lớn hơn."
                  />
                  <IntField
                    form={form}
                    name="comboAccountsWarn"
                    label="Account cùng cặp"
                    tip="Ý nghĩa: 1 cặp plus có ≥ số này account distinct cùng cược → alert combo_concentration (nghi syndicate). · Hợp lệ: số nguyên 2–50. · Mặc định: 5. · Tác động: giảm → nhạy hơn với dấu hiệu phối hợp."
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
                          Chọn loại rủi ro worker sẽ giám sát và sinh alert mỗi chu kỳ. Tắt một
                          loại nghĩa là ngưng theo dõi rủi ro đó — KHÔNG nên tắt 'Liability cặp
                          cặp bộ ba' (rủi ro số 1 của game).
                        </TooltipContent>
                      </Tooltip>
                    </p>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {enabledCount}/{ALERT_META.length} đang bật
                    </span>
                  </div>

                  <div className="space-y-2">
                    {ALERT_META.map((meta) => (
                      <AlertToggleRow
                        key={meta.type}
                        meta={meta}
                        checked={enabled?.[meta.type] ?? false}
                        onToggle={(v) =>
                          form.setValue(
                            "enabled",
                            { ...enabled, [meta.type]: v },
                            { shouldDirty: true },
                          )
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
                    Điều chỉnh tần suất cập nhật stats và số bản ghi top lưu mỗi kỳ. Ảnh hưởng chi
                    phí worker và độ 'tươi' của dashboard.
                  </p>
                </div>

                <IntField
                  form={form}
                  name="tickSeconds"
                  label="Nhịp cập nhật"
                  suffix="giây"
                  tip="Ý nghĩa: worker cập nhật stats mỗi bao nhiêu giây (loop trong 1 invocation). Dashboard poll theo nhịp này. · Hợp lệ: số nguyên 5–60. · Mặc định: 30 (3 kỳ/tuần, bán nhiều ngày — không cần nhịp 10s như game nhanh). · Tác động: giảm → dữ liệu tươi hơn, tốn tài nguyên hơn."
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <IntField
                    form={form}
                    name="topCombosK"
                    label="Top cặp plus"
                    tip="Ý nghĩa: số cặp (ordered) bị dồn nhiều nhất lưu mỗi kỳ (bảng 'Cặp bị dồn' + input pair_liability/combo_concentration). · Hợp lệ: số nguyên 20–200. · Mặc định: 100. · Tác động: tăng → theo dõi nhiều cặp hơn, doc to hơn."
                  />
                  <IntField
                    form={form}
                    name="topPotentialK"
                    label="Top tiềm năng"
                    tip="Ý nghĩa: số entry có potential payout cao nhất lưu mỗi kỳ (ước tính thiên cao — Σ max/board). · Hợp lệ: số nguyên 20–100. · Mặc định: 50. · Tác động: tăng → theo dõi nhiều entry rủi ro hơn."
                  />
                  <IntField
                    form={form}
                    name="topAccountsK"
                    label="Top account"
                    tip="Ý nghĩa: số account cược nhiều tiền nhất lưu mỗi kỳ. · Hợp lệ: số nguyên 20–100. · Mặc định: 50. · Tác động: tăng → thấy nhiều account lớn hơn."
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
