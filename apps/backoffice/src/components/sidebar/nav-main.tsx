"use client";

import { Fragment, useMemo } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AccountRole } from "@megawin/identity/entities";
import { ChevronRight } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { hasAnyRole } from "@/lib/roles";
import type { NavGroup, NavMainItem } from "@/navigation/sidebar/sidebar-items";

interface NavMainProps {
  readonly items: readonly NavGroup[];
  /**
   * Roles của user (từ server session, truyền xuống qua `AppSidebar`).
   *
   * KHÔNG đọc từ `useUserRoles()` ở đây: hook đó dựa trên `useSession()`
   * client-only nên lúc SSR trả `[]` → server bỏ item admin-only, client giữ lại
   * → React so lệch `href`/icon của các item sau đó và huỷ toàn bộ tree.
   */
  readonly userRoles: readonly AccountRole[];
}

const IsComingSoon = () => (
  <span className="ml-auto rounded-md bg-gray-200 px-2 py-1 text-xs dark:text-gray-800">Soon</span>
);

const NavItemExpanded = ({
  item,
  isActive,
  isSubmenuOpen,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  isSubmenuOpen: (subItems?: NavMainItem["subItems"]) => boolean;
}) => {
  // Item không có submenu → link thuần, KHÔNG bọc Collapsible/CollapsibleTrigger.
  // Bọc trigger lên <Link> gắn aria-controls/aria-expanded (useId) gây hydration
  // mismatch và sai ngữ nghĩa (link không phải trigger).
  if (!item.subItems) {
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild aria-disabled={item.comingSoon} isActive={isActive(item.url)} tooltip={item.title}>
          <Link prefetch={false} href={item.url} target={item.newTab ? "_blank" : undefined}>
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            {item.comingSoon && <IsComingSoon />}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible key={item.title} asChild defaultOpen={isSubmenuOpen(item.subItems)} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            disabled={item.comingSoon}
            isActive={isActive(item.url, item.subItems)}
            tooltip={item.title}
          >
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            {item.comingSoon && <IsComingSoon />}
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.subItems.map((subItem) => (
              <SidebarMenuSubItem key={subItem.title}>
                {subItem.sectionLabel && (
                  <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {subItem.sectionLabel}
                  </p>
                )}
                <SidebarMenuSubButton aria-disabled={subItem.comingSoon} isActive={isActive(subItem.url)} asChild>
                  <Link prefetch={false} href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                    {subItem.icon && <subItem.icon />}
                    <span>{subItem.title}</span>
                    {subItem.comingSoon && <IsComingSoon />}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
};

const NavItemCollapsed = ({
  item,
  isActive,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
}) => {
  return (
    <SidebarMenuItem key={item.title}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            disabled={item.comingSoon}
            tooltip={item.title}
            isActive={isActive(item.url, item.subItems)}
          >
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            <ChevronRight />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-50 space-y-1" side="right" align="start">
          {item.subItems?.map((subItem) => (
            // sectionLabel render NGOÀI DropdownMenuItem — asChild (Radix Slot)
            // chỉ nhận đúng 1 child, 2 children gây lỗi runtime/hydration.
            <Fragment key={subItem.title}>
              {subItem.sectionLabel && (
                <p className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 pointer-events-none">
                  {subItem.sectionLabel}
                </p>
              )}
              <DropdownMenuItem asChild>
                <SidebarMenuSubButton
                  asChild
                  className="focus-visible:ring-0"
                  aria-disabled={subItem.comingSoon}
                  isActive={isActive(subItem.url)}
                >
                  <Link prefetch={false} href={subItem.url} target={subItem.newTab ? "_blank" : undefined}>
                    {subItem.icon && <subItem.icon className="[&>svg]:text-sidebar-foreground" />}
                    <span>{subItem.title}</span>
                    {subItem.comingSoon && <IsComingSoon />}
                  </Link>
                </SidebarMenuSubButton>
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

export function NavMain({ items, userRoles }: NavMainProps) {
  const path = usePathname();
  const { state, isMobile } = useSidebar();

  const isItemActive = (url: string, subItems?: NavMainItem["subItems"]) => {
    if (subItems?.length) {
      return subItems.some((sub) => path.startsWith(sub.url));
    }
    return path === url;
  };

  const isSubmenuOpen = (subItems?: NavMainItem["subItems"]) => {
    return subItems?.some((sub) => path.startsWith(sub.url)) ?? false;
  };

  // Filter groups → items → subItems theo roles của user hiện tại.
  // `items` là const module-level và `userRoles` đến từ server prop → deps stable,
  // memo tránh dựng lại toàn bộ mảng nav mỗi lần đổi route (usePathname).
  const visibleGroups = useMemo(
    () =>
      items
        .filter((group) => hasAnyRole(group.roles, userRoles))
        .map((group) => ({
          ...group,
          items: group.items
            .filter((item) => hasAnyRole(item.roles, userRoles))
            .map((item) => ({
              ...item,
              subItems: item.subItems?.filter((sub) => hasAnyRole(sub.roles, userRoles)),
            })),
        }))
        // Bỏ group không còn item nào sau khi filter
        .filter((group) => group.items.length > 0),
    [items, userRoles],
  );

  return (
    <>
      {visibleGroups.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {group.items.map((item) => {
                if (state === "collapsed" && !isMobile) {
                  // If no subItems, just render the button as a link
                  if (!item.subItems) {
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          aria-disabled={item.comingSoon}
                          tooltip={item.title}
                          isActive={isItemActive(item.url)}
                        >
                          <Link prefetch={false} href={item.url} target={item.newTab ? "_blank" : undefined}>
                            {item.icon && <item.icon />}
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  // Otherwise, render the dropdown as before
                  return <NavItemCollapsed key={item.title} item={item} isActive={isItemActive} />;
                }
                // Expanded view
                return (
                  <NavItemExpanded key={item.title} item={item} isActive={isItemActive} isSubmenuOpen={isSubmenuOpen} />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
