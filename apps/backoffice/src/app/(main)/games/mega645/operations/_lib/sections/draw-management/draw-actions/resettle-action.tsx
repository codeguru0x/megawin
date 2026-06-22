"use client";

/**
 * Mega 6/45 – Resettle Action Dialog
 *
 * Flow 2 bước:
 *   Step 1 – Pre-flight: Hiển thị kết quả đã publish gần nhất (read-only) để staff
 *            rà soát lại lần cuối → gọi API preflight với chính kết quả đó để detect
 *            scenario (TYPE_A / TYPE_B1 / TYPE_B2 / LEDGER_MISSING).
 *   Step 2 – Confirm: Hiển thị scenario card + cảnh báo → staff xác nhận:
 *            - TYPE_A: tự động hoàn toàn → cho phép trigger ngay.
 *            - TYPE_B1: auto payout, Quản trị viên cập nhật cycle (1 kỳ) → cho phép
 *              trigger + cảnh báo buộc staff phải báo Quản trị viên.
 *            - TYPE_B2: cascade từng kỳ — auto payout, Quản trị viên chốt cycle giữa
 *              mỗi bước → cho phép trigger kỳ T (dbaConfirmed) + hiển thị thứ tự cascade.
 *            - LEDGER_MISSING: blocked → bất thường data integrity, báo kỹ thuật.
 *
 * Lưu ý: Mega 6/45 là single jackpot (6/6), KHÔNG có số thưởng (bonus). Staff PHẢI đã
 * gọi publish-result với kết quả mới TRƯỚC khi mở dialog này. Dialog dùng lại kết quả
 * đã publish — KHÔNG yêu cầu nhập lại để tránh sai lệch. Component này chỉ làm pre-flight
 * check và trigger — không tự gọi publish-result.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  XCircle,
  ShieldAlert,
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MEGA645_NUMBER_COUNT } from "@megawin/game-mega645/entities";
import type { DrawSelectorItem, ResettlePreflightOutput } from "../../../use-operations";
import { useResettlePreflight, useTriggerResettle } from "../../../use-operations";
import type { PublishResultCurrentValues } from "./publish-result-action";

interface ResettleActionProps {
  draw: DrawSelectorItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kết quả đã publish gần nhất — nguồn số dùng cho preflight (không nhập lại). */
  currentResult?: PublishResultCurrentValues;
}

// ─── Scenario Badge ───────────────────────────────────────────────────────────

function ScenarioBadge({ scenario }: { scenario: string }) {
  switch (scenario) {
    case "TYPE_A":
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">TYPE_A — Tự động</Badge>;
    case "TYPE_B1":
      return (
        <Badge className="bg-amber-600 hover:bg-amber-600">
          TYPE_B1 — Admin cập nhật Jackpot Cycle
        </Badge>
      );
    case "TYPE_B2":
      return (
        <Badge className="bg-orange-600 hover:bg-orange-600">
          TYPE_B2 — Cascade từng kỳ + Admin chốt cycle
        </Badge>
      );
    case "LEDGER_MISSING":
      return (
        <Badge className="bg-red-600 hover:bg-red-600">
          LEDGER_MISSING — Bất thường, báo kỹ thuật
        </Badge>
      );
    default:
      return <Badge variant="outline">{scenario}</Badge>;
  }
}

// ─── Scenario Card ────────────────────────────────────────────────────────────

function ScenarioCard({ preflight }: { preflight: ResettlePreflightOutput }) {
  const { scenario, message, hasNewJpWinner, hadOldJpWinner, chainLength, chainDrawIds } =
    preflight;

  const isPartial = scenario === "TYPE_B1";
  const isCascade = scenario === "TYPE_B2";
  // Chỉ LEDGER_MISSING mới blocked — bất thường data integrity, không tự xử lý.
  const isBlocked = scenario === "LEDGER_MISSING";
  // B1 + B2 đều cần Quản trị hệ thống chốt cycle → highlight cảnh báo.
  const needsDba = isPartial || isCascade;

  // Winner JP "thay đổi" theo bất kỳ chiều nào → cycle bị ảnh hưởng.
  const jpWinnerAffected = hasNewJpWinner || hadOldJpWinner;
  // Nhãn mô tả chiều thay đổi để staff hiểu chính xác đang xảy ra gì.
  let jpWinnerLabel: string;
  if (hasNewJpWinner && !hadOldJpWinner) {
    jpWinnerLabel = "Xuất hiện mới";
  } else if (!hasNewJpWinner && hadOldJpWinner) {
    jpWinnerLabel = "Bị gỡ bỏ";
  } else if (hasNewJpWinner && hadOldJpWinner) {
    jpWinnerLabel = "Vẫn có (có thể khác)";
  } else {
    jpWinnerLabel = "Không đổi";
  }

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        isBlocked
          ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
          : needsDba
            ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
            : "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
      }`}
    >
      <div className="flex items-start gap-2">
        {isBlocked ? (
          <XCircle className="size-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
        ) : needsDba ? (
          <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        ) : (
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
        )}
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">Kết quả phân tích</span>
            <ScenarioBadge scenario={scenario} />
          </div>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          {jpWinnerAffected ? (
            <AlertTriangle className="size-3 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
          )}
          <span className="text-muted-foreground">Winner JP:</span>
          <span
            className={`font-semibold ${jpWinnerAffected ? "text-amber-600" : "text-emerald-600"}`}
          >
            {jpWinnerLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Info className="size-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Kỳ bị ảnh hưởng:</span>
          <span className="font-semibold">
            {chainLength > 0 ? `+${chainLength} kỳ` : "Chỉ kỳ T"}
          </span>
        </div>
      </div>

      {isPartial && (
        <div className="rounded-md border-2 border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/40 p-3 space-y-1.5">
          <p className="text-sm font-bold flex items-center gap-1.5 text-red-700 dark:text-red-300">
            <AlertTriangle className="size-4 shrink-0" /> BẮT BUỘC báo Quản trị hệ thống
          </p>
          <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
            Kết quả mới làm <span className="font-semibold">thay đổi người trúng Jackpot</span> tại
            kỳ này (xuất hiện mới hoặc gỡ bỏ winner cũ). Hệ thống tự động hoàn tiền và kết sổ lại,
            nhưng <span className="font-semibold">KHÔNG</span> tự cập nhật Jackpot Cycle.
          </p>
          <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
            Bạn <span className="font-semibold">PHẢI thông báo Quản trị hệ thống NGAY</span> để họ
            cập nhật thủ công Jackpot Cycle sau khi kết sổ lại hoàn tất. Nếu bỏ qua bước này, các kỳ
            tiếp theo sẽ tính sai jackpot.
          </p>
        </div>
      )}

      {isCascade && (
        <div className="rounded-md border-2 border-orange-400 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/40 p-3 space-y-1.5">
          <p className="text-sm font-bold flex items-center gap-1.5 text-orange-700 dark:text-orange-300">
            <AlertTriangle className="size-4 shrink-0" /> Cascade từng kỳ — BẮT BUỘC báo Quản trị hệ
            thống
          </p>
          <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
            Sửa kết quả kỳ này ảnh hưởng tới{" "}
            <span className="font-semibold">{chainLength} kỳ đã kết sổ phía sau</span> (cùng cycle).
            Số quay các kỳ sau KHÔNG đổi — chỉ số tiền jackpot đổi. Hệ thống tự hoàn tiền + kết sổ
            lại <span className="font-semibold">TỪNG kỳ</span>, nhưng{" "}
            <span className="font-semibold">KHÔNG</span> tự cập nhật Jackpot Cycle.
          </p>
          {chainDrawIds && chainDrawIds.length > 0 && (
            <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
              Thứ tự cascade (resettle lần lượt):{" "}
              <span className="font-mono font-semibold">{chainDrawIds.join(" → ")}</span>. Sau mỗi
              kỳ, Quản trị hệ thống chốt cycle rồi mới sang kỳ kế tiếp.
            </p>
          )}
          <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
            Bạn <span className="font-semibold">PHẢI phối hợp Quản trị hệ thống</span> chốt Jackpot
            Cycle sau mỗi kỳ. Resettle kỳ sau khi kỳ trước chưa xong sẽ bị chặn
            (RESETTLE_CASCADE_ORDER).
          </p>
        </div>
      )}

      {isBlocked && (
        <div className="text-xs text-red-700 dark:text-red-300 space-y-1">
          <p className="font-semibold flex items-center gap-1">
            <XCircle className="size-3" /> Bất thường — không tự xử lý:
          </p>
          <p>
            Kỳ này đã kết sổ nhưng thiếu ledger entry — bất thường về data integrity, không xảy ra
            trong vận hành bình thường. Dừng resettle và báo đội kỹ thuật kiểm tra.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export function ResettleAction({ draw, open, onOpenChange, currentResult }: ResettleActionProps) {
  const [step, setStep] = useState<"preflight" | "confirm">("preflight");
  const [preflightResult, setPreflightResult] = useState<ResettlePreflightOutput | null>(null);

  const { mutate: runPreflight, isPending: isPreflighting } = useResettlePreflight();
  const { mutate: triggerResettle, isPending: isTriggering } = useTriggerResettle();

  // Kết quả đã publish gần nhất — nguồn số cho preflight. Không nhập lại.
  const numbers = currentResult?.winningNumbers ?? [];
  const hasResult = numbers.length === MEGA645_NUMBER_COUNT;

  const handleClose = () => {
    if (isPreflighting || isTriggering) return;
    onOpenChange(false);
    // Reset state khi đóng dialog.
    setTimeout(() => {
      setStep("preflight");
      setPreflightResult(null);
    }, 300);
  };

  const handlePreflight = () => {
    if (!hasResult) return;

    runPreflight(
      {
        drawId: draw.drawId,
        proposedWinningNumbers: numbers,
      },
      {
        onSuccess: (result) => {
          setPreflightResult(result);
          setStep("confirm");
        },
      },
    );
  };

  const handleConfirm = () => {
    if (!preflightResult) return;
    // TYPE_B1 + TYPE_B2 cần xác nhận đã phối hợp Quản trị viên chốt cycle.
    const dbaConfirmed =
      preflightResult.scenario === "TYPE_B1" || preflightResult.scenario === "TYPE_B2";
    const scenario = preflightResult.scenario;
    const nextDrawId = preflightResult.chainDrawIds?.[0];

    triggerResettle(
      { drawId: draw.drawId, body: { dbaConfirmed } },
      {
        onSuccess: () => {
          handleClose();
          if (scenario === "TYPE_B2") {
            toast.warning(
              nextDrawId
                ? `Đợi hệ thống hoàn tất và Quản trị viên chốt Jackpot Cycle trước khi trigger kỳ kế (${nextDrawId}).`
                : "Đợi hệ thống hoàn tất và Quản trị viên chốt Jackpot Cycle trước khi trigger kỳ kế.",
              { duration: 10_000 },
            );
          } else if (scenario === "TYPE_B1") {
            toast.warning("Quản trị viên cần chốt Jackpot Cycle sau khi hệ thống hoàn tất.", {
              duration: 8_000,
            });
          }
        },
      },
    );
  };

  // Chỉ LEDGER_MISSING bị chặn — bất thường data integrity. TYPE_B2 cho phép cascade từng kỳ.
  const canTrigger = preflightResult !== null && preflightResult.scenario !== "LEDGER_MISSING";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-4 text-orange-500" />
            Kết sổ lại — {draw.drawId}
          </DialogTitle>
          <DialogDescription>
            {step === "preflight"
              ? "Rà soát lại kết quả đã sửa rồi phân tích tác động trước khi kết sổ lại."
              : "Xem kết quả phân tích và xác nhận để bắt đầu kết sổ lại."}
          </DialogDescription>
        </DialogHeader>

        {step === "preflight" && (
          <div className="space-y-4">
            {hasResult ? (
              <>
                {/* Note nhắc staff rà soát kết quả mới lần cuối */}
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3">
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    Đây là kết quả <span className="font-semibold">đã sửa</span> của kỳ này. Vui lòng
                    kiểm tra lại lần cuối trước khi phân tích tác động. Nếu sai, đóng dialog và bấm{" "}
                    <span className="font-semibold">"Sửa kết quả"</span> để cập nhật lại.
                  </p>
                </div>

                {/* Kết quả đã publish (read-only) — Mega 6/45 không có số thưởng */}
                <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Kết quả đã sửa</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {numbers.map((n, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center justify-center size-7 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs font-bold font-mono"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3">
                <XCircle className="size-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                  Chưa có kết quả để kết sổ lại. Hãy bấm{" "}
                  <span className="font-semibold">"Sửa kết quả"</span> để công bố kết quả trước.
                </p>
              </div>
            )}
          </div>
        )}

        {step === "confirm" && preflightResult && (
          <div className="space-y-4">
            {/* Summary kết quả đã sửa */}
            <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Kết quả đã sửa</p>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1">
                  {numbers.map((n, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center justify-center size-7 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs font-bold font-mono"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <ScenarioCard preflight={preflightResult} />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={isTriggering}>
            Hủy
          </Button>

          {step === "preflight" && (
            <Button size="sm" onClick={handlePreflight} disabled={!hasResult || isPreflighting}>
              {isPreflighting ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Đang phân tích...
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5 mr-1.5" /> Phân tích tác động
                </>
              )}
            </Button>
          )}

          {step === "confirm" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("preflight")}
                disabled={isTriggering}
              >
                ← Quay lại
              </Button>
              {canTrigger && (
                <Button
                  size="sm"
                  className={
                    preflightResult?.scenario === "TYPE_B1"
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-orange-600 hover:bg-orange-700 text-white"
                  }
                  onClick={handleConfirm}
                  disabled={isTriggering}
                >
                  {isTriggering ? (
                    <>
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Đang khởi chạy...
                    </>
                  ) : preflightResult?.scenario === "TYPE_B1" ? (
                    <>
                      <AlertTriangle className="size-3.5 mr-1.5" /> Đã báo Admin — Kết sổ lại
                    </>
                  ) : preflightResult?.scenario === "TYPE_B2" ? (
                    <>
                      <AlertTriangle className="size-3.5 mr-1.5" /> Cascade kỳ này — Kết sổ lại
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-3.5 mr-1.5" /> Bắt đầu kết sổ lại
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
