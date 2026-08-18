"use client";

import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { Streamdown } from "streamdown";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { Shimmer } from "./shimmer";
import { STREAM_TEXT_ANIMATION } from "./stream-animation";
import { useElapsedSeconds } from "./use-elapsed-seconds";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
  /** Số giây đã trôi qua TRONG LÚC đang suy nghĩ, tick mỗi giây — 0 khi chưa streaming/chưa đủ 1s. */
  liveElapsedSeconds: number;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export const useReasoning = () => {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
};

export type ReasoningProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
};

const AUTO_CLOSE_DELAY = 1000;
const MS_IN_S = 1000;

export const Reasoning = memo(
  ({
    className,
    isStreaming = false,
    open,
    defaultOpen,
    onOpenChange,
    duration: durationProp,
    children,
    ...props
  }: ReasoningProps) => {
    const resolvedDefaultOpen = defaultOpen ?? isStreaming;
    // Track if defaultOpen was explicitly set to false (to prevent auto-open)
    const isExplicitlyClosed = defaultOpen === false;

    const [isOpen, setIsOpen] = useControllableState<boolean>({
      defaultProp: resolvedDefaultOpen,
      onChange: onOpenChange,
      prop: open,
    });
    const [duration, setDuration] = useControllableState<number | undefined>({
      defaultProp: undefined,
      prop: durationProp,
    });

    const hasEverStreamedRef = useRef(isStreaming);
    const [hasAutoClosed, setHasAutoClosed] = useState(false);
    // State (KHÔNG ref) vì `useElapsedSeconds` cần mốc bắt đầu như một dependency reactive — ref
    // thay đổi không trigger effect của hook, đồng hồ sẽ đứng ở 0.
    const [streamStartedAt, setStreamStartedAt] = useState<number | null>(() => (isStreaming ? Date.now() : null));
    const liveElapsedSeconds = useElapsedSeconds(isStreaming ? streamStartedAt : null);

    // Ghi mốc bắt đầu khi vào streaming, chốt `duration` khi ra khỏi streaming.
    useEffect(() => {
      if (isStreaming) {
        hasEverStreamedRef.current = true;
        if (streamStartedAt === null) {
          setStreamStartedAt(Date.now());
        }
        return;
      }
      if (streamStartedAt !== null) {
        setDuration(Math.ceil((Date.now() - streamStartedAt) / MS_IN_S));
        setStreamStartedAt(null);
      }
    }, [isStreaming, streamStartedAt, setDuration]);

    // Auto-open when streaming starts (unless explicitly closed)
    useEffect(() => {
      if (isStreaming && !isOpen && !isExplicitlyClosed) {
        setIsOpen(true);
      }
    }, [isStreaming, isOpen, setIsOpen, isExplicitlyClosed]);

    // Auto-close when streaming ends (once only, and only if it ever streamed)
    useEffect(() => {
      if (hasEverStreamedRef.current && !isStreaming && isOpen && !hasAutoClosed) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          setHasAutoClosed(true);
        }, AUTO_CLOSE_DELAY);

        return () => clearTimeout(timer);
      }
    }, [isStreaming, isOpen, setIsOpen, hasAutoClosed]);

    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        setIsOpen(newOpen);
      },
      [setIsOpen],
    );

    const contextValue = useMemo(
      () => ({ duration, isOpen, isStreaming, liveElapsedSeconds, setIsOpen }),
      [duration, isOpen, isStreaming, liveElapsedSeconds, setIsOpen],
    );

    return (
      <ReasoningContext.Provider value={contextValue}>
        <Collapsible
          className={cn("not-prose mb-2", className)}
          onOpenChange={handleOpenChange}
          open={isOpen}
          {...props}
        >
          {children}
        </Collapsible>
      </ReasoningContext.Provider>
    );
  },
);

export type ReasoningTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number, liveElapsedSeconds?: number) => ReactNode;
};

/**
 * Nhãn tiếng Việt — UI backoffice toàn tiếng Việt (p0-04 §4.4).
 *
 * Lúc đang streaming hiện đồng hồ chạy ("Đang suy nghĩ… 3 giây", tick mỗi giây) thay vì 1 câu tĩnh —
 * giống ChatGPT/Claude, giúp staff biết agent đang thực sự xử lý (không phải treo) và ước lượng
 * còn bao lâu. Sau khi xong chốt lại tổng thời gian ("Đã suy nghĩ 5 giây").
 */
const defaultGetThinkingMessage = (isStreaming: boolean, duration?: number, liveElapsedSeconds?: number) => {
  if (isStreaming) {
    return <Shimmer duration={1}>{`Đang suy nghĩ… ${liveElapsedSeconds ?? 0} giây`}</Shimmer>;
  }
  if (duration === 0) {
    return <Shimmer duration={1}>Đang suy nghĩ…</Shimmer>;
  }
  if (duration === undefined) {
    return <p>Đã suy nghĩ</p>;
  }
  return <p>Đã suy nghĩ {duration} giây</p>;
};

export const ReasoningTrigger = memo(
  ({ className, children, getThinkingMessage = defaultGetThinkingMessage, ...props }: ReasoningTriggerProps) => {
    const { isStreaming, isOpen, duration, liveElapsedSeconds } = useReasoning();

    return (
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <BrainIcon className="size-4" />
            {getThinkingMessage(isStreaming, duration, liveElapsedSeconds)}
            <ChevronDownIcon className={cn("size-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")} />
          </>
        )}
      </CollapsibleTrigger>
    );
  },
);

export type ReasoningContentProps = ComponentProps<typeof CollapsibleContent> & {
  children: string;
};

const streamdownPlugins = { cjk, code, mermaid };

export const ReasoningContent = memo(({ className, children, ...props }: ReasoningContentProps) => {
  // Reasoning cũng stream text ⇒ dùng CHUNG hiệu ứng fade-in từng từ với câu trả lời, nếu không phần
  // suy nghĩ đổ chữ thành cục trong khi câu trả lời ngay dưới lại mượt. `isAnimating` lấy từ context
  // `Reasoning` (cùng cờ điều khiển đồng hồ "Đang suy nghĩ… n giây") — streamdown chỉ nạp animate
  // plugin khi cả `animated` và `isAnimating` bật, nên reasoning cũ mở lại không fade lại.
  const { isStreaming } = useReasoning();

  return (
    <CollapsibleContent
      className={cn(
        "mt-2 border-muted border-l-2 pl-3",
        "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className,
      )}
      {...props}
    >
      {/* Reasoning là nội dung phụ → nhỏ hơn câu trả lời (15px) một bậc, đúng cách ChatGPT/Claude
        phân cấp. Override qua biến `--chat-md-size` vì `.chat-md` là CSS unlayered, utility
        `text-*` không đè được nó. `.chat-md` lo phần còn lại (list, heading, spacing). */}
      <Streamdown
        animated={STREAM_TEXT_ANIMATION}
        className="chat-md [--chat-md-size:0.875rem]"
        isAnimating={isStreaming}
        plugins={streamdownPlugins}
      >
        {children}
      </Streamdown>
    </CollapsibleContent>
  );
});

Reasoning.displayName = "Reasoning";
ReasoningTrigger.displayName = "ReasoningTrigger";
ReasoningContent.displayName = "ReasoningContent";
