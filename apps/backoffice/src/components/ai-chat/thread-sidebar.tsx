"use client";

/**
 * AI Chat — `ThreadSidebar`: danh sách hội thoại trong registry (p1-01 §2.1, §5).
 *
 * KHÔNG phải `Sidebar` thứ 2 của shadcn — chỉ là panel thường bên trong nội dung trang `/ai`
 * (1 `SidebarProvider` chỉ quản 1 sidebar app; lồng thêm sẽ tranh cookie `sidebar_state` +
 * phím tắt `⌘B`, xem plan §2.1).
 *
 * VỊ TRÍ: cột **PHẢI** của trang `/ai` (quyết định 17/08). Trước đây ở trái, nhưng khi `AppSidebar`
 * luôn hiện (không còn auto-collapse) thì hai dải điều hướng ~16rem dính nhau ở trái đẩy hội thoại
 * lệch hẳn sang phải. Đặt lịch sử sang phải cho bố cục 3 vùng cân: điều hướng app | hội thoại giữa |
 * lịch sử. Thu/mở bằng nút trong `PageChatHeader`; dưới `md` hiện dạng `Sheet` (xem `_lib/ai-workspace.tsx`).
 */

import { useMemo, useState } from "react";

import { todayVN, yesterdayVN } from "@megawin/shared/utils";
import { PencilIcon, SearchIcon, SquarePenIcon, Trash2Icon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAiThreadsStore } from "@/stores/ai-threads/ai-threads-provider";
import type { AiThread } from "@/stores/ai-threads/thread-storage";

/** Nhãn nhóm ngày — "Hôm nay/Hôm qua/7 ngày trước/Cũ hơn", cùng khái niệm ChatGPT/Claude dùng. */
const GroupLabel = {
  Today: "Hôm nay",
  Yesterday: "Hôm qua",
  LastWeek: "7 ngày trước",
  Older: "Cũ hơn",
} as const;
type GroupLabel = (typeof GroupLabel)[keyof typeof GroupLabel];

const GROUP_ORDER: readonly GroupLabel[] = [
  GroupLabel.Today,
  GroupLabel.Yesterday,
  GroupLabel.LastWeek,
  GroupLabel.Older,
];

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function groupForThread(updatedAt: number, now: number): GroupLabel {
  const dateStr = new Date(updatedAt).toISOString().slice(0, 10);
  if (dateStr === todayVN()) {
    return GroupLabel.Today;
  }
  if (dateStr === yesterdayVN()) {
    return GroupLabel.Yesterday;
  }
  if (now - updatedAt <= SEVEN_DAYS_MS) {
    return GroupLabel.LastWeek;
  }
  return GroupLabel.Older;
}

function groupThreads(threads: readonly AiThread[]): Map<GroupLabel, AiThread[]> {
  const now = Date.now();
  const groups = new Map<GroupLabel, AiThread[]>();
  const sorted = threads.toSorted((a, b) => b.updatedAt - a.updatedAt);
  for (const thread of sorted) {
    const label = groupForThread(thread.updatedAt, now);
    const bucket = groups.get(label);
    if (bucket) {
      bucket.push(thread);
    } else {
      groups.set(label, [thread]);
    }
  }
  return groups;
}

/** Item đang được sửa tên — input inline thay chỗ title, KHÔNG dialog riêng (thao tác nhanh). */
function ThreadTitleInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Input
      autoFocus
      className="h-7 px-1.5 text-sm"
      onBlur={() => onCommit(value)}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onCommit(value);
        } else if (event.key === "Escape") {
          onCancel();
        }
      }}
      value={value}
    />
  );
}

/**
 * Nút hành động trên item (đổi tên / xoá): **CHỈ hiện khi hover hoặc focus** từ `md` trở lên.
 *
 * Bản trước (17/08) để nút xoá luôn hiện, nhưng như vậy mỗi dòng hội thoại có 2 icon thường trực
 * cạnh tiêu đề — danh sách rối và tăng rủi ro bấm nhầm vào nút phá huỷ. ChatGPT/Claude đều chỉ
 * hiện khi trỏ vào. Dưới `md` (thiết bị cảm ứng, không có hover) thì LUÔN hiện, nếu không staff
 * hết đường xoá.
 *
 * `group-focus-within` là bắt buộc cho bàn phím: tab tới nút mà nút vẫn `opacity-0` thì focus ring
 * vô hình, không biết mình đang ở đâu.
 */
const ITEM_ACTION_CLASS =
  "size-7 shrink-0 text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100";

function ThreadItem({ thread, isActive, onSelect }: { thread: AiThread; isActive: boolean; onSelect: () => void }) {
  const renameThread = useAiThreadsStore((s) => s.renameThread);
  const removeThread = useAiThreadsStore((s) => s.removeThread);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const displayTitle = thread.title === "" ? "Hội thoại mới" : thread.title;

  const commitRename = (value: string) => {
    const trimmed = value.trim();
    if (trimmed !== "" && trimmed !== thread.title) {
      renameThread(thread.id, trimmed);
    }
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-0.5 rounded-lg py-1.5 pr-1 pl-2.5 text-sm transition-colors",
        isActive ? "bg-accent font-medium text-accent-foreground" : "hover:bg-accent/60",
      )}
    >
      {isEditing ? (
        <ThreadTitleInput initialValue={thread.title} onCancel={() => setIsEditing(false)} onCommit={commitRename} />
      ) : (
        <button className="min-w-0 flex-1 truncate py-0.5 text-left" onClick={onSelect} type="button">
          {displayTitle}
        </button>
      )}
      {!isEditing && (
        <>
          <Button
            aria-label={`Đổi tên hội thoại ${displayTitle}`}
            className={ITEM_ACTION_CLASS}
            onClick={(event) => {
              event.stopPropagation();
              setIsEditing(true);
            }}
            size="icon-sm"
            variant="ghost"
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <Button
            aria-label={`Xoá hội thoại ${displayTitle}`}
            className={cn(ITEM_ACTION_CLASS, "hover:text-destructive")}
            onClick={(event) => {
              event.stopPropagation();
              setConfirmDelete(true);
            }}
            size="icon-sm"
            variant="ghost"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </>
      )}
      <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            {/* Nêu ĐÚNG TÊN hội thoại sẽ bị xoá — dialog chỉ hỏi "Xoá hội thoại này?" không đủ rõ
                khi staff mở nó từ một dòng trong danh sách dài (dễ xoá nhầm dòng bên cạnh). */}
            <AlertDialogTitle>Xoá “{displayTitle}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Hội thoại sẽ bị xoá khỏi danh sách trên trình duyệt này và không thể hoàn tác. Dữ liệu hội thoại phía máy
              chủ không bị xoá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            {/* `variant="destructive"` (prop của `AlertDialogAction`) — KHÔNG đè `bg-destructive`
                bằng className: cva của `Button` đã sinh `bg-primary` cùng specificity nên class thêm
                vào không thắng, verify 17/08 nút vẫn ra màu xanh primary. */}
            <AlertDialogAction onClick={() => removeThread(thread.id)} variant="destructive">
              Xoá hội thoại
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ThreadSidebar({ className }: { className?: string }) {
  const threads = useAiThreadsStore((s) => s.threads);
  const activeThreadId = useAiThreadsStore((s) => s.activeThreadId);
  const hydrated = useAiThreadsStore((s) => s.hydrated);
  const setActiveThread = useAiThreadsStore((s) => s.setActiveThread);
  const createThread = useAiThreadsStore((s) => s.createThread);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (search.trim() === "") {
      return threads;
    }
    const query = search.trim().toLowerCase();
    return threads.filter((thread) => thread.title.toLowerCase().includes(query));
  }, [threads, search]);

  const grouped = useMemo(() => groupThreads(filtered), [filtered]);
  const isEmpty = hydrated && filtered.length === 0;

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col bg-sidebar/40", className)}>
      <div className="flex flex-col gap-2 p-3">
        {/* Trong danh sách thì GIỮ chữ "Chat mới" (staff feedback 17/08): đây là hành động chính của
            panel, nhãn chữ rõ hơn icon trần. Header trang mới là chỗ chỉ dùng icon. */}
        <Button className="w-full justify-start gap-2" onClick={createThread} variant="outline">
          <SquarePenIcon className="size-4" />
          Chat mới
        </Button>
        <div className="relative">
          <SearchIcon className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="h-8 bg-background pl-8 text-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm hội thoại…"
            value={search}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!hydrated ? null : isEmpty ? (
          <p className="px-2 py-6 text-center text-muted-foreground text-xs">
            {search.trim() === "" ? "Chưa có hội thoại nào." : "Không tìm thấy hội thoại phù hợp."}
          </p>
        ) : (
          GROUP_ORDER.map((label) => {
            const bucket = grouped.get(label);
            if (!bucket || bucket.length === 0) {
              return null;
            }
            return (
              <div className="mb-3" key={label}>
                <p className="px-2 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                  {label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {bucket.map((thread) => (
                    <ThreadItem
                      isActive={thread.id === activeThreadId}
                      key={thread.id}
                      onSelect={() => setActiveThread(thread.id)}
                      thread={thread}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
