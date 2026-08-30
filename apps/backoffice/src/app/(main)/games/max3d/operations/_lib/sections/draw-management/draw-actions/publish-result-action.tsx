"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { GameProduct } from "@megawin/game-core/entities";
import { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";
import {
  MAX3D_DRAW_COUNT_FIRST,
  MAX3D_DRAW_COUNT_SECOND,
  MAX3D_DRAW_COUNT_SPECIAL,
  MAX3D_DRAW_COUNT_THIRD,
  MAX3D_DRAW_TOTAL,
} from "@megawin/game-max3d/entities";
import { displayVNDate } from "@megawin/shared/utils";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  Check,
  Dice3,
  ExternalLink,
  Hash,
  HelpCircle,
  Loader2,
} from "lucide-react";

import { formatResultDialogTitle } from "@/app/(main)/games/_lib/operations/result-dialog-title";
import { vietlottConfigHref } from "@/app/(main)/games/_lib/operations/vietlott-config-link";
import { VietlottReminderNote } from "@/app/(main)/games/_lib/operations/vietlott-reminder-note";
import { VIETLOTT_SUGGESTION_UNAVAILABLE_MESSAGES } from "@/app/(main)/games/_lib/operations/vietlott-suggestion-messages";
import { RandomFillButton } from "@/components/draws";
import { TIER_DOT_STYLES, type TierVariant } from "@/components/games/max3d/triplet-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult, useVietlottSuggestion } from "../../../use-operations";

/** Href tĩnh — build 1 lần ở module scope, dùng lại cho cả 2 nhắc nhở trong dialog. */
const vietlottConfigLink = vietlottConfigHref(GameProduct.Max3d);

// ─── Types ──────────────────────────────────────────────────────────

export interface PublishResultCurrentValues {
  special: [string, string];
  first: [string, string, string, string];
  second: [string, string, string, string, string, string];
  third: [string, string, string, string, string, string, string, string];
  vietlottRef?: { drawPeriod: string; drawDate: string };
}

interface ValidationResult {
  messages: string[];
  /** Flat index (0-19, xuyên suốt cả 4 hạng theo thứ tự ĐB → Nhất → Nhì → Ba). */
  fieldErrors: Set<number>;
}

const VALID: ValidationResult = { messages: [], fieldErrors: new Set() };

// ─── Config ─────────────────────────────────────────────────────────

interface TierConfigEntry {
  key: TierVariant;
  label: string;
  count: number;
  /** Vị trí bắt đầu của hạng này trong mảng flat 20 ô (ĐB → Nhất → Nhì → Ba). */
  offset: number;
}

const TIER_CONFIG: TierConfigEntry[] = (() => {
  const base: { key: TierVariant; label: string; count: number }[] = [
    { key: "special", label: "Giải Đặc Biệt", count: MAX3D_DRAW_COUNT_SPECIAL },
    { key: "first", label: "Giải Nhất", count: MAX3D_DRAW_COUNT_FIRST },
    { key: "second", label: "Giải Nhì", count: MAX3D_DRAW_COUNT_SECOND },
    { key: "third", label: "Giải Ba", count: MAX3D_DRAW_COUNT_THIRD },
  ];
  let offset = 0;
  return base.map((tier) => {
    const entry = { ...tier, offset };
    offset += tier.count;
    return entry;
  });
})();

// ─── Helpers ────────────────────────────────────────────────────────

function generateRandomTriplet(): string {
  return String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}

// ─── Dán nhanh (paste) — bóc bộ ba số từ text copy nguyên khối (VD trang Vietlott) ─

/**
 * Bóc mọi token đúng 1-3 chữ số trong text dán vào (tách theo khoảng trắng/xuống dòng),
 * zero-pad về 3 ký tự. Nhãn hạng giải ("Giải Nhất", "Giải Nhì"...) tự bị loại vì không
 * phải số — nhờ vậy dán được CẢ KHỐI 20 bộ số kèm nhãn hạng giải mà không cần copy
 * riêng từng hạng.
 */
function extractPastedTriplets(raw: string): string[] {
  return raw
    .split(/\s+/)
    .filter((token) => /^\d{1,3}$/.test(token))
    .map((token) => token.padStart(3, "0"));
}

function validateMax3dTriplets(triplets: string[]): ValidationResult {
  const messages: string[] = [];
  const fieldErrors = new Set<number>();

  for (const tier of TIER_CONFIG) {
    const emptyIndices: number[] = [];

    for (let i = 0; i < tier.count; i++) {
      const flatIndex = tier.offset + i;
      const v = triplets[flatIndex]?.trim() ?? "";
      if (!v) {
        emptyIndices.push(i);
        fieldErrors.add(flatIndex);
        continue;
      }
      if (!/^\d{3}$/.test(v)) {
        messages.push(`${tier.label} ô ${i + 1}: phải là 3 chữ số (000–999)`);
        fieldErrors.add(flatIndex);
      }
    }

    if (emptyIndices.length > 0) {
      messages.push(
        `${tier.label}: còn ${emptyIndices.length} ô chưa nhập (ô ${emptyIndices.map((i) => i + 1).join(", ")})`,
      );
    }
  }

  return messages.length > 0 ? { messages, fieldErrors } : VALID;
}

// ─── Component ──────────────────────────────────────────────────────

export function PublishResultAction({
  draw,
  disabled,
  open,
  onOpenChange,
  currentResult,
}: {
  draw: DrawSelectorItem;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  currentResult?: PublishResultCurrentValues;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;
  const publishResult = usePublishResult();
  // Form thống nhất ở mọi trạng thái: luôn hiển thị result + vietlottRef. Backend
  // (PublishResultUseCase) tự quyết định publish lần đầu / sửa trước-sau settle /
  // chỉ sửa vietlottRef, và có mở resettle hay không — UI không cần phân nhánh.
  const isRepublish = draw.status === "published" || draw.status === "settled";

  const [triplets, setTriplets] = useState<string[]>(Array(MAX3D_DRAW_TOTAL).fill(""));

  // Ngày Vietlott mặc định PHẢI là ngày quay của CHÍNH kỳ này (`draw.scheduledDrawAt`,
  // giờ VN) — KHÔNG phải ngày hôm nay lúc thao tác. Staff hoàn toàn có thể nhập/sửa kết
  // quả một kỳ của NGÀY HÔM QUA (vào sáng sớm hôm sau) → `todayVN()` sẽ prefill sai ngày,
  // dễ tạo `vietlottRef.drawDate` lệch 1 ngày mà không ai để ý (đã xảy ra thực tế — P0.1).
  const defaultVietlotDate = displayVNDate(draw.scheduledDrawAt);

  const [vietlotDate, setVietlotDate] = useState(defaultVietlotDate);
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [periodTouched, setPeriodTouched] = useState(false);
  const [validation, setValidation] = useState<ValidationResult>(VALID);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Gợi ý mã kỳ Vietlott — chỉ fetch khi dialog mở (P4). Đọc neo + lịch từ config
  // DB phía server, không tính gì ở client.
  const suggestion = useVietlottSuggestion(draw.drawId, isOpen);
  const suggestedPeriod = suggestion.data?.suggestedPeriod ?? null;

  useEffect(() => {
    if (isOpen && currentResult) {
      const flattened = [
        ...currentResult.special,
        ...currentResult.first,
        ...currentResult.second,
        ...currentResult.third,
      ];
      setTriplets(flattened.length === MAX3D_DRAW_TOTAL ? flattened : Array(MAX3D_DRAW_TOTAL).fill(""));
      setVietlotDate(currentResult.vietlottRef?.drawDate ?? defaultVietlotDate);
      setVietlotPeriod(currentResult.vietlottRef?.drawPeriod ?? "");
      setPeriodTouched(!!currentResult.vietlottRef?.drawPeriod);
    } else if (!isOpen) {
      setTriplets(Array(MAX3D_DRAW_TOTAL).fill(""));
      setVietlotDate(defaultVietlotDate);
      setVietlotPeriod("");
      setPeriodTouched(false);
      setValidation(VALID);
      setPasteNotice(null);
    }
  }, [isOpen, currentResult, defaultVietlotDate]);

  // Prefill mã kỳ từ gợi ý — CHỈ khi kỳ chưa có ref đã publish trước đó (`currentResult`) và
  // staff chưa tự gõ gì vào ô. Suy được sau khi dialog mở (round-trip async) nên tách effect
  // riêng, không gộp vào effect reset ở trên (chạy đồng bộ lúc mở dialog, trước khi có data).
  useEffect(() => {
    if (isOpen && !periodTouched && suggestedPeriod) {
      setVietlotPeriod(suggestedPeriod);
    }
  }, [isOpen, periodTouched, suggestedPeriod]);

  // Cảnh báo lệch — hiện ở MỌI kỳ (overview §4.3/§7): staff nhập khác gợi ý là detector
  // duy nhất phát hiện neo đã cũ. Cảnh báo MỀM, không chặn submit.
  const trimmedPeriod = vietlotPeriod.trim();
  const periodMismatch = !!suggestedPeriod && !!trimmedPeriod && trimmedPeriod !== suggestedPeriod;

  function handleTripletChange(flatIndex: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(0, 3);
    setTriplets((prev) => {
      const next = [...prev];
      next[flatIndex] = cleaned;
      return next;
    });
  }

  /**
   * Dán nguyên khối text copy từ nơi khác (VD trang kết quả Vietlott) vào ô bất kỳ
   * trong lưới 20 bộ số → tự bóc bộ ba số và điền vào đúng vị trí, không cần gõ tay.
   *
   * - Dán đủ đúng 20 bộ số (kèm hoặc không kèm nhãn "Giải Nhất/Nhì/Ba") → điền lại
   *   toàn bộ 4 hạng theo đúng thứ tự ĐB → Nhất → Nhì → Ba, chạy validate ngay.
   * - Dán thiếu (VD chỉ copy riêng 1 hạng, hoặc phần còn lại của kỳ) → điền tiếp từ
   *   ô đang focus, xuyên được qua ranh giới hạng nếu cần.
   * - Số lượng không khớp đủ ô còn lại → KHÔNG tự điền, báo rõ số lượng bóc được
   *   để tránh điền sai âm thầm (đường tiền không cho phép đoán).
   */
  function handleGridPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const tokens = extractPastedTriplets(e.clipboardData.getData("text"));
    if (tokens.length < 2) {
      return;
    }
    e.preventDefault();

    if (tokens.length === MAX3D_DRAW_TOTAL) {
      setTriplets(tokens);
      setValidation(validateMax3dTriplets(tokens));
      setPasteNotice(null);
      requestAnimationFrame(() => inputRefs.current[MAX3D_DRAW_TOTAL - 1]?.focus());
      return;
    }

    const targetIndex = inputRefs.current.indexOf(e.target as HTMLInputElement);
    const startIndex = targetIndex >= 0 ? targetIndex : 0;

    if (startIndex + tokens.length > MAX3D_DRAW_TOTAL) {
      setPasteNotice(
        `Dán được ${tokens.length} bộ số, không khớp đủ ${MAX3D_DRAW_TOTAL - startIndex} ô còn lại. Copy đúng phần kết quả (không kèm ngày/mã kỳ) rồi dán lại.`,
      );
      return;
    }

    setPasteNotice(null);
    setTriplets((prev) => {
      const next = [...prev];
      tokens.forEach((t, i) => {
        next[startIndex + i] = t;
      });
      return next;
    });
    const lastFilled = startIndex + tokens.length - 1;
    requestAnimationFrame(() => inputRefs.current[Math.min(lastFilled + 1, MAX3D_DRAW_TOTAL - 1)]?.focus());
  }

  function fillRandom() {
    setTriplets(Array.from({ length: MAX3D_DRAW_TOTAL }, generateRandomTriplet));
    setValidation(VALID);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateMax3dTriplets(triplets);
    setValidation(result);
    if (result.messages.length > 0) {
      const firstErrorIdx = [...result.fieldErrors][0];
      if (firstErrorIdx !== undefined) {
        inputRefs.current[firstErrorIdx]?.focus();
      }
      return;
    }

    const sliceTier = (key: TierVariant): string[] => {
      const tier = TIER_CONFIG.find((t) => t.key === key);
      return tier ? triplets.slice(tier.offset, tier.offset + tier.count) : [];
    };

    const resultBody = {
      special: sliceTier("special") as [string, string],
      first: sliceTier("first") as [string, string, string, string],
      second: sliceTier("second") as [string, string, string, string, string, string],
      third: sliceTier("third") as [string, string, string, string, string, string, string, string],
    };

    const body: {
      result: typeof resultBody;
      vietlottRef?: { drawPeriod: string; drawDate: string };
    } = { result: resultBody };

    if (vietlotPeriod.trim()) {
      body.vietlottRef = { drawPeriod: vietlotPeriod.trim(), drawDate: vietlotDate };
    }

    publishResult.mutate({ drawId: draw.drawId, body }, { onSuccess: () => setIsOpen(false) });
  }

  const filledCount = triplets.filter((v) => /^\d{3}$/.test(v)).length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dice3 className="size-4.5 text-blue-500" />
            {formatResultDialogTitle(draw.drawId, draw.drawTime)}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            Nhập {MAX3D_DRAW_TOTAL} bộ ba số (000–999): {MAX3D_DRAW_COUNT_SPECIAL} ĐB + {MAX3D_DRAW_COUNT_FIRST} Nhất +{" "}
            {MAX3D_DRAW_COUNT_SECOND} Nhì + {MAX3D_DRAW_COUNT_THIRD} Ba.
            {isRepublish && " Kết quả cũ sẽ bị ghi đè."}
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                {MAX3D_DRAW_TOTAL} bộ ba số từ &apos;000&apos; đến &apos;999&apos;. Gồm 4 giải: Đặc Biệt (
                {MAX3D_DRAW_COUNT_SPECIAL}), Nhất ({MAX3D_DRAW_COUNT_FIRST}), Nhì ({MAX3D_DRAW_COUNT_SECOND}), Ba (
                {MAX3D_DRAW_COUNT_THIRD}).
              </TooltipContent>
            </Tooltip>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="tabular-nums">
                {filledCount}/{MAX3D_DRAW_TOTAL} bộ số
              </Badge>
              <RandomFillButton onFill={fillRandom} />
            </div>

            <div onPaste={handleGridPaste}>
              {TIER_CONFIG.map((tier) => (
                <div key={tier.key} className="space-y-2.5 mb-3.5 last:mb-0">
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full shrink-0 ${TIER_DOT_STYLES[tier.key]}`} />
                    <Label className="text-sm font-semibold">{tier.label}</Label>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="grid grid-cols-6 gap-2">
                      {Array.from({ length: tier.count }, (_, i) => {
                        const flatIndex = tier.offset + i;
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground text-center">{i + 1}</span>
                            <Input
                              ref={(el) => {
                                inputRefs.current[flatIndex] = el;
                              }}
                              type="text"
                              inputMode="numeric"
                              maxLength={3}
                              value={triplets[flatIndex]}
                              onChange={(e) => handleTripletChange(flatIndex, e.target.value)}
                              className={`w-full text-center font-mono text-sm font-bold tabular-nums ${validation.fieldErrors.has(flatIndex) ? "border-destructive" : ""}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {pasteNotice && (
              <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-300">{pasteNotice}</p>
                </div>
              </div>
            )}

            {validation.messages.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1">
                {validation.messages.map((msg, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{msg}</p>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/50">
                  <ExternalLink className="size-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <Label className="text-sm font-semibold">Tham chiếu Vietlott</Label>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Liên kết kỳ quay với dữ liệu Vietlott chính thức để đối soát. Chỉ sửa tham chiếu (giữ nguyên kết quả)
                  sẽ KHÔNG kích hoạt kết sổ lại.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CalendarDays className="size-3" /> Ngày Vietlott
                    </Label>
                    <Input
                      type="date"
                      className="font-mono text-sm"
                      value={vietlotDate}
                      onChange={(e) => setVietlotDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Hash className="size-3" /> Mã kỳ Vietlott
                    </Label>
                    <Input
                      type="text"
                      placeholder="VD: 123456"
                      className="font-mono text-sm"
                      value={vietlotPeriod}
                      onChange={(e) => {
                        setPeriodTouched(true);
                        setVietlotPeriod(e.target.value);
                      }}
                    />
                  </div>
                </div>

                {/* 4 trường hợp không suy được — mỗi trường hợp 1 thông báo riêng (overview §7.1). */}
                {!suggestion.isFetching && !suggestedPeriod && !trimmedPeriod && suggestion.data?.reason && (
                  <div className="mt-3 rounded-lg border border-blue-300/50 bg-blue-50 px-4 py-3 dark:bg-blue-900/20">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="size-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-300">
                          {VIETLOTT_SUGGESTION_UNAVAILABLE_MESSAGES[suggestion.data.reason]}
                        </p>
                        {suggestion.data.reason === VietlottSuggestionUnavailableReason.NoAnchor && (
                          <Link
                            href={vietlottConfigLink}
                            className="text-xs font-medium text-blue-700 underline dark:text-blue-400"
                          >
                            Cấu hình mã kỳ Vietlott →
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Cảnh báo lệch — MỌI kỳ, không chỉ kỳ đầu (overview §4.3). Mềm, không chặn lưu. */}
                {periodMismatch && (
                  <div className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm text-amber-800 dark:text-amber-300">
                          Mã kỳ vừa nhập (<span className="font-mono font-semibold">{trimmedPeriod}</span>) khác gợi ý
                          hệ thống (<span className="font-mono font-semibold">{suggestedPeriod}</span>).
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Nếu giá trị vừa nhập đúng với trang Vietlott, hãy{" "}
                          <Link href={vietlottConfigLink} className="font-medium underline">
                            cập nhật lại mã kỳ Vietlott
                          </Link>{" "}
                          ở cấu hình game để các kỳ sau tự tính đúng.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <VietlottReminderNote />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Huỷ bỏ
            </Button>
            <Button type="submit" disabled={publishResult.isPending || disabled}>
              {publishResult.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Check className="mr-2 size-4" />
              )}
              Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
