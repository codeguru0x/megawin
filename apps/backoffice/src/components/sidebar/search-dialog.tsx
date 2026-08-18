"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import type { LucideIcon } from "lucide-react";
import { BookOpenIcon, LayoutDashboardIcon, Search, SparklesIcon } from "lucide-react";

import { STAFF_GUIDE_MANIFEST } from "@/app/(main)/guides/_lib/staff-manifest";
import { useAiPanel } from "@/components/ai-panel/ai-panel-provider";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { AI_ASSISTANT_NAME } from "@/config/app-config";
import { useUserRoles } from "@/hooks/use-user-roles";
import { ACCOUNT_NAV_ITEMS } from "@/lib/account-nav";
import { buildNavHref, NAV_REGISTRY, NavPage } from "@/lib/nav-registry";
import { hasAnyRole } from "@/lib/roles";
import type { NavMainItem } from "@/navigation/sidebar/sidebar-items";
import { operatorSidebarItems } from "@/navigation/sidebar/sidebar-items";

interface SearchEntry {
  key: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
}

interface SearchGroup {
  id: number;
  label: string;
  entries: SearchEntry[];
}

/** Url placeholder trong `sidebar-items.ts` cho nhóm chưa mở (`comingSoon`) — KHÔNG phải route thật. */
const PLACEHOLDER_URL = "#";

/**
 * Key React cho entry. Không dùng thẳng `url` vì mọi mục `comingSoon` trong
 * `sidebar-items.ts` đều là `"#"` (VD nhóm "Xổ số TT" có 7 subItems cùng `"#"`) → React báo
 * "two children with the same key". Với url placeholder, fallback sang title đầy đủ (đã gồm tiền
 * tố tên cha nên unique trong nhóm).
 */
function toEntryKey(url: string, title: string): string {
  return url === PLACEHOLDER_URL ? `${PLACEHOLDER_URL}:${title}` : url;
}

/**
 * Item có `subItems` chỉ là điểm mở collapsible/dropdown trên sidebar (xem
 * `nav-main.tsx` `NavItemExpanded`/`NavItemCollapsed`) — `item.url` không phải
 * route thật nên KHÔNG đưa item cha vào kết quả tìm kiếm. Chỉ list các
 * `subItems` (route lá thật sự điều hướng được), giữ tên cha làm tiền tố cho rõ
 * ngữ cảnh (VD "Lotto 5/35 · Vận hành").
 */
function toSearchEntries(item: NavMainItem): SearchEntry[] {
  if (!item.subItems?.length) {
    return [
      {
        key: toEntryKey(item.url, item.title),
        title: item.title,
        url: item.url,
        icon: item.icon,
        comingSoon: item.comingSoon,
      },
    ];
  }

  return item.subItems.map((sub) => {
    const title = `${item.title} · ${sub.title}`;
    return {
      key: toEntryKey(sub.url, title),
      title,
      url: sub.url,
      icon: sub.icon ?? item.icon,
      comingSoon: sub.comingSoon,
    };
  });
}

/**
 * Path mà `sidebar-items.ts` đã liệt kê — dùng để KHÔNG lặp entry `nav-registry` trỏ cùng route
 * (VD `reports-settle`/`audit-logs`/`players-list` đã có trong sidebar dưới tên/nhóm khác).
 */
function collectSidebarPaths(groups: NavMainItem[][]): Set<string> {
  const paths = new Set<string>();
  for (const items of groups) {
    for (const item of items) {
      for (const entry of toSearchEntries(item)) {
        // Placeholder "#" không phải route → không tính là "sidebar đã có path này".
        if (entry.url === PLACEHOLDER_URL) {
          continue;
        }
        paths.add(entry.url);
      }
    }
  }
  return paths;
}

/**
 * Entry từ `nav-registry.ts` mà sidebar KHÔNG có — CHỈ trang không có dynamic segment (palette
 * không có chỗ nhập ID, p1-04 §5). `guides-resettle` (có segment) xử lý riêng ở
 * {@link buildResettleEntries} vì tập giá trị hữu hạn (9 URL).
 */
function buildRegistryOnlyEntries(sidebarPaths: ReadonlySet<string>): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const def of Object.values(NAV_REGISTRY)) {
    if (def.segments || sidebarPaths.has(def.pathTemplate)) {
      continue;
    }
    const icon = def.pathTemplate === "/dashboard" ? LayoutDashboardIcon : BookOpenIcon;
    entries.push({ key: def.pathTemplate, title: def.label, url: def.pathTemplate, icon });
  }
  return entries;
}

/**
 * 9 URL resettle hữu hạn (3 game jackpot × type-a/b1/b2) — dựng từ `STAFF_GUIDE_MANIFEST` (đã lọc
 * chỉ topic `resettle`, tiêu đề doc thật, dùng lại chứ không lặp title ở đây — DRY §5
 * code-quality) và validate qua {@link buildNavHref} (nav-registry là nguồn chân lý cho URL, bỏ
 * qua combo nào registry từ chối — phòng trường hợp 2 nguồn lệch nhau trong tương lai, KHÔNG
 * crash palette).
 */
function buildResettleEntries(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const game of STAFF_GUIDE_MANIFEST) {
    for (const topic of game.topics) {
      for (const doc of topic.docs) {
        const result = buildNavHref(NavPage.GuidesResettle, {
          segments: { gameKey: game.gameKey, docSlug: doc.slug },
        });
        if (!result.ok) {
          continue;
        }
        entries.push({
          key: result.href,
          title: `${game.title} · ${doc.title}`,
          url: result.href,
          icon: BookOpenIcon,
        });
      }
    }
  }
  return entries;
}

export function SearchDialog() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const userRoles = useUserRoles();
  const {
    actions: { setOpen: setAiPanelOpen },
  } = useAiPanel();

  // Đồng bộ với NavMain: chỉ đưa vào kết quả tìm kiếm route mà user hiện tại
  // thực sự thấy trên sidebar (filter group → item → subItem theo roles).
  const searchGroups = React.useMemo<SearchGroup[]>(() => {
    const visibleGroups = operatorSidebarItems.filter((group) => hasAnyRole(group.roles, userRoles));
    const sidebarPaths = collectSidebarPaths(visibleGroups.map((group) => group.items));

    const fromSidebar = visibleGroups
      .map((group) => ({
        id: group.id,
        label: group.label ?? "",
        entries: group.items.filter((item) => hasAnyRole(item.roles, userRoles)).flatMap(toSearchEntries),
      }))
      .filter((group) => group.entries.length > 0);

    // Bổ sung entry `nav-registry` sidebar không có (§5 plan p1-04) — id cố định cao để không
    // trùng id nhóm sidebar hiện tại (1-5), tách "Cá nhân" khỏi nhóm "Tài khoản" đã có (công ty/
    // người chơi) để không gây hiểu lầm 2 khái niệm khác nhau cùng tên.
    const extraGroups: SearchGroup[] = [
      { id: 1001, label: "Điều hướng nhanh", entries: buildRegistryOnlyEntries(sidebarPaths) },
      { id: 1002, label: "Hướng dẫn kết sổ lại", entries: buildResettleEntries() },
      {
        id: 1003,
        label: "Cá nhân",
        entries: ACCOUNT_NAV_ITEMS.map((item) => ({
          key: item.href,
          title: item.title,
          url: item.href,
          icon: item.icon,
        })),
      },
    ].filter((group) => group.entries.length > 0);

    return [...fromSidebar, ...extraGroups];
  }, [userRoles]);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleAskAi = React.useCallback(() => {
    setOpen(false);
    setAiPanelOpen(true);
  }, [setAiPanelOpen]);

  const handleSelect = React.useCallback(
    (url: string) => {
      setOpen(false);
      router.push(url);
    },
    [router],
  );

  return (
    <>
      <Button
        variant="link"
        className="px-0! font-normal text-muted-foreground hover:no-underline"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        Search
        <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium text-[10px]">
          <span className="text-xs">⌘</span>J
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Tìm trang, báo cáo, cấu hình…" />
        <CommandList>
          <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty>
          <CommandGroup heading="AI">
            <CommandItem className="py-1.5!" onSelect={handleAskAi}>
              <SparklesIcon className="text-primary" />
              <span>Hỏi {AI_ASSISTANT_NAME} về trang này</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          {searchGroups.map((group, i) => (
            <React.Fragment key={group.id}>
              {i !== 0 && <CommandSeparator />}
              <CommandGroup heading={group.label}>
                {group.entries.map((entry) => (
                  <CommandItem
                    key={entry.key}
                    className="py-1.5!"
                    disabled={entry.comingSoon}
                    onSelect={() => handleSelect(entry.url)}
                  >
                    {entry.icon && <entry.icon />}
                    <span>{entry.title}</span>
                    {entry.comingSoon && (
                      <span className="ml-auto rounded-md bg-gray-200 px-2 py-1 text-xs dark:text-gray-800">Soon</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </React.Fragment>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
