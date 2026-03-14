"use client";

import { useState } from "react";
import { Check, Loader2, Send, Dice3, HelpCircle } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DevRandomFillButton } from "@/components/dev-random-fill-button";
import { TripletDisplay } from "@/components/games/max3d/triplet-display";
import type { DrawSelectorItem } from "../../../use-operations";
import { usePublishResult } from "../../../use-operations";

const TIER_CONFIG = [
  {
    key: "special" as const,
    label: "Giải Đặc Biệt",
    shortLabel: "ĐB",
    count: 2,
    variant: "special" as const,
    color: "from-amber-400 to-orange-500",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  {
    key: "first" as const,
    label: "Giải Nhất",
    shortLabel: "Nhất",
    count: 4,
    variant: "first" as const,
    color: "from-rose-500 to-pink-600",
    badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
  },
  {
    key: "second" as const,
    label: "Giải Nhì",
    shortLabel: "Nhì",
    count: 6,
    variant: "second" as const,
    color: "from-blue-500 to-indigo-600",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  {
    key: "third" as const,
    label: "Giải Ba",
    shortLabel: "Ba",
    count: 8,
    variant: "third" as const,
    color: "from-emerald-500 to-teal-600",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
];

function generateRandomTriplet(): string {
  return String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}

function validateTriplet(val: string): boolean {
  return /^\d{3}$/.test(val);
}

type TierKey = "special" | "first" | "second" | "third";

interface TripletState {
  special: string[];
  first: string[];
  second: string[];
  third: string[];
}

const INITIAL_STATE: TripletState = {
  special: ["", ""],
  first: ["", "", "", ""],
  second: ["", "", "", "", "", ""],
  third: ["", "", "", "", "", "", "", ""],
};

export function PublishResultAction({
  draw,
  disabled,
  open,
  onOpenChange,
}: {
  draw: DrawSelectorItem;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;
  const [triplets, setTriplets] = useState<TripletState>({ ...INITIAL_STATE });
  const [error, setError] = useState<string | null>(null);
  const publishResult = usePublishResult();

  const isRepublish = draw.status === "published";

  function updateTriplet(tier: TierKey, index: number, value: string) {
    const cleaned = value.replace(/\D/g, "").slice(0, 3);
    setTriplets((prev) => {
      const next = { ...prev };
      next[tier] = [...prev[tier]];
      next[tier][index] = cleaned;
      return next;
    });
    setError(null);
  }

  function fillRandom() {
    setTriplets({
      special: Array.from({ length: 2 }, generateRandomTriplet),
      first: Array.from({ length: 4 }, generateRandomTriplet),
      second: Array.from({ length: 6 }, generateRandomTriplet),
      third: Array.from({ length: 8 }, generateRandomTriplet),
    });
    setError(null);
  }

  function handleSubmit() {
    setError(null);

    for (const tier of TIER_CONFIG) {
      for (let i = 0; i < tier.count; i++) {
        const val = triplets[tier.key][i];
        if (!val || !validateTriplet(val)) {
          setError(`${tier.label} #${i + 1}: phải là 3 chữ số (000–999).`);
          return;
        }
      }
    }

    const body = {
      result: {
        special: triplets.special as [string, string],
        first: triplets.first as [string, string, string, string],
        second: triplets.second as [string, string, string, string, string, string],
        third: triplets.third as [string, string, string, string, string, string, string, string],
      },
    };

    publishResult.mutate(
      { drawId: draw.drawId, body },
      {
        onSuccess: () => {
          setIsOpen(false);
          setTriplets({ ...INITIAL_STATE });
          setError(null);
        },
      },
    );
  }

  const filledCount = Object.values(triplets)
    .flat()
    .filter((v) => validateTriplet(v)).length;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dice3 className="size-5 text-red-500" />
            {isRepublish ? "Sửa kết quả" : "Cập nhật kết quả"} kỳ {draw.drawId}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            Nhập 20 bộ ba số (000–999): 2 ĐB + 4 Nhất + 6 Nhì + 8 Ba.
            {isRepublish && " Kết quả cũ sẽ bị ghi đè."}
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                Mỗi kỳ quay Max 3D Pro có 20 bộ ba số kết quả, phân theo 4 hạng giải. Mỗi bộ là 3
                chữ số từ 000 đến 999.
              </TooltipContent>
            </Tooltip>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="tabular-nums">
              {filledCount}/20 bộ số
            </Badge>
            <DevRandomFillButton onFill={fillRandom} />
          </div>

          {TIER_CONFIG.map((tier) => (
            <div key={tier.key} className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className={`h-1 w-6 rounded-full bg-linear-to-r ${tier.color}`} />
                <Label className="text-sm font-semibold">{tier.label}</Label>
                <Badge variant="outline" className={`text-[10px] border-0 ${tier.badgeClass}`}>
                  {tier.count} bộ
                </Badge>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: tier.count }, (_, i) => {
                    const val = triplets[tier.key][i] ?? "";
                    const isValid = val.length === 3 && validateTriplet(val);
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground w-4 text-right">
                          {i + 1}
                        </span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          maxLength={3}
                          value={val}
                          onChange={(e) => updateTriplet(tier.key, i, e.target.value)}
                          className={`w-16 text-center font-mono text-sm font-bold tabular-nums ${isValid ? "border-green-300 dark:border-green-700" : ""}`}
                          placeholder="000"
                        />
                        {isValid && <TripletDisplay value={val} variant={tier.variant} size="sm" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {filledCount === 20 && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Xem trước kết quả</p>
              <div className="space-y-2">
                {TIER_CONFIG.map((tier) => (
                  <div key={tier.key} className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] border-0 min-w-12 justify-center ${tier.badgeClass}`}
                    >
                      {tier.shortLabel}
                    </Badge>
                    <div className="flex flex-wrap gap-1">
                      {triplets[tier.key].map((val, i) => (
                        <TripletDisplay key={i} value={val} variant={tier.variant} size="sm" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Huỷ bỏ
          </Button>
          <Button onClick={handleSubmit} disabled={publishResult.isPending || disabled}>
            {publishResult.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
