"use client";

import * as React from "react";

import { usePathname, useRouter } from "next/navigation";

import { defaultFilter, useCommandState } from "cmdk";
import type { LucideIcon } from "lucide-react";
import { BookOpenIcon, LayoutDashboardIcon, Search, SparklesIcon } from "lucide-react";

import { STAFF_GUIDE_MANIFEST } from "@/app/(main)/guides/_lib/staff-manifest";
import { useAiPanel } from "@/components/ai-panel/ai-panel-provider";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { AI_ASSISTANT_NAME, AI_FULL_PAGE_PATH } from "@/config/app-config";
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

/**
 * `value` của `CommandItem` "Hỏi Mira" — sentinel để {@link scorePaletteItem} nhận ra item này
 * mà không phải so theo nhãn (nhãn đổi theo query, xem {@link SearchDialog}).
 */
const ASK_AI_ITEM_VALUE = "ask-mira";

/**
 * Score cố định cho item "Hỏi Mira": **dương** nên item KHÔNG BAO GIỜ bị `cmdk` filter ẩn, dù staff
 * gõ câu hỏi chẳng khớp nhãn của nó.
 *
 * Đây là nửa đầu bản sửa bug 19/08: palette mở ra chọn sẵn "Hỏi Mira về trang này", nhưng vừa gõ
 * nội dung là item đó biến mất (`cmdk` filter item theo text của chính item) ⇒ không còn đường nào
 * đưa nội dung vừa gõ sang Mira. Nửa sau là **vị trí** của item (xem {@link SearchDialog}).
 *
 * Giá trị nhỏ hơn mọi score thật của `defaultFilter` (thang ~0.1–1) nên trong nội bộ nhóm "AI" nó
 * luôn xếp sau — nhưng KHÔNG dựa vào đó để quyết định item nào được chọn mặc định: xem
 * {@link SearchDialog} vì sao thứ tự thật là thứ tự DOM.
 */
const ASK_AI_SCORE = 1e-6;

/**
 * Filter của palette — `defaultFilter` (fuzzy score của cmdk) cho mọi entry điều hướng, score cố
 * định cho item "Hỏi Mira" (xem {@link ASK_AI_SCORE}).
 */
function scorePaletteItem(value: string, search: string, keywords?: string[]): number {
  if (value === ASK_AI_ITEM_VALUE) {
    return ASK_AI_SCORE;
  }
  return defaultFilter(value, search, keywords);
}

/**
 * Dòng "không có trang nào khớp" — thay cho `CommandEmpty`.
 *
 * `CommandEmpty` render theo `filtered.count === 0`, nhưng item "Hỏi Mira" luôn có score dương
 * (xem {@link ASK_AI_SCORE}) nên count không bao giờ về 0 ⇒ `CommandEmpty` thành dead code. Đọc
 * count qua `useCommandState` và trừ đi chính item AI: `count <= 1` ⇔ chỉ còn item AI.
 */
function NoPageMatchHint() {
  const onlyAskAiLeft = useCommandState((state) => state.search !== "" && state.filtered.count <= 1);
  if (!onlyAskAiLeft) {
    return null;
  }
  return (
    <p className="py-6 text-center text-muted-foreground text-sm">
      Không có trang nào khớp — nhấn Enter để hỏi {AI_ASSISTANT_NAME}.
    </p>
  );
}

/**
 * Command palette `⌘J` — tìm trang + đường tắt sang chat với Mira.
 *
 * ## Vì sao item "Hỏi Mira" cần cả `filter` riêng LẪN vị trí DOM động
 *
 * Bug 19/08: palette mở ra chọn sẵn "Hỏi Mira về trang này", nhưng staff gõ nội dung thì item đó
 * biến mất và không có cách nào chuyển nội dung vừa gõ sang Mira — phải mở panel gõ lại từ đầu.
 * Sửa cần HAI thứ, vì `cmdk` quyết định "hiện hay ẩn" và "được chọn mặc định" bằng hai cơ chế khác
 * nhau:
 *
 * 1. **Hiện hay ẩn** — theo score của `filter`. `CommandItem` tự ẩn khi score = 0, và nhãn của item
 *    AI không bao giờ khớp câu hỏi staff gõ ⇒ phải cấp score dương cố định
 *    ({@link scorePaletteItem} + {@link ASK_AI_SCORE}).
 * 2. **Được chọn mặc định** — theo **thứ tự DOM**, KHÔNG theo score. `cmdk` có sort theo score,
 *    nhưng nó chỉ sort **item trong cùng một group**; phần sort GROUP của cmdk 1.1.1 hỏng: nó tìm
 *    group bằng `querySelector('[cmdk-group=""][data-value="<group id>"]')`, trong khi `data-value`
 *    của group được set từ **heading** ("AI", "Báo cáo"…) chứ không phải id ⇒ selector không khớp gì
 *    và mọi group giữ nguyên thứ tự khai báo (đã verify bằng cách dump DOM trong test: item AI vẫn
 *    nằm đầu dù score 1e-6 so với "Tài chính" score ~1).
 *
 * Nên vị trí nhóm "AI" phải do CHÍNH component quyết định, và nó đảo theo ý định của staff:
 * - Chưa gõ gì ⇒ nhóm AI ở **đầu**: `⌘J` rồi Enter là "hỏi Mira về trang đang xem".
 * - Đang gõ ⇒ nhóm AI xuống **cuối**: trang khớp giữ quyền chọn mặc định, Enter vẫn ĐIỀU HƯỚNG như
 *   trước (palette + 2 ký tự là đường nhanh nhất cho việc này — `p1-04` §5, không được để AI chiếm
 *   Enter). Khi không trang nào khớp, item AI là item duy nhất còn lại nên tự được chọn ⇒ Enter gửi
 *   thẳng câu hỏi cho Mira.
 */
export function SearchDialog() {
  const [open, setOpen] = React.useState(false);
  /**
   * Query đang gõ — PHẢI controlled (không để cmdk tự giữ): đây là nội dung được chuyển sang Mira
   * khi staff chọn item "Hỏi Mira".
   */
  const [query, setQuery] = React.useState("");
  const router = useRouter();
  const pathname = usePathname();
  const userRoles = useUserRoles();
  const {
    actions: { setOpen: setAiPanelOpen, send: sendToAi },
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

  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    // Query là state của app (không của cmdk) nên phải tự dọn — nếu không, lần mở sau còn nguyên
    // câu hỏi cũ và item "Hỏi Mira" gợi ý gửi lại nó.
    if (!next) {
      setQuery("");
    }
  }, []);

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setQuery("");
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const askQuery = query.trim();

  /**
   * Chuyển staff sang chat với Mira. Có nội dung đang gõ ⇒ gửi luôn nội dung đó (Mira tự nhận thêm
   * route + filter URL của trang đang xem qua `prepareSend`); không có ⇒ chỉ mở panel để staff tự gõ.
   */
  const handleAskAi = React.useCallback(() => {
    handleOpenChange(false);
    // Trên `/ai` KHÔNG mở panel: trang đó chính là bề mặt chat và dùng CÙNG một agent instance —
    // mở thêm panel là 2 bề mặt hiển thị y hệt nhau (xem `AiPanelProvider`).
    if (pathname !== AI_FULL_PAGE_PATH) {
      setAiPanelOpen(true);
    }
    if (askQuery !== "") {
      sendToAi(askQuery);
    }
  }, [askQuery, handleOpenChange, pathname, setAiPanelOpen, sendToAi]);

  const handleSelect = React.useCallback(
    (url: string) => {
      handleOpenChange(false);
      router.push(url);
    },
    [handleOpenChange, router],
  );

  /**
   * Nhóm "AI" — render ở ĐẦU hoặc CUỐI `CommandList` tuỳ có đang gõ hay không (xem JSDoc component).
   * Dựng một lần rồi đặt vào một trong hai chỗ: nội dung y hệt nhau, khác duy nhất vị trí DOM.
   */
  const askAiGroup = (
    <CommandGroup heading="AI">
      <CommandItem className="py-1.5!" onSelect={handleAskAi} value={ASK_AI_ITEM_VALUE}>
        <SparklesIcon className="text-primary" />
        {askQuery === "" ? (
          <span>Hỏi {AI_ASSISTANT_NAME} về trang này</span>
        ) : (
          <span className="truncate">
            Hỏi {AI_ASSISTANT_NAME}: <span className="text-foreground">“{askQuery}”</span>
          </span>
        )}
      </CommandItem>
    </CommandGroup>
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
      <CommandDialog commandProps={{ filter: scorePaletteItem }} open={open} onOpenChange={handleOpenChange}>
        <CommandInput onValueChange={setQuery} placeholder="Tìm trang, báo cáo, cấu hình…" value={query} />
        <CommandList>
          <NoPageMatchHint />
          {/* Nhóm AI ĐẦU danh sách khi CHƯA gõ gì: lúc đó không có ý định tìm trang cụ thể, "Hỏi
              Mira về trang này" là hành động hợp lý nhất để chọn sẵn (bấm ⌘J rồi Enter). */}
          {askQuery === "" && askAiGroup}
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
          {/* Đang gõ ⇒ nhóm AI xuống CUỐI. Xem JSDoc `SearchDialog` mục "vị trí": cmdk 1.1.1 không
              sort được group nên đây là cách duy nhất nhường quyền chọn mặc định cho trang khớp —
              và khi không trang nào khớp, item AI là item duy nhất còn lại nên tự được chọn. */}
          {askQuery !== "" && (
            <>
              <CommandSeparator />
              {askAiGroup}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
