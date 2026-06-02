"use client";

import { useState, useEffect } from "react";
import {
  Check,
  Loader2,
  Dice3,
  HelpCircle,
  ExternalLink,
  CalendarDays,
  Hash,
  AlertCircle,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RandomFillButton } from "@/components/draws";
import { TIER_DOT_STYLES, type TierVariant } from "@/components/games/max3dpro/triplet-display";
import { todayVN } from "@megawin/shared/utils";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

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
  fieldErrors: Map<string, Set<number>>;
}

const VALID: ValidationResult = { messages: [], fieldErrors: new Map() };

// ─── Config ─────────────────────────────────────────────────────────

const TIER_CONFIG: { key: TierVariant; label: string; count: number }[] = [
  { key: "special", label: "Giải Đặc Biệt", count: 2 },
  { key: "first", label: "Giải Nhất", count: 4 },
  { key: "second", label: "Giải Nhì", count: 6 },
  { key: "third", label: "Giải Ba", count: 8 },
];

// ─── Helpers ────────────────────────────────────────────────────────

function generateRandomTriplet(): string {
  return String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}

function validateMax3dPro(
  tiers: { key: string; label: string; values: string[] }[],
): ValidationResult {
  const messages: string[] = [];
  const fieldErrors = new Map<string, Set<number>>();

  for (const tier of tiers) {
    const emptyIndices: number[] = [];
    const tierErrors = new Set<number>();

    for (let i = 0; i < tier.values.length; i++) {
      const v = tier.values[i]?.trim() ?? "";
      if (!v) {
        emptyIndices.push(i);
        tierErrors.add(i);
        continue;
      }
      if (!/^\d{3}$/.test(v)) {
        messages.push(`${tier.label} ô ${i + 1}: phải là 3 chữ số (000–999)`);
        tierErrors.add(i);
      }
    }

    if (emptyIndices.length > 0) {
      messages.push(
        `${tier.label}: còn ${emptyIndices.length} ô chưa nhập (ô ${emptyIndices.map((i) => i + 1).join(", ")})`,
      );
    }

    if (tierErrors.size > 0) fieldErrors.set(tier.key, tierErrors);
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
  const isRepublish = draw.status === DrawStatus.Published || draw.status === DrawStatus.Settled;

  const [special, setSpecial] = useState<string[]>(Array(2).fill(""));
  const [first, setFirst] = useState<string[]>(Array(4).fill(""));
  const [second, setSecond] = useState<string[]>(Array(6).fill(""));
  const [third, setThird] = useState<string[]>(Array(8).fill(""));
  const [vietlotDate, setVietlotDate] = useState(todayVN());
  const [vietlotPeriod, setVietlotPeriod] = useState("");
  const [validation, setValidation] = useState<ValidationResult>(VALID);

  const tierValues: Record<
    string,
    { get: string[]; set: React.Dispatch<React.SetStateAction<string[]>> }
  > = {
    special: { get: special, set: setSpecial },
    first: { get: first, set: setFirst },
    second: { get: second, set: setSecond },
    third: { get: third, set: setThird },
  };

  useEffect(() => {
    if (isOpen && currentResult) {
      setSpecial(
        currentResult.special.length === 2 ? [...currentResult.special] : Array(2).fill(""),
      );
      setFirst(currentResult.first.length === 4 ? [...currentResult.first] : Array(4).fill(""));
      setSecond(currentResult.second.length === 6 ? [...currentResult.second] : Array(6).fill(""));
      setThird(currentResult.third.length === 8 ? [...currentResult.third] : Array(8).fill(""));
      setVietlotDate(currentResult.vietlottRef?.drawDate ?? todayVN());
      setVietlotPeriod(currentResult.vietlottRef?.drawPeriod ?? "");
    } else if (!isOpen) {
      setSpecial(Array(2).fill(""));
      setFirst(Array(4).fill(""));
      setSecond(Array(6).fill(""));
      setThird(Array(8).fill(""));
      setVietlotDate(todayVN());
      setVietlotPeriod("");
      setValidation(VALID);
    }
  }, [isOpen, currentResult]);

  function handleTierChange(tierKey: string, index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "").slice(0, 3);
    const entry = tierValues[tierKey];
    if (!entry) return;
    entry.set((prev) => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });
  }

  function fillRandom() {
    setSpecial(Array.from({ length: 2 }, generateRandomTriplet));
    setFirst(Array.from({ length: 4 }, generateRandomTriplet));
    setSecond(Array.from({ length: 6 }, generateRandomTriplet));
    setThird(Array.from({ length: 8 }, generateRandomTriplet));
    setValidation(VALID);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateMax3dPro(
      TIER_CONFIG.map((t) => ({
        key: t.key,
        label: t.label,
        values: tierValues[t.key]?.get ?? [],
      })),
    );
    setValidation(result);
    if (result.messages.length > 0) return;

    const resultBody = {
      special: special as [string, string],
      first: first as [string, string, string, string],
      second: second as [string, string, string, string, string, string],
      third: third as [string, string, string, string, string, string, string, string],
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

  const filledCount = [special, first, second, third]
    .flat()
    .filter((v) => /^\d{3}$/.test(v)).length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dice3 className="size-4.5 text-pink-500" />
            {isRepublish ? "Sửa kết quả" : "Công bố kết quả"} — Kỳ {draw.drawId}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            Nhập 20 bộ ba số (000–999): 2 ĐB + 4 Nhất + 6 Nhì + 8 Ba.
            {isRepublish && " Kết quả cũ sẽ bị ghi đè."}
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                20 bộ ba số từ &apos;000&apos; đến &apos;999&apos;. Thứ tự 2 bộ Đặc Biệt phân biệt
                giải ĐB/phụ ĐB. Gồm 4 giải: Đặc Biệt (2), Nhất (4), Nhì (6), Ba (8).
              </TooltipContent>
            </Tooltip>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="tabular-nums">
                {filledCount}/20 bộ số
              </Badge>
              <RandomFillButton onFill={fillRandom} />
            </div>

            {TIER_CONFIG.map((tier) => {
              const errors = validation.fieldErrors.get(tier.key);
              const values = tierValues[tier.key]?.get ?? [];
              return (
                <div key={tier.key} className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2.5 rounded-full shrink-0 ${TIER_DOT_STYLES[tier.key]}`}
                    />
                    <Label className="text-sm font-semibold">{tier.label}</Label>
                    {tier.key === "special" && (
                      <span className="text-xs text-muted-foreground">
                        (thứ tự quay có ý nghĩa)
                      </span>
                    )}
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="grid grid-cols-6 gap-2">
                      {Array.from({ length: tier.count }, (_, i) => (
                        <div key={i} className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-muted-foreground text-center">
                            {i + 1}
                          </span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            maxLength={3}
                            value={values[i]}
                            onChange={(e) => handleTierChange(tier.key, i, e.target.value)}
                            className={`w-full text-center font-mono text-sm font-bold tabular-nums ${errors?.has(i) ? "border-destructive" : ""}`}
                            placeholder="000"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

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
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Tùy chọn
                </span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Liên kết kỳ quay với dữ liệu Vietlott chính thức để đối soát. Chỉ sửa tham chiếu
                  (giữ nguyên kết quả) sẽ KHÔNG kích hoạt kết sổ lại.
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
                      onChange={(e) => setVietlotPeriod(e.target.value)}
                    />
                  </div>
                </div>
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
