"use client";

/**
 * AI Chat — gộp các bước "nội thất" của agent vào MỘT mục đóng sẵn.
 *
 * VÌ SAO (feedback 17/08): staff backoffice chỉ quan tâm KẾT QUẢ. Hội thoại trước đây phơi mọi
 * part kỹ thuật thành các thẻ ngang hàng với câu trả lời — "Đang chạy", JSON tham số, và tệ nhất là
 * thẻ đỏ `Tool "getGameConfig" ... non-JSON-serializable` (xem ảnh bug 17/08). Ba tác hại: (1)
 * staff không hiểu, tưởng hệ thống hỏng nặng; (2) phơi bề mặt công cụ của agent, mời người tò mò
 * thử điều khiển nó; (3) lấn át câu trả lời thật.
 *
 * KHÔNG ẩn tuyệt đối, mà GỘP + ĐÓNG SẴN: khi staff báo "số này sai", người xử lý cần xem agent đã
 * tra gì mà không phải mò log server. Đóng sẵn ⇒ ai không bấm thì không thấy gì, đúng yêu cầu; còn
 * mở được ⇒ vẫn đối soát được. Nhãn tầng ngoài mặc định là câu tĩnh "Xem dữ liệu nguồn" — không nêu
 * tool, không nêu số lần; xem CHỐT LẦN 2 bên dưới.
 *
 * HAI TẦNG GẬP (17/08, xem CHỐT LẦN 2 bên dưới về việc tầng ngoài giờ tĩnh): mục này là tầng
 * ngoài; bên trong, mỗi lần tra là MỘT DÒNG gạch đóng sẵn (`ToolResultLine`, xem
 * `generic-tool-view.tsx`), không phải card mở. Nếu chỉ có tầng ngoài thì mở mục ra vẫn là 7 card
 * ~550px xếp dọc — chỉ dời vấn đề đi một cú bấm. Với dòng gạch, mở mục ra thấy 7 dòng ~20px, đọc
 * hết trong một màn hình, muốn số nào thì bung riêng dòng đó.
 *
 * CHỐT LẦN 2 (17/08, tối) — nhãn tầng ngoài đổi sang TĨNH, không còn nêu loại việc: nhãn cũ
 * ("Đã đọc cấu hình game · 7 lần", "Đã chạy lệnh hệ thống") tuy không nêu tên tool nhưng vẫn nêu
 * HÀNH VI xử lý phía sau — với sản phẩm publish ra ngoài, "AI này có thể chạy lệnh hệ thống" là
 * thông tin không nên xuất hiện trong UI, bất kể sandbox có cô lập tới đâu.
 *
 * CHỐT LẦN 3 (17/08, đêm) — ẨN TUYỆT ĐỐI cả mục gộp khi debug tắt (mặc định), không chỉ đổi nhãn.
 * Lý do đổi từ CHỐT LẦN 2: mục gộp dù đóng sẵn vẫn là một hàng chữ mời bấm ("có gì đó ở đây") —
 * với staff không rành kỹ thuật, tồn tại của nó tự nó đã là câu hỏi, kể cả khi nhãn tĩnh không nêu
 * gì. Giờ khi debug tắt, TOÀN BỘ part nội thất (tool, reasoning) biến mất khỏi cây render — không
 * còn accordion, không còn `SettingsIcon`. Khi cần đối soát ("số này sai"), người xử lý bật
 * {@link SHOW_TOOL_DETAIL} (env `NEXT_PUBLIC_AI_CHAT_DEBUG=true`, xem `env.ts`) rồi hỏi lại CÙNG
 * câu hỏi trong hội thoại MỚI — vì phần nội thất bị bỏ qua hoàn toàn lúc build segment (không phải
 * ẩn bằng CSS), dữ liệu của các message ĐÃ gửi trước khi bật debug không tự hiện ra được.
 *
 * PHÂN LOẠI ở {@link isInternalPart} — sửa ở đó, không rải điều kiện ra chỗ khác. Tool nào được
 * hiện thẳng thì khai ở `AI_TOOL_CARD_PLACEMENT` (`tool-renderers/registry.tsx`).
 */

import type { ReactNode } from "react";

import type { EveMessagePart } from "eve/react";
import { ChevronDownIcon, SettingsIcon } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { env } from "@/env";

import {
  EveBuiltinToolName,
  getToolActivityPhrase,
  getToolCardPlacement,
  getToolRenderer,
  ToolCardPlacement,
} from "./tool-renderers/registry";

/**
 * Bật lại nhãn chi tiết theo tool ("Đã đọc cấu hình game · 7 lần") — cổng riêng
 * `NEXT_PUBLIC_AI_CHAT_DEBUG` (xem `env.ts`), KHÔNG gắn theo `NEXT_PUBLIC_APP_ENV`: đây là toggle
 * của một tính năng debug, cần bật/tắt độc lập với môi trường deploy (staging vẫn có thể cần bật
 * tạm để điều tra một ca lỗi, dev local vẫn có thể cần tắt để xem đúng UI staff sẽ thấy).
 */
const SHOW_TOOL_DETAIL = env.NEXT_PUBLIC_AI_CHAT_DEBUG === "true";

/**
 * Output tool báo THẤT BẠI (`{ success: false, … }` — envelope của `toToolResult`, xem
 * `src/server/ai/tool-result.ts`)?
 *
 * Cần vì `output-error` không phải hình thái duy nhất của lỗi: use-case thất bại vẫn trả HTTP-OK
 * cho eve, part vào `output-available` bình thường và renderer chuyên biệt dựng ra một card ĐỎ giữa
 * hội thoại ("Hệ thống chưa lấy được dữ liệu cho yêu cầu này" — thấy thật 17/08). Model đã diễn đạt
 * việc đó bằng lời ngay bên dưới, nên card chỉ là một lời báo lỗi thứ hai, to và đỏ.
 */
function isFailedToolOutput(output: unknown): boolean {
  return typeof output === "object" && output !== null && (output as { success?: unknown }).success === false;
}

/**
 * Part này là nội thất agent (gộp vào mục đóng) hay nội dung dành cho staff (hiện thẳng)?
 *
 * HIỆN THẲNG:
 * - `text` — chính là câu trả lời.
 * - `file`, `authorization` — do staff cần bấm/mở, hoặc là kết quả họ yêu cầu.
 * - tool CÓ `inputRequest` (HITL: duyệt `web_fetch`, `ask_question`) — gộp vào mục đóng thì câu hỏi
 *   biến thành nút không ai bấm, agent treo tới hết timeout. Đây là ngoại lệ tuyệt đối, và xét theo
 *   `inputRequest` chứ không theo `state` vì `ask_question` chờ trả lời ở `input-available` —
 *   trùng state với "tool đang chạy" mà ta ẩn.
 * - tool `Primary` có KẾT QUẢ THÀNH CÔNG và có renderer — hiện chỉ `navigateTo`, vì output
 *   của nó là NÚT điều hướng chứ không phải số để đọc. Xem {@link ToolCardPlacement}.
 *
 * GỘP VÀO MỤC ĐÓNG: `reasoning` (chain-of-thought), tool đang chạy, tool lỗi (cả `output-error` lẫn
 * envelope `success: false`), tool bị từ chối, mọi tool TRẢ DỮ LIỆU (bảng số là dữ liệu đối soát,
 * câu trả lời nằm trong text của trợ lý), và tool không có renderer (output chỉ là JSON thô).
 *
 * TIÊU CHÍ CŨ ĐÃ BỎ (17/08): "có renderer ⇒ hiện thẳng". "Đã viết renderer" là chi tiết kỹ thuật,
 * không nói gì về nhu cầu của staff — nó biến 7 lần đọc config (1 lần/game, cho câu hỏi so sánh
 * cross-game) thành 7 card giống hệt nhau. Giờ tiêu chí là placement khai tay theo tool, và tiêu
 * chí đó chỉ còn một câu hỏi: part này có cần staff BẤM gì không?
 */
function isInternalPart(part: EveMessagePart): boolean {
  if (part.type === "reasoning") {
    return true;
  }
  if (part.type !== "dynamic-tool") {
    return false;
  }
  // Giữ hiện cả khi ĐÃ trả lời (`inputResponse`): staff vừa bấm xong cần thấy quyết định của mình
  // có tác dụng — thẻ biến mất ngay sau khi bấm sẽ đọc như bấm không ăn.
  if (part.toolMetadata?.eve?.inputRequest !== undefined) {
    return false;
  }
  if (part.state === "output-available" && !part.partial) {
    return (
      getToolCardPlacement(part.toolName) !== ToolCardPlacement.Primary ||
      getToolRenderer(part.toolName) === undefined ||
      isFailedToolOutput(part.output)
    );
  }
  return true;
}

/**
 * `reasoning` và `bash` — ẨN TUYỆT ĐỐI, KỂ CẢ KHI BẬT DEBUG.
 *
 * Khác các tool còn lại: cả hai KHÔNG mang dữ liệu nghiệp vụ để đối soát — `reasoning` là suy nghĩ
 * nội bộ của model, `bash` chỉ chạy `python3` tính tổng/phần trăm (xem `agent/tools/bash.ts`), kết
 * quả của nó đã nằm trong text trả lời. Ẩn cả hai không mất khả năng đối soát nào, mà loại luôn
 * dòng dễ gây hiểu lầm nhất ("agent này có quyền chạy lệnh hệ thống") — kể cả lúc debug (CHỐT LẦN
 * 3) đang bật để xem tool nghiệp vụ, hai loại part này vẫn không có gì để soi.
 */
function isAlwaysHiddenPart(part: EveMessagePart): boolean {
  if (part.type === "reasoning") {
    return true;
  }
  return part.type === "dynamic-tool" && part.toolName === EveBuiltinToolName.Bash;
}

/** Một part kèm chỉ số gốc trong `message.parts` — chỉ số cần cho `key` và cho việc dò part text cuối. */
export interface IndexedPart {
  index: number;
  part: EveMessagePart;
}

/**
 * Một đoạn liên tiếp của message: hoặc 1 part hiện thẳng, hoặc 1 chùm part nội thất liền kề.
 *
 * Gộp theo CHÙM LIỀN KỀ (không dồn hết vào một mục ở đầu/cuối) để giữ đúng trình tự kể: "suy nghĩ →
 * card số liệu → suy nghĩ tiếp → câu trả lời" vẫn đọc được như vậy, chỉ khác là hai lần suy nghĩ
 * nằm trong hai mục đóng riêng.
 */
export type MessageSegment = { kind: "visible"; item: IndexedPart } | { kind: "internal"; items: IndexedPart[] };

/** Chia `parts` thành các {@link MessageSegment}, giữ nguyên thứ tự. */
export function toMessageSegments(parts: readonly EveMessagePart[]): MessageSegment[] {
  const segments: MessageSegment[] = [];

  for (const [index, part] of parts.entries()) {
    // `step-start` là ranh giới bước của eve, không có gì để hiển thị. Bỏ ở đây (thay vì để
    // `AgentMessagePart` trả `null`) vì nếu tính nó là nội thất thì nó sẽ cộng vào số bước và cắt
    // đôi các chùm liền kề, làm mục gộp bị chẻ vụn.
    if (part.type === "step-start") {
      continue;
    }

    if (!isInternalPart(part)) {
      segments.push({ item: { index, part }, kind: "visible" });
      continue;
    }

    // CHỐT LẦN 3: debug tắt (mặc định) ⇒ bỏ qua HOÀN TOÀN mọi part nội thất, không dựng accordion
    // nào cả — xem doc đầu file. Khác `isAlwaysHiddenPart` (luôn ẩn `reasoning`/`bash` dù debug bật
    // hay tắt): điều kiện này ẩn CẢ CÁC TOOL NGHIỆP VỤ (đọc config, tra báo cáo…) khi debug tắt,
    // chỉ hiện lại khi bật {@link SHOW_TOOL_DETAIL}.
    if (!SHOW_TOOL_DETAIL) {
      continue;
    }

    // Bỏ qua HOÀN TOÀN (không đưa vào segment nào) — khác `step-start` chỉ khác ở chỗ đây là
    // quyết định theo MÔI TRƯỜNG, không phải theo shape part. Bỏ qua thay vì lọc sau khi gộp: nếu
    // một chùm chỉ toàn `reasoning`/`bash` thì cả chùm biến mất, không còn accordion trống; nếu
    // chùm có xen tool khác, chùm đó vẫn liền mạch như part ẩn chưa từng tồn tại.
    if (isAlwaysHiddenPart(part)) {
      continue;
    }

    const last = segments.at(-1);
    if (last?.kind === "internal") {
      last.items.push({ index, part });
      continue;
    }
    segments.push({ items: [{ index, part }], kind: "internal" });
  }

  return segments;
}

/**
 * Chùm này CÒN ĐANG CHẠY? (có ít nhất 1 tool chưa có output)
 *
 * Quyết định thì của nhãn: `Đang đọc cấu hình game` vs `Đã đọc cấu hình game`. `reasoning` không
 * tính — nó không có state "chạy xong" rõ ràng và thường xen giữa các tool đã xong.
 */
function isChunkRunning(items: readonly IndexedPart[]): boolean {
  return items.some(({ part }) => part.type === "dynamic-tool" && part.state !== "output-available");
}

/**
 * Nhãn tĩnh dành cho staff — CHỐT LẦN 2 (17/08 tối): một câu DUY NHẤT, không đổi theo tool, không
 * đổi theo số lần gọi, không đổi theo đang chạy hay đã xong. Cố tình KHÔNG chia "Đang…"/"Đã…" như
 * bản chi tiết cũ — ghép thì vào đây dễ trôi lại thành mô tả tiến trình ("Đang tra gì đó"), và tín
 * hiệu "agent còn đang chạy" đã có dòng đếm giây cạnh tên Mira (`assistant-header.tsx`) lo rồi.
 * Coi đây là nhãn của Ô GẤP ("có dữ liệu nguồn ở đây, muốn xem thì bấm"), không phải báo tiến độ.
 *
 * CHỐT LẦN 3: từ khi debug tắt (mặc định) khiến `toMessageSegments` bỏ qua toàn bộ part nội thất
 * (không dựng segment "internal" nào), hàm/hằng số dưới đây CHỈ còn được gọi khi
 * {@link SHOW_TOOL_DETAIL} là `true` — nhãn tĩnh này không còn đường vào khi debug tắt, giữ lại
 * làm hằng số dùng chung để cả 2 chế độ debug đều có một điểm chữ nhất quán khi cần fallback
 * (chùm trộn nhiều loại việc không suy ra được câu chi tiết).
 */
const INTERNAL_STEPS_LABEL = "Xem dữ liệu nguồn";

/**
 * Nhãn dòng gập — CHỈ được gọi khi {@link SHOW_TOOL_DETAIL} là `true` (xem `toMessageSegments`).
 * Nêu tên tool + số lần gọi ("Đã đọc cấu hình game · 7 lần") để người bật debug xem ngay agent vừa
 * gọi tool nào mà không phải mở log server. Chùm trộn nhiều loại việc hoặc không suy ra được cụm từ
 * cho tool thì lùi về {@link INTERNAL_STEPS_LABEL} tĩnh.
 */
export function describeInternalChunk(items: readonly IndexedPart[]): string {
  const running = isChunkRunning(items);
  const toolNames = new Set<string>();
  for (const { part } of items) {
    if (part.type === "dynamic-tool") {
      toolNames.add(part.toolName);
    }
  }

  const onlyToolName = toolNames.size === 1 ? [...toolNames][0] : undefined;
  const phrase = onlyToolName === undefined ? undefined : getToolActivityPhrase(onlyToolName);
  if (phrase === undefined) {
    return INTERNAL_STEPS_LABEL;
  }

  // Đếm THEO SỐ LẦN GỌI TOOL, không theo `items.length`: chùm thường có cả `reasoning` xen vào nên
  // `items.length` sẽ nói "9 lần" cho 7 lần đọc config — con số sai, và staff đối chiếu được (họ
  // thấy 7 game trong câu trả lời) nên sai là lộ ngay.
  const callCount = items.filter(({ part }) => part.type === "dynamic-tool").length;
  const suffix = callCount > 1 ? ` · ${callCount} lần` : "";
  return `${running ? "Đang" : "Đã"} ${phrase}${suffix}`;
}

/**
 * Mục gộp đóng sẵn, nhãn theo {@link describeInternalChunk} (tĩnh mặc định, chi tiết khi bật debug).
 *
 * `defaultOpen` cố định `false`: KHÔNG mở tự động khi đang chạy. Mở lúc chạy rồi đóng lúc xong tạo
 * ra đúng thứ ta muốn bỏ — nội dung kỹ thuật nhảy vào mắt staff giữa lúc họ chờ, kèm layout co giãn.
 * Tín hiệu "đang làm việc" đã do dòng đếm giây cạnh tên Mira đảm nhiệm (`assistant-header.tsx`).
 */
export function InternalSteps({ children, items }: { children: ReactNode; items: readonly IndexedPart[] }) {
  return (
    <Collapsible className="not-prose w-full">
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-muted-foreground/70 text-xs transition-colors hover:text-foreground">
        <SettingsIcon className="size-3.5" />
        <span>{describeInternalChunk(items)}</span>
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-1 mt-2 space-y-2 border-muted border-l-2 pl-3 data-[state=closed]:animate-out data-[state=open]:animate-in">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
