"use client";

import { isValidElement, type ComponentProps, type ReactNode } from "react";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  LoaderIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("group not-prose bg-muted/30 mb-2 w-full overflow-hidden rounded-lg border", className)}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  /**
   * Nhãn nghiệp vụ hiển thị cho staff. **LUÔN truyền** — bỏ trống thì header fallback về tên
   * tool kỹ thuật (`getFinancialByGame`, `bash`), phơi bề mặt công cụ của agent ra UI.
   * Lấy từ `getToolLabel()` (`tool-renderers/registry.tsx`), nơi đã lo cả nhãn mặc định.
   */
  title?: string;
  className?: string;
  /**
   * Turn đã kết thúc nhưng part chưa có output ⇒ tool call MỒ CÔI, không bao giờ hoàn tất.
   * Hiển thị "Đã ngắt" thay vì "Đang chạy" xoay vĩnh viễn (p0-04 §3.2 Bug B).
   */
  interrupted?: boolean;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

/** Nhãn trạng thái tiếng Việt — UI backoffice toàn tiếng Việt (p0-04 §4.1). */
const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Chờ duyệt",
  "approval-responded": "Đã phản hồi",
  "input-available": "Đang chạy",
  "input-streaming": "Đang chuẩn bị",
  "output-available": "Xong",
  "output-denied": "Bị từ chối",
  "output-error": "Lỗi",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-3.5 text-yellow-600" />,
  "approval-responded": <CheckCircleIcon className="size-3.5 text-blue-600" />,
  "input-available": <LoaderIcon className="text-muted-foreground size-3.5 animate-spin" />,
  "input-streaming": <CircleIcon className="text-muted-foreground size-3.5" />,
  "output-available": <CheckCircleIcon className="size-3.5 text-emerald-600" />,
  "output-denied": <XCircleIcon className="size-3.5 text-orange-600" />,
  "output-error": <XCircleIcon className="size-3.5 text-red-600" />,
};

/** Trạng thái trình bày cho tool call mồ côi — KHÔNG thuộc `ToolPart["state"]` của AI SDK. */
const INTERRUPTED_LABEL = "Đã ngắt";
const INTERRUPTED_ICON = <AlertTriangleIcon className="text-muted-foreground size-3.5" />;

export const getStatusBadge = (status: ToolPart["state"], interrupted = false) => (
  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
    {interrupted ? INTERRUPTED_ICON : statusIcons[status]}
    {interrupted ? INTERRUPTED_LABEL : statusLabels[status]}
  </span>
);

export const ToolHeader = ({ className, title, type, state, toolName, interrupted, ...props }: ToolHeaderProps) => {
  const derivedName = type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "hover:bg-muted/60 flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        <WrenchIcon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="truncate text-sm font-medium">{title ?? derivedName}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {getStatusBadge(state, interrupted)}
        <ChevronDownIcon className="text-muted-foreground size-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </div>
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground data-[state=closed]:animate-out data-[state=open]:animate-in space-y-3 border-t px-3 py-3 outline-none",
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1.5 overflow-hidden", className)} {...props}>
    <h4 className="text-muted-foreground text-xs font-medium">Tham số</h4>
    <div className="bg-muted/50 rounded-md">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <h4 className="text-muted-foreground text-xs font-medium">{errorText ? "Lỗi" : "Kết quả"}</h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-foreground",
        )}
      >
        {errorText && <div className="p-2">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
