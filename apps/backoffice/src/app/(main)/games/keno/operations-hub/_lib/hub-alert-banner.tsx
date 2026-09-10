"use client";

/**
 * Ops Hub — Zone 4: Alert Banner
 *
 * CHỈ render khi có bất thường (guideline §8.1: banner luôn hiện = banner bị bỏ qua). Stack
 * TẤT CẢ điều kiện đúng theo thứ tự ưu tiên (plan p1-01 §7.4) — mỗi dòng là một VIỆC khác nhau,
 * không gộp chung 1 câu "có N vấn đề".
 *
 * `truncated` LUÔN ưu tiên 1: nó nghĩa là "số đang xem KHÔNG đầy đủ" — nghiêm trọng hơn mọi
 * cảnh báo về dữ liệu đã thấy, và là hàng rào chống bẫy trần-500-im-lặng (p0-03 §1.1).
 *
 * Âm thanh (guideline §8.2): 1 tiếng `ping` DUY NHẤT khi `stuckCount` tăng từ 0 lên > 0, mặc
 * định TẮT (zustand). So `prevStuckCount` bằng `useRef`, KHÔNG `useEffect` + state — tránh
 * thêm 1 nguồn re-render cho thứ chỉ cần side-effect.
 */

import { useEffect, useRef } from "react";

import { AlertTriangle, Ban, PlayCircle, RotateCcw, XCircle } from "lucide-react";

import { useHubPreferences } from "./hub-preferences-store";
import { HubGateTab } from "./sections/queue/queue-types";
import { useHubContext } from "./use-hub-context";
import { useHubUrlParams } from "./use-hub-url-params";

interface BannerItemDef {
  key: string;
  tone: "destructive" | "amber";
  icon: typeof AlertTriangle;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

function BannerRow({ item }: { item: BannerItemDef }) {
  const Icon = item.icon;
  const toneClass =
    item.tone === "destructive"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${toneClass}`}>
      <span className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" />
        {item.message}
      </span>
      {item.actionLabel && item.onAction ? (
        <button
          type="button"
          onClick={item.onAction}
          className="shrink-0 rounded-md border border-current/30 px-2.5 py-1 font-medium text-xs transition-opacity hover:opacity-80"
        >
          {item.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Chuông cảnh báo — hiệu ứng phụ tách khỏi render, đọc `Audio` API trực tiếp khi cạnh tăng.
 * Tổng hợp tiếng "ping" bằng Web Audio API (oscillator ngắn), KHÔNG dùng file audio tĩnh —
 * tránh thêm asset chỉ để phát 1 tiếng bíp ngắn, và tránh lỗi 404 nếu file thiếu.
 */
function playPing(): void {
  try {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
    oscillator.onended = () => {
      void ctx.close();
    };
  } catch {
    // Trình duyệt chặn autoplay không tương tác trước đó, hoặc không hỗ trợ AudioContext —
    // bỏ qua, mất tiếng ping không phải lỗi nghiêm trọng (banner vẫn hiện đầy đủ).
  }
}

function useStuckSound(stuckCount: number): void {
  const soundOnCritical = useHubPreferences((s) => s.soundOnCritical);
  const prevStuckCountRef = useRef(stuckCount);

  useEffect(() => {
    const prev = prevStuckCountRef.current;
    prevStuckCountRef.current = stuckCount;
    if (!soundOnCritical) {
      return;
    }
    // Chỉ ping đúng lúc cạnh 0 → dương — không lặp lại khi stuckCount dao động 3→4→3.
    if (prev === 0 && stuckCount > 0) {
      playPing();
    }
  }, [stuckCount, soundOnCritical]);
}

export function HubAlertBanner() {
  const { state } = useHubContext();
  const [, setUrlParams] = useHubUrlParams();
  const { snapshot, funnel, stuckCount } = state;

  useStuckSound(stuckCount);

  if (!snapshot) {
    return null;
  }

  const items: BannerItemDef[] = [];

  // Ưu tiên 1 — truncated: số đang xem KHÔNG đầy đủ.
  if (snapshot.truncated) {
    items.push({
      key: "truncated",
      tone: "destructive",
      icon: AlertTriangle,
      message: `Danh sách chưa đầy đủ (giới hạn ${snapshot.rows.length} kỳ). Liên hệ kỹ thuật để tăng trần.`,
    });
  }

  // Ưu tiên 2 — NeedsResettle: tiền đã trả có thể sai.
  if (funnel.anomalies.needsResettle > 0) {
    items.push({
      key: "needs-resettle",
      tone: "destructive",
      icon: RotateCcw,
      message: `${funnel.anomalies.needsResettle} kỳ cần kết sổ lại — kết quả bị sửa SAU khi đã kết sổ.`,
      actionLabel: `Xem ${funnel.anomalies.needsResettle} kỳ`,
      onAction: () => setUrlParams({ gate: HubGateTab.AwaitingSettle }),
    });
  }

  // Ưu tiên 3 — NeverOpened: kỳ quá giờ mở bán, mất hẳn doanh thu.
  if (funnel.anomalies.neverOpened > 0) {
    items.push({
      key: "never-opened",
      tone: "destructive",
      icon: XCircle,
      message: `${funnel.anomalies.neverOpened} kỳ quá giờ mở bán (chưa từng mở bán, đã hết giờ cược) — không thể mở bán lại, cần huỷ kỳ.`,
      actionLabel: `Xem ${funnel.anomalies.neverOpened} kỳ`,
      // `NeverOpened` nằm ở tab "Chờ mở bán" (badge "Quá giờ mở bán") — không nhảy All
      // rồi để staff tự tìm trong hàng trăm dòng.
      onAction: () => setUrlParams({ gate: HubGateTab.PendingOpen }),
    });
  }

  // Ưu tiên 4 — health = stuck (bất kỳ chặng nào).
  if (stuckCount > 0) {
    items.push({
      key: "stuck",
      tone: "destructive",
      icon: AlertTriangle,
      message: `${stuckCount} kỳ quá thời hạn xử lý — vượt ngưỡng của chặng hiện tại.`,
      actionLabel: `Xem ${stuckCount} kỳ`,
      // Xoá filter → về mặc định "Cần xử lý" của bảng 5A (p1-02), tab đó sort theo `health`
      // desc nên kỳ stuck luôn nổi lên đầu — không cần 1 URL param riêng cho `health`.
      onAction: () => setUrlParams({ gate: null }),
    });
  }

  // Ưu tiên 5 — PendingOpen: quên mở bán, còn cứu được.
  if (funnel.anomalies.pendingOpen > 0) {
    items.push({
      key: "pending-open",
      tone: "amber",
      icon: PlayCircle,
      message: `${funnel.anomalies.pendingOpen} kỳ chưa mở bán — vẫn có thể mở bán, doanh thu bị gián đoạn.`,
      actionLabel: `Mở bán ${funnel.anomalies.pendingOpen} kỳ`,
      onAction: () => setUrlParams({ gate: HubGateTab.PendingOpen }),
    });
  }

  // Ưu tiên 6 — Halted: đã ngắt bán chủ động.
  if (funnel.anomalies.halted > 0) {
    items.push({
      key: "halted",
      tone: "amber",
      icon: Ban,
      message: `${funnel.anomalies.halted} kỳ đã ngắt bán — kiểm tra có cần mở lại không.`,
      actionLabel: `Xem ${funnel.anomalies.halted} kỳ`,
      onAction: () => setUrlParams({ gate: HubGateTab.PendingOpen }),
    });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <BannerRow key={item.key} item={item} />
      ))}
    </div>
  );
}
