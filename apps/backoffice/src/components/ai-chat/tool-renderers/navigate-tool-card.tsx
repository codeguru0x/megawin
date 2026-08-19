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
 * true`). Mọi trường hợp khác → chỉ hiện nút, không tự `router.push`. Đầu GHI của quy tắc là
 * `useAiFormDirty` — đã nối vào toàn bộ 40 form config (7 game × {rates, prizes, play-rules, ops,
 * …} + trang tenant). Trang chưa đăng ký thì coi như không dirty (an toàn — giữ đúng hành vi cũ).
 * Cả hai đầu được khoá bằng `test/ai-chat-navigate-card.test.tsx`: nhánh này từng nằm đây suốt mà
 * KHÔNG BAO GIỜ chạy vì không nơi nào ghi `formDirty`, và không có gì phát hiện ra.
 *
 * Panel: auto-navigate 1 lần khi đủ điều kiện (staff đang làm việc ở trang khác, agent điều hướng
 * hộ — giống ChatGPT mở artifact). Trang `/ai`: LUÔN chỉ hiện nút — rời trang chat đang gõ dở là
 * phá flow, bất kể `autoNavigate`/dirty.
 *
 * NHÃN THẺ LÀ NGUỒN CHÂN LÝ DUY NHẤT về trạng thái điều hướng ("Đã mở" vs "Mở trang"): model KHÔNG
 * biết trước kết quả — biến thể (panel/`/ai`) và `formDirty` chỉ có ở client lúc mount. Vì vậy
 * `40-tool-policy.md` cấm model phát biểu về việc trang đã mở hay chưa, và nhãn ở đây phải TỰ ĐỦ
 * NGHĨA thay vì trông chờ phần chữ giải thích hộ.
 *
 * LAYOUT (thiết kế lại 19/08 sau feedback "thẻ không đẹp, nhất là trong panel"): thẻ là MỘT `<Link>`
 * hai dòng — dòng 1 tên trang + trạng thái, dòng 2 ngữ cảnh đã áp (game/kỳ/đại lý). Ba lý do đổi:
 *
 * 1. Bản cũ xếp NGANG (`justify-between`) một câu chảy "→ Đã mở <tên trang>" cạnh nút "Mở trang".
 *    Panel rộng 340–480px (`AI_PANEL_MIN_WIDTH`), nút chiếm ~110px ⇒ câu chữ còn ~200px và tự wrap
 *    giữa cụm trạng thái ("→ Đã" / "mở"), đọc ra thành hai mảnh vô nghĩa. Giờ mỗi dòng `truncate`,
 *    chiều cao thẻ là HẰNG SỐ, không phụ thuộc độ dài nhãn.
 * 2. Trạng thái và tên đích trước đây trộn trong cùng một dòng chữ nên không có thứ bậc. Tên trang
 *    là thứ staff cần đọc trước ⇒ nó đứng riêng, đậm; trạng thái teo về nhãn nhỏ bên phải.
 * 3. `<Link>` thay `Button` + `router.push`: cả thẻ bấm được (đích bấm to hơn nút 110px), và ⌘/giữa
 *    click mở tab mới — điều `onClick={router.push}` KHÔNG làm được, dù mở song song trang đích với
 *    hội thoại là nhu cầu thường trực của staff. `router.push` chỉ còn trong nhánh auto-navigate.
 */

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import type { EveDynamicToolPart } from "eve/react";
import { ArrowUpRightIcon, PencilLineIcon } from "lucide-react";

import { AI_FULL_PAGE_PATH } from "@/config/app-config";
import { collectAiPageContext } from "@/lib/ai-page-context";
import { isKnownNavHref, type NavBuildError } from "@/lib/nav-registry";
import { cn } from "@/lib/utils";

import { ToolErrorCard } from "./generic-tool-view";

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

/**
 * Tách nhãn phẳng của tool thành tên trang + ngữ cảnh.
 *
 * `buildAppliedLabel` (`nav-registry.ts`) nối bằng `" · "` với tên trang ở ĐẦU — hợp đồng đó ghi
 * ngay tại hàm đó. CỐ Ý tách ở client thay vì cho tool trả sẵn mảng: output tool đi vào ngữ cảnh
 * model mỗi lượt, thêm bản sao thứ hai của cùng chuỗi chỉ để đỡ một dòng `split` là trả token cho
 * dữ liệu không ai đọc.
 */
function splitNavLabel(label: string): { context: string | undefined; title: string } {
  const [title = label, ...rest] = label.split(" · ");
  return { context: rest.length > 0 ? rest.join(" · ") : undefined, title };
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
    return <ToolErrorCard message="Agent đề xuất mở một đường dẫn không hợp lệ — đã chặn điều hướng." />;
  }

  const autoNavigatedNow = !isPageVariant && shouldAutoNavigate;
  const downgradedForDirty = output.autoNavigate && !shouldAutoNavigate && !isPageVariant;
  const { context, title } = splitNavLabel(output.label);

  return (
    <Link
      // `not-prose`: thẻ nằm giữa văn xuôi markdown của trợ lý (`.chat-md`) — không để style
      // anchor/paragraph của prose đè lên (cùng lý do `ToolResultLine` khai `not-prose`).
      className="not-prose group flex w-full items-start gap-2.5 rounded-lg border bg-card px-2.5 py-2 transition-colors hover:border-primary/40 hover:bg-accent/40"
      href={output.href}
      // Nhãn bị `truncate` khi dài hơn panel ⇒ giữ đường thoát đọc trọn ngữ cảnh bằng hover.
      title={output.label}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md",
          // Đã mở rồi thì thẻ là đường QUAY LẠI, không phải việc cần làm ⇒ tông trung tính. Chưa mở
          // thì đây là hành động duy nhất trong thẻ ⇒ tông primary để mắt bắt được ngay.
          autoNavigatedNow ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <ArrowUpRightIcon className="size-3.5 transition-transform group-hover:translate-x-px group-hover:-translate-y-px" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-sm">{title}</span>
          {/* `shrink-0`: trạng thái LUÔN đọc được, phần bị cắt là tên trang (còn nguyên ở `title`). */}
          <span className={cn("shrink-0 text-[11px]", autoNavigatedNow ? "text-muted-foreground" : "text-primary")}>
            {autoNavigatedNow ? "Đã mở" : "Mở trang"}
          </span>
        </span>
        {context !== undefined && <span className="mt-px block truncate text-muted-foreground text-xs">{context}</span>}
        {downgradedForDirty && (
          <span className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500">
            <PencilLineIcon className="size-3 shrink-0" />
            Trang hiện tại có thay đổi chưa lưu
          </span>
        )}
      </span>
    </Link>
  );
}

export function renderNavigateTo(part: EveDynamicToolPart) {
  if (!isNavigateToOutput(part.output)) {
    return null;
  }
  if (!part.output.ok) {
    return <ToolErrorCard message={`Agent không thể mở trang này: ${part.output.hint}`} />;
  }
  return <NavigateToSuccessCard output={part.output} toolCallId={part.toolCallId} />;
}
