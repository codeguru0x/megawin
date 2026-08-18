"use client";

/**
 * AI Chat — renderer bespoke (Tier 2, xem ranh giới cứng đầu `view-spec.ts`) cho 2 trong 4 tool
 * "hằng ngày" (§8 p1-03) mà `ToolViewSpec` không mô tả nổi trong 1 `ToolView`:
 *
 * - `getOpsSnapshot`: `snapshot` là `unknown` — dispatcher gộp 7 game, mỗi game 1 DTO khác field
 *   đặc thù (exposure 1-pool vs 2-pool, shape `topCombos`…). Chỉ đọc field CHUNG đã xác nhận
 *   giống nhau ở cả 7 DTO (`stats.totals` kế thừa `DrawBettingTotals`, `topAccounts` kế thừa
 *   `TopAccountStat`, `alertCounts.new`) — KHÔNG đoán field đặc thù game để tránh hiện số sai.
 * - `getIntegrationHealth`: 3 nguồn độc lập (dispatch KPI, stuck orders, worker health), mỗi
 *   nguồn có thể `unavailable: true` — cần hiển thị RIÊNG từng khối, 1 `ToolView` không làm được.
 *
 * `getDrawsOverview` dùng spec Tier 1 (`ops-views.ts`) — không cần bespoke.
 *
 * Cả 2 renderer bọc `ToolResultLine` (dòng gạch đóng sẵn) giống `specRenderer` ở `registry.tsx` —
 * bespoke không được là ngoại lệ "card luôn mở" giữa danh sách các dòng đóng. Tiêu đề vì thế nằm ở
 * DÒNG GẠCH, không nằm trong thân card (để cả hai chỗ sẽ ra hai lần cùng một chữ).
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import { GAME_LABELS, getDrawStatusLabel } from "@megawin/game-core/labels";
import { isAppError } from "@megawin/shared/errors";
import { WORKER_RUN_STATE_LABELS } from "@megawin/worker-core/shared/labels";
import { WorkerRunState } from "@megawin/worker-core/use-cases/admin/types";
import type { EveDynamicToolPart } from "eve/react";

import { CardContent } from "@/components/ui/card";
import type { GetIntegrationHealthOutput } from "@/server/ai/integration/types";
import type { GetOpsSnapshotDispatchOutput, OpsDispatchMeta } from "@/server/ai/operations/types";

import { CellFormat, formatCell } from "./format-cell";
import { CardShell, DataTable, DeepLink, EmptyCard, KpiTile, ToolErrorCard, ToolResultLine } from "./generic-tool-view";
import type { ColumnSpec } from "./view-spec";

// ─── Unwrap chung cho mọi tool bespoke ở file này ──────────────────────────────

type UnwrapResult<T> = { kind: "error"; message: string } | { kind: "data"; data: T };

/**
 * Unwrap `ToolResult<T>` (xem `server/ai/tool-result.ts`) — bản rút gọn của
 * `resolveToolViewData` (`generic-tool-view.tsx`) nhưng trả nguyên `data` thay vì rows, vì card
 * bespoke ở đây tự quyết định cách bóc nhiều khối trong `data`.
 */
function unwrapToolOutput<T>(output: unknown): UnwrapResult<T> | null {
  if (typeof output !== "object" || output === null || !("success" in output)) {
    return null;
  }
  const result = output as { success: boolean; data?: unknown; error?: unknown };
  if (!result.success) {
    return {
      kind: "error",
      message: isAppError(result.error) ? result.error.message : "Tool trả về lỗi không xác định.",
    };
  }
  return { kind: "data", data: result.data as T };
}

function numOr0(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function strOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/** `gameId`/`gameProduct` ở raw sub-block là `string` thô — tra nhãn có fallback về chính ID. */
function gameLabel(gameProduct: string): string {
  return GAME_LABELS[gameProduct as keyof typeof GAME_LABELS] ?? gameProduct;
}

// ─── getOpsSnapshot ─────────────────────────────────────────────────────────

/** Field CHUNG của `DrawBettingTotals` (`game-core/types/betting-stats.ts`) — mọi game đều có. */
interface RawTotals {
  revenue?: unknown;
  entries?: unknown;
  sets?: unknown;
  largeBetCount?: unknown;
}

/** Field CHUNG của `TopAccountStat` (`game-core/types/betting-stats.ts`). */
interface RawTopAccount {
  accountId?: unknown;
  username?: unknown;
  amount?: unknown;
  entries?: unknown;
}

/**
 * Field top-combo KHÔNG chung 100% giữa các game (Keno: `numbers`; Lotto/Mega/Power:
 * `mainNumbers`/`specialNumbers`) — đọc theo thứ tự ưu tiên, KHÔNG throw khi thiếu field.
 */
interface RawTopCombo {
  comboKey?: unknown;
  numbers?: unknown;
  mainNumbers?: unknown;
  specialNumbers?: unknown;
  sets?: unknown;
  accounts?: unknown;
  amount?: unknown;
}

interface RawOpsSnapshot {
  drawStatus?: unknown;
  stats?: { totals?: RawTotals } | null;
  uniquePlayers?: unknown;
  alertCounts?: Record<string, unknown>;
  topAccounts?: unknown;
  topCombos?: unknown;
}

function comboLabel(raw: RawTopCombo): string {
  if (Array.isArray(raw.numbers)) {
    return raw.numbers.join(", ");
  }
  if (Array.isArray(raw.mainNumbers)) {
    const special =
      Array.isArray(raw.specialNumbers) && raw.specialNumbers.length > 0 ? ` | ĐB ${raw.specialNumbers.join(",")}` : "";
    return `${raw.mainNumbers.join(",")}${special}`;
  }
  return strOr(raw.comboKey, "—");
}

interface TopAccountRow {
  label: string;
  amount: number;
  entries: number;
}

const TOP_ACCOUNT_COLUMNS: readonly ColumnSpec<TopAccountRow>[] = [
  { key: "label", label: "Người chơi" },
  { key: "amount", label: "Tiền cược", format: CellFormat.Vnd },
  { key: "entries", label: "Vé", format: CellFormat.Number },
];

interface TopComboRow {
  label: string;
  sets: number;
  accounts: number;
  amount: number;
}

const TOP_COMBO_COLUMNS: readonly ColumnSpec<TopComboRow>[] = [
  { key: "label", label: "Combo" },
  { key: "sets", label: "Bộ cược", format: CellFormat.Number },
  { key: "accounts", label: "Account", format: CellFormat.Number },
  { key: "amount", label: "Tiền cược", format: CellFormat.Vnd },
];

/**
 * Nhãn dòng gạch cho `getOpsSnapshot` — gồm cả trạng thái kỳ.
 *
 * Trạng thái nằm ở NHÃN (không trong thân card) vì đóng lại thì nhãn là thứ duy nhất còn thấy, và
 * "kỳ này đang mở hay đã settle" thường là điều staff cần biết trước cả các con số.
 */
function opsSnapshotTitle(meta: OpsDispatchMeta, snapshotRaw: unknown): string {
  const head = `${meta.gameLabel} · Kỳ ${meta.drawId}`;
  if (typeof snapshotRaw !== "object" || snapshotRaw === null) {
    return head;
  }
  const drawStatus = (snapshotRaw as RawOpsSnapshot).drawStatus;
  if (typeof drawStatus !== "string") {
    return head;
  }
  return `${head} · ${getDrawStatusLabel(drawStatus as DrawStatus)}`;
}

function OpsSnapshotCard({ meta, snapshotRaw }: { meta: OpsDispatchMeta; snapshotRaw: unknown }) {
  if (typeof snapshotRaw !== "object" || snapshotRaw === null) {
    return <EmptyCard text={`Kỳ ${meta.drawId} (${meta.gameLabel}) chưa có dữ liệu snapshot vận hành.`} />;
  }
  const raw = snapshotRaw as RawOpsSnapshot;
  const totals = raw.stats?.totals;
  const alertNew = numOr0(raw.alertCounts?.new);
  const topAccounts = Array.isArray(raw.topAccounts) ? (raw.topAccounts as RawTopAccount[]) : [];
  const topCombos = Array.isArray(raw.topCombos) ? (raw.topCombos as RawTopCombo[]) : [];

  const accountRows: TopAccountRow[] = topAccounts.slice(0, 5).map((a) => ({
    label: strOr(a.username, strOr(a.accountId, "—")),
    amount: numOr0(a.amount),
    entries: numOr0(a.entries),
  }));
  const comboRows: TopComboRow[] = topCombos.slice(0, 5).map((c) => ({
    label: comboLabel(c),
    sets: numOr0(c.sets),
    accounts: numOr0(c.accounts),
    amount: numOr0(c.amount),
  }));

  return (
    <CardShell>
      <CardContent className="space-y-3 px-3">
        {totals === undefined ? (
          <p className="text-muted-foreground text-xs">Kỳ chưa có cược — chưa có dữ liệu thống kê.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <KpiTile label="Doanh thu" value={formatCell(numOr0(totals.revenue), CellFormat.VndCompact)} />
            <KpiTile label="Vé" value={formatCell(numOr0(totals.entries), CellFormat.Number)} />
            <KpiTile label="Người chơi" value={formatCell(numOr0(raw.uniquePlayers), CellFormat.Number)} />
            <KpiTile label="Bộ cược" value={formatCell(numOr0(totals.sets), CellFormat.Number)} />
            <KpiTile label="Cược lớn" value={formatCell(numOr0(totals.largeBetCount), CellFormat.Number)} />
            <KpiTile
              label="Alert mới"
              value={formatCell(alertNew, CellFormat.Number)}
              valueClassName={alertNew > 0 ? "text-destructive" : undefined}
            />
          </div>
        )}
        {accountRows.length > 0 && (
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs">Top người chơi cược nhiều</p>
            <DataTable columns={TOP_ACCOUNT_COLUMNS} rows={accountRows} />
          </div>
        )}
        {comboRows.length > 0 && (
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs">Top combo bị dồn cược</p>
            <DataTable columns={TOP_COMBO_COLUMNS} rows={comboRows} />
          </div>
        )}
        <DeepLink
          href={`/games/${meta.game}/operations?drawId=${encodeURIComponent(meta.drawId)}`}
          label="Mở trang vận hành"
        />
      </CardContent>
    </CardShell>
  );
}

/** Renderer bespoke cho `getOpsSnapshot` — đăng ký ở `registry.tsx`. */
export function renderOpsSnapshot(part: EveDynamicToolPart) {
  const unwrapped = unwrapToolOutput<GetOpsSnapshotDispatchOutput>("output" in part ? part.output : undefined);
  if (unwrapped === null) {
    return null;
  }
  if (unwrapped.kind === "error") {
    return <ToolErrorCard message={unwrapped.message} />;
  }
  const { meta, snapshot } = unwrapped.data;
  // Bọc dòng gạch giống `specRenderer` (`registry.tsx`) — mọi tool cùng một hình thái, bespoke
  // không được là ngoại lệ "card luôn mở" giữa danh sách các dòng đóng.
  return (
    <ToolResultLine title={opsSnapshotTitle(meta, snapshot)}>
      <OpsSnapshotCard meta={meta} snapshotRaw={snapshot} />
    </ToolResultLine>
  );
}

// ─── getIntegrationHealth ───────────────────────────────────────────────────

/** Field cần của `DispatchSummary` (`tenant-dispatch/infras/repos/types`) — đọc defensively vì `data` khai `unknown` ở `IntegrationHealthBlock`. */
interface RawDispatchSummary {
  pending?: unknown;
  dispatched?: unknown;
  stuck?: unknown;
  retrying?: unknown;
}

/** Field cần của `TenantDispatchOrderEntity` cho 1 dòng bảng stuck order. */
interface RawStuckOrder {
  gameId?: unknown;
  username?: unknown;
  amount?: unknown;
  retryCount?: unknown;
  lastError?: unknown;
}

/** Field cần của `WorkerHealthRow` cho 1 dòng bảng worker cần chú ý. */
interface RawWorkerHealthRow {
  lockKey?: unknown;
  state?: unknown;
  secondsSinceSuccess?: unknown;
  lastError?: unknown;
  stalledItems?: unknown;
}

interface StuckOrderRow {
  label: string;
  amount: number;
  retryCount: number;
  lastError: string;
}

const STUCK_ORDER_COLUMNS: readonly ColumnSpec<StuckOrderRow>[] = [
  { key: "label", label: "Đơn (game · username)" },
  { key: "amount", label: "Số tiền", format: CellFormat.Vnd },
  { key: "retryCount", label: "Retry", format: CellFormat.Number },
  { key: "lastError", label: "Lỗi gần nhất" },
];

interface WorkerHealthDisplayRow {
  lockKey: string;
  stateLabel: string;
  secondsSinceSuccess: number;
  lastError: string;
}

const WORKER_HEALTH_COLUMNS: readonly ColumnSpec<WorkerHealthDisplayRow>[] = [
  { key: "lockKey", label: "Worker" },
  { key: "stateLabel", label: "Trạng thái" },
  { key: "secondsSinceSuccess", label: "Giây từ lần chạy OK", format: CellFormat.Number },
  { key: "lastError", label: "Lỗi gần nhất" },
];

/** `data` của block là `unknown` — `null` khi `unavailable` hoặc shape không như mong đợi. */
function readBlockData<T>(block: { unavailable: boolean; data?: unknown } | undefined): T | null {
  if (block === undefined || block.unavailable || block.data === undefined) {
    return null;
  }
  return block.data as T;
}

function IntegrationHealthCard({ output }: { output: GetIntegrationHealthOutput }) {
  const summary = readBlockData<RawDispatchSummary>(output.dispatchSummary);
  // `ListStuckOrdersOutput = { data: TenantDispatchOrderEntity[] }` — bóc thêm 1 tầng `.data`.
  const stuckOrdersRaw = readBlockData<{ data?: unknown }>(output.stuckOrders);
  const stuckOrders = Array.isArray(stuckOrdersRaw?.data) ? (stuckOrdersRaw.data as RawStuckOrder[]) : [];
  // `ListWorkersHealthOutput = WorkerHealthRow[]` — mảng trực tiếp, không bọc `.data`.
  const workersHealthRaw = readBlockData<unknown>(output.workersHealth);
  const workersHealth = Array.isArray(workersHealthRaw) ? (workersHealthRaw as RawWorkerHealthRow[]) : [];

  const attentionWorkers = workersHealth.filter((w) => {
    const state = w.state;
    const stalled = Array.isArray(w.stalledItems) ? w.stalledItems.length : 0;
    return state === WorkerRunState.Crashed || state === WorkerRunState.Disabled || stalled > 0;
  });

  const stuckOrderRows: StuckOrderRow[] = stuckOrders.slice(0, 5).map((o) => ({
    label: `${gameLabel(strOr(o.gameId, "—"))} · ${strOr(o.username, "—")}`,
    amount: numOr0(o.amount),
    retryCount: numOr0(o.retryCount),
    lastError: strOr(o.lastError, "—"),
  }));

  const workerRows: WorkerHealthDisplayRow[] = attentionWorkers.slice(0, 5).map((w) => {
    const state = typeof w.state === "string" ? (w.state as WorkerRunState) : null;
    return {
      lockKey: strOr(w.lockKey, "—"),
      stateLabel: state === null ? "—" : WORKER_RUN_STATE_LABELS[state],
      secondsSinceSuccess: numOr0(w.secondsSinceSuccess),
      lastError: strOr(w.lastError, "—"),
    };
  });

  return (
    <CardShell>
      <CardContent className="space-y-3 px-3">
        {summary === null ? (
          <p className="text-muted-foreground text-xs">Không lấy được số liệu dispatch outbox.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <KpiTile label="Đang chờ" value={formatCell(numOr0(summary.pending), CellFormat.Number)} />
            <KpiTile label="Đã gửi" value={formatCell(numOr0(summary.dispatched), CellFormat.Number)} />
            <KpiTile
              label="Đang retry"
              value={formatCell(numOr0(summary.retrying), CellFormat.Number)}
              valueClassName={numOr0(summary.retrying) > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
            />
            <KpiTile
              label="Stuck"
              value={formatCell(numOr0(summary.stuck), CellFormat.Number)}
              valueClassName={numOr0(summary.stuck) > 0 ? "text-destructive" : undefined}
            />
          </div>
        )}
        {stuckOrdersRaw === null ? (
          <p className="text-muted-foreground text-xs">Không lấy được danh sách đơn dispatch bị kẹt.</p>
        ) : stuckOrderRows.length > 0 ? (
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs">Đơn dispatch bị kẹt (retry cao)</p>
            <DataTable columns={STUCK_ORDER_COLUMNS} rows={stuckOrderRows} />
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">Không có đơn dispatch nào bị kẹt.</p>
        )}
        {workersHealthRaw === null ? (
          <p className="text-muted-foreground text-xs">Không lấy được trạng thái worker.</p>
        ) : workerRows.length > 0 ? (
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs">Worker cần chú ý</p>
            <DataTable columns={WORKER_HEALTH_COLUMNS} rows={workerRows} />
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">Tất cả worker đang chạy bình thường.</p>
        )}
        <DeepLink href="/system/workers" label="Mở trang sức khoẻ hệ thống" />
      </CardContent>
    </CardShell>
  );
}

/** Renderer bespoke cho `getIntegrationHealth` — đăng ký ở `registry.tsx`. */
export function renderIntegrationHealth(part: EveDynamicToolPart) {
  const unwrapped = unwrapToolOutput<GetIntegrationHealthOutput>("output" in part ? part.output : undefined);
  if (unwrapped === null) {
    return null;
  }
  if (unwrapped.kind === "error") {
    return <ToolErrorCard message={unwrapped.message} />;
  }
  return (
    <ToolResultLine title="Sức khoẻ tích hợp">
      <IntegrationHealthCard output={unwrapped.data} />
    </ToolResultLine>
  );
}
