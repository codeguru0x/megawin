"use client";

/**
 * AI Chat — renderer bespoke cho tool `navigateTo` (p1-01 §4 / p1-04 §3, Tier 2 — cần side effect
 * `router.push`, spec chung không mô tả được).
 *
 * Validate `href` LẦN 2 ở client ({@link isKnownNavHref}) trước khi tin — không tin tưởng riêng
 * phía server dù tool đã validate: nếu sau này ai đó nới lỏng tool hoặc model paraphrase output
 * sai, client vẫn là chốt chặn cuối trước khi gọi `router.push` (defense-in-depth, không phải
 * nghi ngờ chính tool này).
 *
 * QUY TẮC BẤT BIẾN (p1-04 §2.3): auto-navigate CHỈ khi đích read-only (`autoNavigate: true` từ
 * registry) VÀ nguồn không dirty (`collectAiPageContext()` không có group nào báo `formDirty:
 * true`). Mọi trường hợp khác → chỉ hiện nút, không tự `router.push`. Trang có form ĐĂNG KÝ dirty
 * qua `useAiPageContext(key, () => ({ ..., formDirty: hasUnsavedChanges }))` — xem `ai-page-context.ts`.
 * Trang chưa đăng ký thì coi như không dirty (an toàn — giữ đúng hành vi cũ, không phải regression).
 *
 * Panel: auto-navigate 1 lần khi đủ điều kiện (staff đang làm việc ở trang khác, agent điều hướng
 * hộ — giống ChatGPT mở artifact). Trang `/ai`: LUÔN chỉ hiện nút — rời trang chat đang gõ dở là
 * phá flow, bất kể `autoNavigate`/dirty.
 */

import { useEffect, useRef, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

import type { EveDynamicToolPart } from "eve/react";
import { AlertTriangleIcon, ExternalLinkIcon, PencilLineIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AI_FULL_PAGE_PATH } from "@/config/app-config";
import { collectAiPageContext } from "@/lib/ai-page-context";
import { isKnownNavHref, type NavBuildError } from "@/lib/nav-registry";

interface NavigateToSuccess {
  ok: true;
  href: string;
  label: string;
  autoNavigate: boolean;
}

interface NavigateToFailure {
  ok: false;
  reason: NavBuildError;
  validParams: readonly string[];
  hint: string;
}

type NavigateToOutput = NavigateToSuccess | NavigateToFailure;

function isNavigateToOutput(value: unknown): value is NavigateToOutput {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    return false;
  }
  const candidate = value as { ok: unknown };
  return typeof candidate.ok === "boolean";
}

/** Có group context trang nào báo đang dirty không — xem quy tắc bất biến ở JSDoc file. */
function isAnySourceFormDirty(): boolean {
  const context = collectAiPageContext();
  if (context === undefined) {
    return false;
  }
  return Object.values(context).some((group) => group.formDirty === true);
}

function NavigateToErrorCard({ output }: { output: NavigateToFailure }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      <p className="text-muted-foreground">Agent không thể mở trang này: {output.hint}</p>
    </div>
  );
}

function NavigateToSuccessCard({ output, toolCallId }: { output: NavigateToSuccess; toolCallId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const isPageVariant = pathname === AI_FULL_PAGE_PATH;
  const hrefIsSafe = isKnownNavHref(output.href);
  // Đánh giá 1 lần lúc mount — dirty là trạng thái lúc STAFF BẤM GỬI, không phải trạng thái lúc
  // card render lại (staff có thể đã tự sửa xong ở nơi khác trong lúc chờ agent trả lời).
  const [shouldAutoNavigate] = useState(() => output.autoNavigate && !isAnySourceFormDirty());
  // Guard theo `toolCallId` — event log replay lúc reload/resume KHÔNG được navigate lại lần 2.
  const navigatedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isPageVariant || !hrefIsSafe || !shouldAutoNavigate || navigatedRef.current === toolCallId) {
      return;
    }
    navigatedRef.current = toolCallId;
    router.push(output.href);
  }, [isPageVariant, hrefIsSafe, shouldAutoNavigate, toolCallId, output.href, router]);

  if (!hrefIsSafe) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p className="text-muted-foreground">Agent đề xuất mở một đường dẫn không hợp lệ — đã chặn điều hướng.</p>
      </div>
    );
  }

  const autoNavigatedNow = !isPageVariant && shouldAutoNavigate;
  const downgradedForDirty = output.autoNavigate && !shouldAutoNavigate && !isPageVariant;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {downgradedForDirty && <PencilLineIcon className="size-3.5 shrink-0 text-amber-600" />}
        {autoNavigatedNow ? "→ Đã mở" : downgradedForDirty ? "Đang có thay đổi chưa lưu — mở" : "Mở"}{" "}
        <span className="font-medium text-foreground">{output.label}</span>
      </span>
      <Button onClick={() => router.push(output.href)} size="sm" variant="outline">
        <ExternalLinkIcon className="size-3.5" />
        Mở trang
      </Button>
    </div>
  );
}

export function renderNavigateTo(part: EveDynamicToolPart) {
  if (!isNavigateToOutput(part.output)) {
    return null;
  }
  if (!part.output.ok) {
    return <NavigateToErrorCard output={part.output} />;
  }
  return <NavigateToSuccessCard output={part.output} toolCallId={part.toolCallId} />;
}
