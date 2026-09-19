"use client";

import type { CSSProperties } from "react";

/**
 * Keno – Analytics Panels
 *
 * PlayTypeCard: layout 2 cột, style card đồng nhất cho cả Pick và Side Bets.
 *   - Trái: Pick 1–10 grid 5×2 — mỗi pick là 1 card nhỏ. Donut 48px (đủ rộng cho "100%")
 *     nổi `absolute` góc phải-trên, KHÔNG chiếm chỗ trong flex flow → header label vẫn
 *     thấp như cũ, card không bị kéo cao theo kích thước donut.
 *   - Phải: Side bets (Lớn/Nhỏ, Chẵn/Lẻ) — 2 card lớn stretch full height.
 *   Cả hai cột dùng cùng card pattern: tinted bg + border + donut + KPI số.
 * TenantBreakdownCard: doanh thu / hoa hồng theo đại lý.
 */
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { KENO_BASIC_PLAY_TYPES, type KenoPlayType } from "@megawin/game-keno/entities";
import { KENO_PLAY_TYPE_LABELS } from "@megawin/game-keno/labels";
import { formatNumber } from "@megawin/shared/utils";
import { BarChart2, Receipt, Store, TrendingUp, TriangleAlert, Trophy, Users } from "lucide-react";

import { PlayerOutstandingLink } from "@/components/player-name";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { KENO_PICK_STYLES, KENO_SIDE_BET_STYLES } from "../../ops-constants";
import type { PlayTypeRow, SideBetPair, TenantRow, TopAccountRow, TopComboRow, TopPotentialRow } from "../../types";
import { NumberBadge } from "./number-heatmap";

// ─── Shared Mini Donut ─────────────────────────────────────────────────────────

function MiniDonut({
  pct,
  fill,
  size,
  className,
}: {
  pct: number;
  fill: string;
  size: number;
  /** Cho phép định vị donut (VD `absolute`) mà không đẩy layout flow xung quanh. */
  className?: string;
}) {
  // stroke chiếm 4-5px mỗi bên, radius = (size - stroke*2) / 2
  const stroke = size < 40 ? 4 : 5;
  const r = (size - stroke * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(pct, 0), 99.9);
  const filled = (clamped / 100) * circumference;
  const label = `${Math.round(pct)}%`;
  // "100%" (4 ký tự) rộng hơn "0%"-"99%" (≤3 ký tự) — giảm nhẹ font để luôn nằm
  // trong đường viền tròn, tránh tràn ra ngoài khi giá trị chạm 100%.
  const baseFontSize = size < 40 ? 7.5 : 9;
  const fontSize = label.length >= 4 ? baseFontSize - 1.5 : baseFontSize;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("shrink-0", className)}>
      <title>{label}</title>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/60" />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={fill}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={700}
        fill={fill}
        fontFamily="inherit"
      >
        {label}
      </text>
    </svg>
  );
}

// ─── Pick Card (compact, 5×2 grid) ────────────────────────────────────────────

function PickCard({ row }: { row: PlayTypeRow }) {
  const n = parseInt(row.playType.replace("pick", ""), 10);
  const s = KENO_PICK_STYLES[n] ?? KENO_PICK_STYLES[5]!;
  const isEmpty = row.sets === 0;

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-1.5 rounded-xl border p-2.5 transition-all",
        isEmpty ? "opacity-40" : "",
        s.bg,
        s.border,
      )}
      title={row.label}
    >
      {/* Donut nổi góc phải-trên bằng `absolute` — KHÔNG nằm trong flex flow của header.
          Nhờ vậy donut vẽ to (48px, đủ chỗ cho text "100%") mà hàng header (label) vẫn
          giữ chiều cao nhỏ như cũ, tránh kéo cao cả card. */}
      <MiniDonut pct={row.pct} fill={s.fill} size={48} className="absolute top-1 right-1" />
      {/* Label — chừa khoảng trống bên phải (pr) để không bị donut che khi hiện full label */}
      <div className="flex min-w-0 items-center gap-1.5 pr-12">
        <div className={cn("size-1.5 shrink-0 rounded-full", s.dot)} />
        {/* Container hẹp → label rút gọn "P1"…"P10" (full label ở title tooltip) */}
        <span className={cn("truncate text-xs font-bold", s.text)}>
          <span className="@[820px]/main:hidden">P{n}</span>
          <span className="hidden @[820px]/main:inline">{row.label}</span>
        </span>
      </div>

      {/* Doanh thu + số bộ cược — neo xuống đáy card bằng `mt-auto` và đặt cùng 1 hàng
          `items-baseline justify-between`: doanh thu (nổi bật, trái) đối trọng với số
          bộ (phụ, phải) trên cùng đường baseline. Trước đây 2 dòng full-width xếp
          chồng ngay dưới label → khi grid `auto-rows-fr` kéo card cao hơn nội dung thật,
          phần còn trống dồn hết xuống dưới khiến khối này nhìn lệch/không cân đối. */}
      <div className="mt-auto flex items-baseline justify-between gap-2">
        <p className="text-foreground min-w-0 truncate text-sm leading-none font-bold tabular-nums">
          {formatNumber(row.revenue)}
        </p>
        <span className="text-muted-foreground/70 text-3xs shrink-0 leading-none font-medium tabular-nums">
          {formatNumber(row.sets)} bộ
        </span>
      </div>
    </div>
  );
}

// ─── Side Bet Pair Card — phân bổ + hướng lệch gộp 1 chỗ ──────────────────────

/**
 * Card 1 cặp side bet (Lớn↔Nhỏ, Chẵn↔Lẻ) — gộp phân bổ tiền + split bar hướng lệch
 * vào cùng 1 card compact (thay cho SideBetCard donut + SideBetBars full-width tách rời).
 *
 * Split bar đối xứng: hướng nào chiếm ≥ `skewPct` tổng cặp → tô amber (lệch cược, cần chú ý).
 * `skewPct` từ config (`thresholds.sidebetSkewPct`) để KHỚP ngưỡng alert `sidebet_skew` worker
 * sinh — không hardcode client (§4.3). Hoà (`drawAmount`) hiển thị phụ, KHÔNG tính vào lệch.
 *
 * Badge "Lệch X%" dùng pill có nền + icon cảnh báo (KHÔNG chỉ đổi màu chữ) để tách biệt
 * rõ với nhãn hướng cược (Lớn/Nhỏ/Chẵn/Lẻ) bên dưới — trước đây cả 2 cùng dùng
 * `text-amber-600` nên nhìn giống nhau, khó nhận ra đâu là cảnh báo. Nhãn hướng nặng hơn
 * chỉ in đậm + màu foreground (không tô màu) để amber chỉ còn đúng 1 nghĩa: "cảnh báo lệch".
 */
function SideBetPairCard({
  pair,
  playStyle,
  skewPct,
}: {
  pair: SideBetPair;
  /** UI tokens (Tailwind classes) — không phải React `style` attr. */
  playStyle: { bg: string; border: string; dot: string; text: string; label: string };
  skewPct: number;
}) {
  const pairTotal = pair.left.amount + pair.right.amount;
  const leftPct = pairTotal > 0 ? (pair.left.amount / pairTotal) * 100 : 50;
  const rightPct = 100 - leftPct;
  const maxPct = Math.max(leftPct, rightPct);
  const skewed = pairTotal > 0 && maxPct >= skewPct;
  const leftHeavier = leftPct >= rightPct;

  const leftColor = skewed && leftHeavier ? "bg-amber-500" : "bg-sky-500";
  const rightColor = skewed && !leftHeavier ? "bg-amber-500" : "bg-slate-400 dark:bg-slate-500";

  return (
    <div className={cn("flex flex-1 flex-col gap-2 rounded-xl border p-3", playStyle.bg, playStyle.border)}>
      <div className="flex items-center gap-2">
        <div className={cn("size-2 shrink-0 rounded-full", playStyle.dot)} />
        <span className={cn("flex-1 text-xs font-semibold", playStyle.text)}>{playStyle.label}</span>
        {skewed && (
          <span className="text-3xs inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 font-bold text-amber-700 tabular-nums dark:border-amber-400/40 dark:bg-amber-400/15 dark:text-amber-300">
            <TriangleAlert className="size-2.5 shrink-0" />
            Lệch {maxPct.toFixed(0)}%
          </span>
        )}
      </div>

      {/* 2 hướng: nhãn + tiền + % — hàng trên; split bar — hàng dưới */}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("truncate text-xs font-medium", skewed && leftHeavier && "text-foreground font-bold")}>
            {pair.left.label}
          </p>
          <p className="text-foreground text-sm leading-tight font-bold tabular-nums">
            {formatNumber(pair.left.amount)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <p className={cn("truncate text-xs font-medium", skewed && !leftHeavier && "text-foreground font-bold")}>
            {pair.right.label}
          </p>
          <p className="text-foreground text-sm leading-tight font-bold tabular-nums">
            {formatNumber(pair.right.amount)}
          </p>
        </div>
      </div>

      <div className="bg-muted flex h-2 overflow-hidden rounded-full">
        <div
          className={cn("w-[var(--bar-w)]", "transition-all", leftColor)}
          style={{ "--bar-w": `${leftPct}%` } as CSSProperties}
        />
        <div
          className={cn("w-[var(--bar-w)]", "transition-all", rightColor)}
          style={{ "--bar-w": `${rightPct}%` } as CSSProperties}
        />
      </div>

      <div className="text-muted-foreground/70 text-3xs flex items-center justify-between tabular-nums">
        <span>{leftPct.toFixed(0)}%</span>
        {pair.drawAmount > 0 && <span>Hoà {formatNumber(pair.drawAmount)}</span>}
        <span>{rightPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ─── PlayType Card ─────────────────────────────────────────────────────────────

export function PlayTypeCard({
  playTypes,
  sideBetPairs,
  sidebetSkewPct,
}: {
  playTypes: PlayTypeRow[];
  sideBetPairs?: SideBetPair[];
  /** Ngưỡng lệch side bet (%) từ config — tô màu progress bar (§4.3). */
  sidebetSkewPct: number;
}) {
  // Luôn hiển thị đủ 10 pick theo thứ tự 1→10 (fill zero nếu chưa có data).
  // Thứ tự + key lấy từ core (KENO_BASIC_PLAY_TYPES); label placeholder từ core labels.
  const pickMap = new Map(playTypes.filter((r) => r.playType.startsWith("pick")).map((r) => [r.playType, r]));
  const picks = KENO_BASIC_PLAY_TYPES.map(
    (pt) =>
      pickMap.get(pt) ?? {
        playType: pt,
        label: KENO_PLAY_TYPE_LABELS[pt] ?? pt,
        sets: 0,
        revenue: 0,
        pct: 0,
      },
  );

  // Side bet render từ sideBetPairs (đã tách hướng) — mỗi cặp 1 card compact gộp
  // phân bổ + split bar hướng lệch. Style theo thứ tự cố định [bigSmall, evenOdd].
  const sideBetStyles = [KENO_SIDE_BET_STYLES.bigSmall, KENO_SIDE_BET_STYLES.evenOdd];

  const totalSets = playTypes.reduce((a, r) => a + r.sets, 0);
  const totalRevenue = playTypes.reduce((a, r) => a + r.revenue, 0);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/50">
              <BarChart2 className="size-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Phân bổ kiểu chơi</CardTitle>
              <CardDescription className="mt-0.5 text-xs">Pick 1–10 · Lớn/Nhỏ · Chẵn/Lẻ</CardDescription>
            </div>
          </div>
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
            <span className="text-foreground font-semibold">{formatNumber(totalSets)}</span>
            <span>bộ</span>
            <span className="opacity-40">·</span>
            <span className="text-foreground font-semibold">{formatNumber(totalRevenue)}</span>
            <span>VND</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pt-0 pb-4">
        {playTypes.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Chưa có dữ liệu</p>
        ) : (
          <div className="grid gap-4 @[640px]/main:grid-cols-[3fr_2fr]">
            {/* ── Cột trái: Pick 1–10 grid 5×2 ── */}
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground/50 text-xs font-semibold tracking-wider uppercase">
                Cơ bản — Pick 1 đến 10
              </p>
              <div className="grid flex-1 auto-rows-fr grid-cols-5 gap-2">
                {picks.map((row) => (
                  <PickCard key={row.playType} row={row} />
                ))}
              </div>
            </div>

            {/* ── Cột phải: Side bets — card gộp phân bổ + hướng lệch ── */}
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground/50 text-xs font-semibold tracking-wider uppercase">
                Side Bets · Hướng cược
              </p>
              {!sideBetPairs || sideBetPairs.length === 0 ? (
                <p className="text-muted-foreground/50 py-2 text-xs">Chưa có dữ liệu</p>
              ) : (
                <div className="flex flex-1 flex-col gap-2.5">
                  {sideBetPairs.map((pair, i) => (
                    <SideBetPairCard
                      key={pair.label}
                      pair={pair}
                      playStyle={sideBetStyles[i] ?? sideBetStyles[0]!}
                      skewPct={sidebetSkewPct}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Risk Cluster (Top người chơi + Top phải trả + Bộ số phổ biến) ────────────

/**
 * Cụm 3 bảng rủi ro/concentration cạnh nhau (chốt 29/07 v2 — analysis §4.8, guideline §5):
 * **Top người chơi** (ai dồn tiền) | **Top phải trả tiềm năng** (entry trả nặng) |
 * **Bộ số phổ biến** (bộ nào bị nhiều người dồn — tín hiệu syndicate/combo_concentration).
 *
 * Ba panel cùng bản chất "bảng xếp hạng rủi ro" → gom 1 cụm 3 cột thay vì chôn "Bộ số
 * phổ biến" trong Card heatmap (heatmap thuần chức năng tương tác). Grid 3 cột khi rộng,
 * 1 cột khi hẹp — mỗi Card tự ẩn khi rỗng.
 *
 * Nguồn `stats.topAccounts` / `stats.topPotential` / `stats.topCombos` — worker sort sẵn,
 * FE chỉ render. Username nhất quán `<primary> · <tenant>` (KHÔNG show accountId — chỉ dựng
 * link). Mỗi dòng người chơi link tới outstanding player kỳ này (minh bạch: ai/cược gì/bao nhiêu).
 *
 * @param drawId - Kỳ đang xem — dựng link outstanding.
 */
export function TopRiskPanel({
  drawId,
  topAccounts,
  topPotential,
  topCombos,
}: {
  drawId: string;
  topAccounts: TopAccountRow[];
  topPotential: TopPotentialRow[];
  topCombos: TopComboRow[];
}) {
  if (topAccounts.length === 0 && topPotential.length === 0 && topCombos.length === 0) {
    return null;
  }

  return (
    <div className="grid items-start gap-4 @[640px]/main:grid-cols-2 @[1000px]/main:grid-cols-3">
      <TopAccountsCard drawId={drawId} rows={topAccounts} />
      <TopPotentialCard drawId={drawId} rows={topPotential} />
      <TopCombosCard rows={topCombos} />
    </div>
  );
}

/** Top người chơi theo tổng tiền cược — dòng tiền vào tô emerald. */
function TopAccountsCard({ drawId, rows }: { drawId: string; rows: TopAccountRow[] }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
            <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Top người chơi</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Theo tổng tiền cược trong kỳ</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pt-0 pb-4">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-1">
            {rows.map((a, i) => (
              <div
                key={a.accountId}
                className="border-border/40 bg-muted/10 flex items-center gap-2.5 rounded-lg border px-3 py-2"
              >
                <RankBadge rank={i + 1} />
                <PlayerOutstandingLink
                  gameProduct={GameProduct.Keno}
                  drawId={drawId}
                  accountId={a.accountId}
                  username={a.username}
                  className="min-w-0 flex-1 text-sm"
                />
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                    {formatNumber(a.amount)}
                  </p>
                  <p className="text-muted-foreground/60 text-2xs tabular-nums">{formatNumber(a.entries)} vé</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Top phải trả tiềm năng — rủi ro chi trả per-entry (đỏ, nổi bật). */
function TopPotentialCard({ drawId, rows }: { drawId: string; rows: TopPotentialRow[] }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
            <TrendingUp className="size-3.5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Top phải trả tiềm năng</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Entry rủi ro chi trả cao nhất nếu trúng</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pt-0 pb-4">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-1">
            {rows.map((p, i) => (
              <div
                key={p.entryId}
                className="border-border/40 bg-muted/10 flex items-center gap-2.5 rounded-lg border px-3 py-2"
              >
                <RankBadge rank={i + 1} danger />
                <div className="min-w-0 flex-1">
                  <PlayerOutstandingLink
                    gameProduct={GameProduct.Keno}
                    drawId={drawId}
                    accountId={p.accountId}
                    username={p.username}
                    className="text-sm"
                  />
                  <p className="text-muted-foreground/70 text-2xs mt-0.5 tabular-nums">
                    Cược <span className="text-foreground font-medium">{formatNumber(p.amount)}</span>
                  </p>
                </div>
                {/* Rủi ro chi trả — số chính, đỏ đậm, có nền để nổi bật */}
                <div className="shrink-0 rounded-md bg-red-500/10 px-2 py-1 text-right">
                  <p className="text-3xs leading-none text-red-500/70">Phải trả</p>
                  <p className="text-sm leading-tight font-bold text-red-600 tabular-nums dark:text-red-400">
                    {formatNumber(p.potentialWin)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Bộ số phổ biến nhất — bộ pick8/9/10 được nhiều người/nhiều bộ dồn vào.
 *
 * Tín hiệu **syndicate / dồn bộ** (cùng họ alert `combo_concentration`): nhiều người chơi
 * cùng ôm 1 bộ số → nếu bộ đó trúng, công ty trả tập trung. Cùng cụm rủi ro với Top người
 * chơi / Top phải trả (§4.8). Hiển thị ĐỦ số (wrap) — panel có không gian, không collapse.
 */
export function TopCombosCard({ rows }: { rows: TopComboRow[] }) {
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
            <Trophy className="size-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Bộ số phổ biến nhất</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Bộ pick 8/9/10 được nhiều người dồn</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pt-0 pb-4">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-1">
            {rows.map((c) => (
              <div
                key={c.rank}
                className="border-border/40 bg-muted/10 flex items-start gap-2.5 rounded-lg border px-3 py-2"
              >
                <span className="shrink-0 pt-0.5 text-sm leading-none">{medals[c.rank - 1] ?? `#${c.rank}`}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    {c.numbers.map((n) => (
                      <NumberBadge key={n} num={n} variant="soft" />
                    ))}
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {KENO_PLAY_TYPE_LABELS[c.playType as KenoPlayType] ?? c.playType}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-foreground text-xs font-semibold tabular-nums">{formatNumber(c.sets)} bộ</p>
                  <p className="text-muted-foreground text-xs tabular-nums">{formatNumber(c.entryCount)} người</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Badge thứ hạng #N — top 1 highlight, danger tô đỏ (bảng rủi ro). */
function RankBadge({ rank, danger = false }: { rank: number; danger?: boolean }) {
  return (
    <span
      className={cn(
        "text-2xs inline-flex size-6 shrink-0 items-center justify-center rounded-full font-bold tabular-nums",
        rank === 1
          ? danger
            ? "bg-red-500 text-white"
            : "bg-emerald-500 text-white"
          : "bg-muted text-muted-foreground",
      )}
    >
      {rank}
    </span>
  );
}

// ─── Tenant Breakdown ──────────────────────────────────────────────────────────

/**
 * Phân tích theo đại lý. MegaWin core là RGS B2B → số tenant thường rất ít (1–2).
 *
 * Layout thích ứng theo số lượng (analysis §4.8):
 * - **≤ 3 đại lý:** mỗi đại lý là 1 card giàu thông tin (doanh thu + hoa hồng + entries +
 *   người chơi + % + bar) — KHÔNG dùng bảng 1 dòng trống trải.
 * - **> 3 đại lý:** bảng compact cuộn (dữ liệu nhiều dòng, cần quét nhanh).
 */
export function TenantBreakdownCard({ tenants }: { tenants: TenantRow[] }) {
  const maxRevenue = Math.max(...tenants.map((t) => t.revenue), 1);
  const isFew = tenants.length <= 3;

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
            <Store className="size-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Phân tích theo đại lý</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Doanh thu · Hoa hồng · Người chơi</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pt-0 pb-4">
        {tenants.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">Chưa có dữ liệu</p>
        ) : isFew ? (
          <div className="space-y-2.5">
            {tenants.map((t, i) => (
              <TenantDetailCard key={t.tenantId} tenant={t} rank={i + 1} maxRevenue={maxRevenue} />
            ))}
          </div>
        ) : (
          <TenantTable tenants={tenants} maxRevenue={maxRevenue} />
        )}
      </CardContent>
    </Card>
  );
}

/** 1 card đại lý giàu thông tin — dùng khi ít đại lý (≤3). */
function TenantDetailCard({ tenant, rank, maxRevenue }: { tenant: TenantRow; rank: number; maxRevenue: number }) {
  return (
    <div className="bg-muted/10 rounded-xl border p-3.5">
      {/* Header: rank + tên + % share */}
      <div className="flex items-center gap-2">
        <span className="text-2xs inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 font-bold text-blue-600 tabular-nums dark:text-blue-400">
          {rank}
        </span>
        <span className="flex-1 truncate text-sm font-semibold">{tenant.tenantId}</span>
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-600 tabular-nums dark:text-blue-400">
          {tenant.pct.toFixed(1)}%
        </span>
      </div>

      {/* Bar doanh thu (tỷ trọng so với đại lý lớn nhất) */}
      <div className="bg-muted mt-2.5 h-1.5 overflow-hidden rounded-full">
        <div
          className="h-full w-[var(--bar-w)] rounded-full bg-blue-500/70 transition-all"
          style={{ "--bar-w": `${(tenant.revenue / maxRevenue) * 100}%` } as CSSProperties}
        />
      </div>

      {/* 3 chỉ số chính */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <TenantMetric
          icon={TrendingUp}
          label="Doanh thu"
          value={formatNumber(tenant.revenue)}
          accent="text-foreground"
        />
        <TenantMetric
          icon={Receipt}
          label="Hoa hồng"
          value={formatNumber(tenant.commission)}
          accent="text-amber-600 dark:text-amber-400"
        />
        <TenantMetric
          icon={Users}
          label="Người chơi"
          value={tenant.players === null ? "—" : formatNumber(tenant.players)}
          sub={`${formatNumber(tenant.entries)} vé`}
          accent="text-foreground"
        />
      </div>
    </div>
  );
}

/** 1 ô chỉ số trong TenantDetailCard. */
function TenantMetric({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="bg-card border-border/40 rounded-lg border px-2.5 py-2">
      <div className="text-muted-foreground/60 text-3xs flex items-center gap-1 tracking-wider uppercase">
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn("mt-0.5 text-sm leading-tight font-bold tabular-nums", accent)}>{value}</p>
      {sub ? <p className="text-muted-foreground/60 text-3xs tabular-nums">{sub}</p> : null}
    </div>
  );
}

/** Bảng compact — dùng khi nhiều đại lý (>3). */
function TenantTable({ tenants, maxRevenue }: { tenants: TenantRow[]; maxRevenue: number }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="bg-muted/40 text-muted-foreground grid [grid-template-columns:1fr_5rem_5rem_6rem] gap-x-2 border-b px-3 py-2 text-xs font-medium tracking-wider uppercase">
        <span>Đại lý</span>
        <span className="text-right">Entries</span>
        <span className="text-right">Người chơi</span>
        <span className="text-right">Doanh thu</span>
      </div>
      <div className="divide-border/50 max-h-70 divide-y overflow-y-auto">
        {tenants.map((t, i) => (
          <div
            key={t.tenantId}
            className="hover:bg-muted/20 relative grid [grid-template-columns:1fr_5rem_5rem_6rem] items-center gap-x-2 px-3 py-2.5 transition-colors"
          >
            <div
              className="absolute inset-y-0 left-0 w-[var(--bar-w)] rounded-r-sm bg-blue-500/5 dark:bg-blue-400/5"
              style={{ "--bar-w": `${(t.revenue / maxRevenue) * 100}%` } as CSSProperties}
            />
            <div className="relative flex min-w-0 items-center gap-2">
              <span className="text-muted-foreground/40 w-4 shrink-0 text-xs font-bold tabular-nums">{i + 1}</span>
              <span className="truncate text-sm font-medium">{t.tenantId}</span>
              <span className="text-muted-foreground/50 shrink-0 text-xs">{t.pct.toFixed(0)}%</span>
            </div>
            <span className="relative text-right text-sm tabular-nums">{formatNumber(t.entries)}</span>
            <span className="text-muted-foreground relative text-right text-sm tabular-nums">
              {t.players === null ? "—" : formatNumber(t.players)}
            </span>
            <span className="relative text-right text-sm font-medium tabular-nums">{formatNumber(t.revenue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
