"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiClientError } from "@megawin/next/client";
import type { ObservationEntity, ResultFeedGameKey } from "@megawin/resultfeed/entities";
import { ConsensusState } from "@megawin/resultfeed/entities";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { AlertCircle, Check, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  CONSENSUS_STATE_LABELS,
  CONSENSUS_STATE_VARIANT,
  INTRINSIC_STATE_LABELS,
  INTRINSIC_STATE_VARIANT,
  RESULTFEED_GAME_LABELS,
  SOURCE_ROLE_LABELS,
} from "../_lib/labels";
import { useConsensusPeriod, useRejectConsensus, useVerifyConsensus } from "../_lib/use-queries";

export interface PeriodDetailContentProps {
  gameKey: ResultFeedGameKey | null;
  drawPeriod: string | null;
  /** `true` ⇒ chỉ xem, ẩn hết action verify/reject — dùng cho trang `periods` (tra cứu). */
  readOnly?: boolean;
  /** Gọi sau khi verify/reject thành công — sheet dùng để tự đóng, `periods` không cần. */
  onDone?: () => void;
}

/** Tách chuỗi nhập tay (dấu phẩy/khoảng trắng) → mảng số, bỏ phần tử rỗng. */
function parseManualNumbers(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** So từng vị trí giữa các mảng số (cùng độ dài) → tập index lệch, dùng highlight diff. */
function diffIndices(lists: string[][]): Set<number> {
  const diff = new Set<number>();
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    const values = new Set(lists.map((l) => l[i]));
    if (values.size > 1) {
      diff.add(i);
    }
  }
  return diff;
}

function NumbersRow({ numbers, diff }: { numbers: string[]; diff: Set<number> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {numbers.map((n, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: thứ tự phần tử CHÍNH LÀ dữ liệu hiển thị (không sort lại), số có thể trùng giá trị (VD bingo18) nên không có key nào ổn định hơn index.
          key={`${i}-${n}`}
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-xs tabular-nums",
            diff.has(i) ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border bg-muted/40",
          )}
        >
          {n}
        </span>
      ))}
    </div>
  );
}

function ObservationCard({
  observation,
  role,
  trustWeight,
  isChosen,
  diff,
  selectable,
}: {
  observation: ObservationEntity;
  role: string | undefined;
  trustWeight: number | undefined;
  isChosen: boolean;
  diff: Set<number>;
  selectable: boolean;
}) {
  return (
    <label
      htmlFor={selectable ? `obs-${observation.id}` : undefined}
      className={cn(
        "flex w-full flex-col gap-2 rounded-md border p-3 text-left transition-colors",
        isChosen ? "border-primary bg-primary/5" : "border-border",
        selectable && !isChosen && "cursor-pointer hover:bg-muted/40",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {selectable && <RadioGroupItem value={observation.id} id={`obs-${observation.id}`} />}
          <span className="font-medium font-mono text-sm">{observation.sourceId}</span>
          {role && (
            <Badge variant="outline" className="text-xs">
              {role}
            </Badge>
          )}
          {trustWeight !== undefined && <span className="text-muted-foreground text-xs">trust {trustWeight}</span>}
        </div>
        <Badge variant={INTRINSIC_STATE_VARIANT[observation.intrinsicState]}>
          {INTRINSIC_STATE_LABELS[observation.intrinsicState]}
        </Badge>
      </div>

      <NumbersRow numbers={observation.numbersDisplay} diff={diff} />

      {observation.numbersCanonical.join(",") !== observation.numbersDisplay.join(",") && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span>Canonical:</span>
          <span className="font-mono">{observation.numbersCanonical.join(", ")}</span>
        </div>
      )}

      {observation.intrinsicMismatch && <p className="text-destructive text-xs">{observation.intrinsicMismatch}</p>}
    </label>
  );
}

/**
 * Nội dung chi tiết 1 kỳ — dùng chung cho sheet `review` (có action verify/reject) và trang
 * `periods` (view-only, `readOnly=true`). Diff nổi bật từng số giữa các nguồn,
 * `IntrinsicState`, role/trustWeight tách nhau (`07-admin-management-page.plan.md §6-7`).
 */
export function PeriodDetailContent({ gameKey, drawPeriod, readOnly, onDone }: PeriodDetailContentProps) {
  const query = useConsensusPeriod(gameKey, drawPeriod);
  const verifyMutation = useVerifyConsensus(gameKey ?? "", drawPeriod ?? "");
  const rejectMutation = useRejectConsensus(gameKey ?? "", drawPeriod ?? "");

  const [chosenObservationId, setChosenObservationId] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [note, setNote] = useState("");
  const [confirmMismatch, setConfirmMismatch] = useState(false);
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);

  // Reset form mỗi khi mở kỳ khác.
  useEffect(() => {
    setChosenObservationId(null);
    setManualMode(false);
    setManualInput("");
    setNote("");
    setConfirmMismatch(false);
    setMismatchWarning(null);
  }, []);

  const observations = query.data?.observations ?? [];
  const consensus = query.data?.consensus;

  const diff = useMemo(() => diffIndices(observations.map((o) => o.numbersDisplay)), [observations]);

  const isActionable =
    !readOnly &&
    !!consensus &&
    (consensus.state === ConsensusState.Conflict || consensus.state === ConsensusState.Pending);

  function handleVerify() {
    const manualNumbers = manualMode ? parseManualNumbers(manualInput) : undefined;
    verifyMutation.mutate(
      {
        chosenObservationId: manualMode ? null : chosenObservationId,
        manualNumbers,
        note: note.trim() || undefined,
        confirmMismatch,
      },
      {
        onSuccess: () => onDone?.(),
        onError: (err) => {
          if (err instanceof ApiClientError && err.code === "RESULTFEED_MANUAL_CHECKSUM_MISMATCH") {
            setMismatchWarning(err.message);
            return;
          }
          setMismatchWarning(null);
        },
      },
    );
  }

  function handleReject() {
    if (!note.trim()) {
      return;
    }
    rejectMutation.mutate(note.trim(), { onSuccess: () => onDone?.() });
  }

  const canVerify = manualMode ? parseManualNumbers(manualInput).length > 0 : !!chosenObservationId;

  if (query.isLoading) {
    return (
      <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Đang tải…</span>
      </div>
    );
  }

  if (query.isError || !consensus) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <AlertCircle className="size-8 text-destructive/60" />
        <p className="font-medium text-destructive text-sm">
          {query.isError ? "Không tải được chi tiết kỳ này." : "Chưa có dữ liệu cho kỳ này."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-base">
            {RESULTFEED_GAME_LABELS[consensus.gameKey]} · Kỳ {consensus.drawPeriod}
          </span>
          <Badge variant={CONSENSUS_STATE_VARIANT[consensus.state]}>{CONSENSUS_STATE_LABELS[consensus.state]}</Badge>
        </div>

        {consensus.humanVerify && (
          <div className="flex flex-col gap-1 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
            <span className="font-medium text-primary">
              Đã xác nhận bởi {consensus.humanVerify.username} — {displayVNDateTime(consensus.humanVerify.verifiedAt)}
            </span>
            {consensus.humanVerify.note && <span className="text-muted-foreground">{consensus.humanVerify.note}</span>}
          </div>
        )}

        {consensus.numbers && (
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Kết quả đã chốt</span>
            <NumbersRow numbers={consensus.numbers} diff={new Set()} />
          </div>
        )}

        <Separator />

        <div className="flex flex-col gap-2">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Observations ({observations.length})
          </span>

          <RadioGroup
            value={manualMode ? "" : (chosenObservationId ?? "")}
            onValueChange={(v) => {
              setManualMode(false);
              setChosenObservationId(v);
            }}
            className="gap-2"
          >
            {observations.map((obs) => {
              const agreement = [...consensus.agreeing, ...consensus.conflicting].find(
                (a) => a.observationId === obs.id,
              );
              return (
                <ObservationCard
                  key={obs.id}
                  observation={obs}
                  role={agreement ? SOURCE_ROLE_LABELS[agreement.role] : undefined}
                  trustWeight={agreement?.trustWeight}
                  isChosen={!manualMode && chosenObservationId === obs.id}
                  diff={diff}
                  selectable={isActionable}
                />
              );
            })}
          </RadioGroup>
        </div>

        {isActionable && (
          <>
            <Separator />

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="manual-mode"
                  checked={manualMode}
                  onCheckedChange={(v) => {
                    setManualMode(!!v);
                    if (v) {
                      setChosenObservationId(null);
                    }
                  }}
                />
                <Label htmlFor="manual-mode" className="text-sm">
                  Nhập tay số kết quả (không nguồn nào đúng)
                </Label>
              </div>

              {manualMode && (
                <Textarea
                  placeholder="Nhập số, cách nhau bởi dấu phẩy hoặc khoảng trắng — đúng thứ tự công bố"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="font-mono text-sm"
                />
              )}

              {mismatchWarning && (
                <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 text-xs dark:text-amber-300">
                  <p>{mismatchWarning}</p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="confirm-mismatch"
                      checked={confirmMismatch}
                      onCheckedChange={(v) => setConfirmMismatch(!!v)}
                    />
                    <Label htmlFor="confirm-mismatch" className="text-xs">
                      Vẫn dùng số này (đã kiểm tra kỹ)
                    </Label>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="verify-note" className="text-muted-foreground text-xs">
                  Lý do (bắt buộc khi nhập tay hoặc khác kết quả máy đang giữ)
                </Label>
                <Textarea
                  id="verify-note"
                  placeholder="VD: nguồn A bị lỗi trang, dùng nguồn B đối chiếu thủ công."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {isActionable && (
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={!note.trim() || rejectMutation.isPending}
            onClick={handleReject}
          >
            {rejectMutation.isPending ? "Đang từ chối…" : "Từ chối kỳ này"}
          </Button>
          <Button className="gap-1.5" disabled={!canVerify || verifyMutation.isPending} onClick={handleVerify}>
            {verifyMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Xác nhận kết quả
          </Button>
        </div>
      )}
    </div>
  );
}
