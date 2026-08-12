"use client";

import { useMemo } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Max3dproOpsAlertType, OpsAlertSeverity } from "@megawin/game-max3dpro/entities";
import { DEFAULT_MAX3D_PRO_CONFIG } from "@megawin/game-max3dpro/rules";
import { formatNumberVN } from "@megawin/shared/utils";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { Coins, HelpCircle, Link2, type LucideIcon, Save, ShieldAlert, Users } from "lucide-react";
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
 *
 * Nhận giải ĐB / phụ ĐB + giá 1 lượt từ config đang lưu để mô tả đòn bẩy liability
 * THẬT thay vì hardcode con số mặc định.
 */
function buildAlertMeta(specialPrize: number, specialSubPrize: number, unitPrice: number): AlertMeta[] {
  const leverage = unitPrice > 0 ? Math.round(specialPrize / unitPrice) : 0;
  const leverageLabel = leverage > 0 ? `×${formatNumberVN(leverage)}` : "rất lớn";

  return [
    {
      type: Max3dproOpsAlertType.PairLiability,
      label: "Liability cặp (2 chiều)",
      icon: Link2,
      severity: OpsAlertSeverity.Critical,
      summary: `1 cặp (gộp cả 2 chiều) tích luỹ liability giải ĐB — chiều đúng ${leverageLabel} tiền cược, chiều ngược ăn phụ ĐB — vượt ngưỡng. KHÔNG có mức trần.`,
      tip: `Ý nghĩa: với 1 kết quả ĐB [bộ 1, bộ 2] có thể xảy ra, liability = (số lượt cược ĐÚNG chiều × ${formatNumberVN(specialPrize)}) + (số lượt cược NGƯỢC chiều × ${formatNumberVN(specialSubPrize)} — giải phụ ĐB); nếu cặp trùng (2 bộ giống nhau) thì mỗi lượt tính ${formatNumberVN(specialPrize + specialSubPrize)} theo luật lĩnh cả ĐB + phụ ĐB. Vượt ngưỡng → bắn cảnh báo riêng cho TỪNG cặp. Rủi ro số 1 của Pro: chỉ ${formatNumberVN(unitPrice)}đ đúng chiều đã tạo ${formatNumberVN(specialPrize)}đ nghĩa vụ, không có mức trần; kỳ bán nhiều ngày nên phải biết TRƯỚC ngày quay. · Ngưỡng liên quan: 'Liability cặp (VND)' ở trên. · Tác động khi TẮT: mất cảnh báo rủi ro lớn nhất — KHÔNG nên tắt.`,
    },
    {
      type: Max3dproOpsAlertType.ExposureThreshold,
      label: "Rủi ro chi trả",
      icon: ShieldAlert,
      severity: OpsAlertSeverity.Warning,
      summary: "Worst-case tổng (cặp có liability ĐB lớn nhất + giải nhỏ Năm/Sáu) vượt ngưỡng tuyệt đối.",
      tip: "Ý nghĩa: worst-case tổng của kỳ ≥ ngưỡng 'Ngưỡng exposure (VND)' → bắn cảnh báo; gấp đôi ngưỡng → mức Nghiêm trọng. Max 3D Pro KHÔNG có kiểu chơi 1 bộ ba số, nên worst-case chỉ gồm 2 phần: (1) cặp có liability ĐB lớn nhất — chính xác nếu cặp đó nằm trong danh sách 'Top cặp' đang lưu, và (2) giải nhỏ Năm/Sáu tính trên TOÀN BỘ số lượt cược của kỳ, phần này TÍNH DƯ vì giả định mọi lượt đều trúng. Dùng ngưỡng tuyệt đối vì kỳ bán nhiều ngày, doanh thu không ổn định để làm mẫu số %. · Ngưỡng liên quan: 'Ngưỡng exposure (VND)'. · Tác động khi TẮT: không còn cảnh báo tổng mức phải trả.",
    },
    {
      type: Max3dproOpsAlertType.LargeBet,
      label: "Cược lớn",
      icon: Coins,
      severity: OpsAlertSeverity.Warning,
      summary: "Có entry với tổng tiền ≥ ngưỡng 'Ngưỡng cược lớn' (gộp 1 cảnh báo mỗi kỳ).",
      tip: `Ý nghĩa: entry có tổng tiền cược ≥ giá trị 'Ngưỡng cược lớn' được đánh dấu; hệ thống gộp thành 1 cảnh báo mỗi kỳ và nâng lên mức Nghiêm trọng khi có nhiều entry vượt ngưỡng. Lưu ý Pro dễ đạt số tiền lớn một cách hợp lệ: 1 board chọn 20 bộ ba số đã sinh 380 cặp = ${formatNumberVN(380 * unitPrice)}đ cho 1 lượt. · Ngưỡng liên quan: 'Ngưỡng cược lớn (VND)'. · Tác động khi TẮT: mất tín hiệu sớm về dòng tiền bất thường.`,
    },
    {
      type: Max3dproOpsAlertType.ComboConcentration,
      label: "Nhiều người cùng cặp",
      icon: Users,
      severity: OpsAlertSeverity.Warning,
      summary: "1 cặp (cùng chiều) có ≥ N account khác nhau cùng cược (nghi phối hợp).",
      tip: "Ý nghĩa: 1 cặp CÙNG CHIỀU có số account khác nhau cùng cược ≥ 'Ngưỡng account cùng cặp' → bắn cảnh báo; gấp đôi ngưỡng → mức Nghiêm trọng. Chỉ quét trong danh sách 'Top cặp' đang lưu. · Ngưỡng liên quan: 'Account cùng cặp' ở trên. · Tác động khi TẮT: không phát hiện việc dồn cặp có tổ chức.",
    },
  ];
}

// Range PHẢI khớp Zod server (`api/max3dpro/config/_lib/schema.ts` §ops).
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
  // Doc cũ chưa có section ops → fallback default (khớp fallback server-side p0-03).
  const ops = config.ops ?? DEFAULT_MAX3D_PRO_CONFIG.ops;
  const { alerts, stats } = ops;

  // Mô tả alert phải phản ánh giải ĐB / phụ ĐB + giá vé ĐANG cấu hình, không hardcode.
  const alertMeta = useMemo(
    () =>
      buildAlertMeta(
        config.defaultPrizes.standard.special,
        config.defaultPrizes.standard.specialSub,
        config.play.unitPrice,
      ),
    [config.defaultPrizes.standard.special, config.defaultPrizes.standard.specialSub, config.play.unitPrice],
  );

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
  const enabledCount = alertMeta.reduce((count, meta) => count + (enabled?.[meta.type] ? 1 : 0), 0);

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
                    Ngưỡng TUYỆT ĐỐI theo VND (kỳ bán nhiều ngày nên không dùng % doanh thu làm mẫu số). Worker đối
                    chiếu mỗi chu kỳ cập nhật; thay đổi có hiệu lực trong ~1 chu kỳ, không cần triển khai lại.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <IntField
                    form={form}
                    name="pairLiabilityWarnAmount"
                    label="Liability cặp"
                    suffix="VND"
                    tip={`Ý nghĩa: liability giải ĐB của 1 cặp (số lượt đúng chiều × ${formatNumberVN(config.defaultPrizes.standard.special)} + số lượt ngược chiều × ${formatNumberVN(config.defaultPrizes.standard.specialSub)}) ≥ giá trị này → bắn cảnh báo 'Liability cặp (2 chiều)', 1 cảnh báo cho mỗi cặp. RỦI RO SỐ 1: chỉ ${formatNumberVN(config.play.unitPrice)}đ đúng chiều đã tạo ${formatNumberVN(config.defaultPrizes.standard.special)}đ nghĩa vụ và KHÔNG có mức trần. · Hợp lệ: số nguyên > 0. · Mặc định: ${formatNumberVN(DEFAULT_MAX3D_PRO_CONFIG.ops.alerts.pairLiabilityWarnAmount)}. · Tác động: giảm → cảnh báo sớm hơn (thiên an toàn).`}
                  />
                  <IntField
                    form={form}
                    name="exposureWarnAmount"
                    label="Ngưỡng exposure"
                    suffix="VND"
                    tip={`Ý nghĩa: worst-case tổng của kỳ (cặp có liability ĐB lớn nhất + giải nhỏ Năm/Sáu tính trên toàn bộ số lượt cược — phần này tính dư) ≥ giá trị này → bắn cảnh báo 'Rủi ro chi trả'; gấp đôi ngưỡng → mức Nghiêm trọng. · Hợp lệ: số nguyên > 0. · Mặc định: ${formatNumberVN(DEFAULT_MAX3D_PRO_CONFIG.ops.alerts.exposureWarnAmount)}. · Tác động: giảm → nhạy hơn với tổng mức phải trả.`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <IntField
                    form={form}
                    name="largeBetAmount"
                    label="Ngưỡng cược lớn"
                    suffix="VND"
                    tip={`Ý nghĩa: entry có tổng tiền ≥ giá trị này được đánh dấu 'cược lớn' và tính vào cảnh báo 'Cược lớn'. · Hợp lệ: số nguyên > 0. · Mặc định: ${formatNumberVN(DEFAULT_MAX3D_PRO_CONFIG.ops.alerts.largeBetAmount)} — cao hơn Max 3D vì 1 board Pro chọn 20 bộ số đã sinh 380 cặp = ${formatNumberVN(380 * config.play.unitPrice)}đ cho 1 lượt, đặt thấp sẽ báo nhiễu. · Tác động: hạ → nhiều entry bị coi là lớn hơn.`}
                  />
                  <IntField
                    form={form}
                    name="comboAccountsWarn"
                    label="Account cùng cặp"
                    tip={`Ý nghĩa: 1 cặp cùng chiều có số account khác nhau cùng cược ≥ số này → bắn cảnh báo 'Nhiều người cùng cặp'; gấp đôi ngưỡng → mức Nghiêm trọng. · Hợp lệ: số nguyên 2–50. · Mặc định: ${DEFAULT_MAX3D_PRO_CONFIG.ops.alerts.comboAccountsWarn}. · Tác động: giảm → nhạy hơn với dấu hiệu phối hợp.`}
                  />
                </div>

                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Bật / tắt loại cảnh báo
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="size-3.5 cursor-help text-muted-foreground/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-80 text-xs">
                          Chọn loại rủi ro hệ thống sẽ giám sát và sinh cảnh báo mỗi chu kỳ. Tắt một loại nghĩa là ngưng
                          theo dõi rủi ro đó — KHÔNG nên tắt 'Liability cặp (2 chiều)' (rủi ro số 1 của game).
                        </TooltipContent>
                      </Tooltip>
                    </p>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {enabledCount}/{alertMeta.length} đang bật
                    </span>
                  </div>

                  <div className="space-y-2">
                    {alertMeta.map((meta) => (
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
                  <h3 className="text-sm font-semibold text-foreground">Nhịp cập nhật & số bản ghi Top</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Điều chỉnh tần suất cập nhật thống kê và số bản ghi top lưu mỗi kỳ. Ảnh hưởng chi phí xử lý và độ
                    mới của trang vận hành.
                  </p>
                </div>

                <IntField
                  form={form}
                  name="tickSeconds"
                  label="Nhịp cập nhật"
                  suffix="giây"
                  tip={`Ý nghĩa: worker cập nhật số liệu thống kê mỗi bao nhiêu giây; trang vận hành làm mới theo nhịp này. · Hợp lệ: số nguyên 5–60. · Mặc định: ${DEFAULT_MAX3D_PRO_CONFIG.ops.stats.tickSeconds} (Max 3D Pro quay 3 kỳ/tuần, bán nhiều ngày nên không cần nhịp nhanh như game quay liên tục). · Tác động: giảm → dữ liệu tươi hơn, tốn tài nguyên hơn.`}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <IntField
                    form={form}
                    name="topCombosK"
                    label="Top cặp"
                    tip={`Ý nghĩa: số cặp (tính theo chiều, cặp ngược chiều là 1 khoá riêng) bị dồn tiền nhiều nhất được lưu mỗi kỳ — đây cũng là phạm vi quét của 2 cảnh báo 'Liability cặp (2 chiều)' và 'Nhiều người cùng cặp', cặp ngoài danh sách sẽ KHÔNG được xét. · Hợp lệ: số nguyên 20–200. · Mặc định: ${DEFAULT_MAX3D_PRO_CONFIG.ops.stats.topCombosK}. · Tác động: tăng → theo dõi nhiều cặp hơn, dữ liệu lưu lớn hơn.`}
                  />
                  <IntField
                    form={form}
                    name="topPotentialK"
                    label="Top tiềm năng"
                    tip={`Ý nghĩa: số entry có mức chi trả tiềm năng cao nhất được lưu mỗi kỳ (con số dùng để XẾP HẠNG: mỗi board tính theo giải ĐB + phụ ĐB vì board thường chứa cả 2 chiều của một cặp, chưa cộng các giải nhỏ trúng kèm). · Hợp lệ: số nguyên 20–100. · Mặc định: ${DEFAULT_MAX3D_PRO_CONFIG.ops.stats.topPotentialK}. · Tác động: tăng → theo dõi nhiều entry rủi ro hơn.`}
                  />
                  <IntField
                    form={form}
                    name="topAccountsK"
                    label="Top account"
                    tip={`Ý nghĩa: số account cược nhiều tiền nhất được lưu mỗi kỳ. · Hợp lệ: số nguyên 20–100. · Mặc định: ${DEFAULT_MAX3D_PRO_CONFIG.ops.stats.topAccountsK}. · Tác động: tăng → thấy nhiều account lớn hơn.`}
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
