"use client";

import { useRef, type ComponentProps, type FocusEvent, type MouseEvent } from "react";

import Link from "next/link";

import type { AccountRole } from "@megawin/identity/entities";
import { useQueryClient } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import type { AccountDisplayUser } from "@/lib/account-user";
import { operatorSidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { getNavDataPrefetch } from "./nav-data-prefetch";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

export type SidebarScope = "operator";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  scope: SidebarScope;
  /**
   * Roles của user, resolve từ server session ở `MainLayout`.
   *
   * Truyền bằng prop (không đọc `useSession()` trong client) để server và client
   * render cùng một danh sách nav → tránh hydration mismatch.
   */
  userRoles: readonly AccountRole[];
  /** Thông tin hiển thị của user, cũng resolve từ server session — lý do như `userRoles`. */
  user: AccountDisplayUser;
}

/**
 * Logo → `/` (dashboard). `prefetch` + forward Slot props giống `NavHref`.
 * RQ prefetch Dashboard trên hover/focus (p1-02).
 */
function BrandLink({
  onIntent,
  onMouseEnter,
  onFocus,
  ...slotProps
}: { onIntent?: () => void } & Omit<ComponentProps<typeof Link>, "href" | "prefetch" | "children">) {
  const intentFiredRef = useRef(false);

  const fireIntent = () => {
    if (intentFiredRef.current || !onIntent) {
      return;
    }
    intentFiredRef.current = true;
    onIntent();
  };

  return (
    <Link
      {...slotProps}
      prefetch
      href="/"
      onMouseEnter={(e: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(e);
        fireIntent();
      }}
      onFocus={(e: FocusEvent<HTMLAnchorElement>) => {
        onFocus?.(e);
        fireIntent();
      }}
    >
      <Crown />
      <span className="text-base font-semibold">{APP_CONFIG.name}</span>
    </Link>
  );
}

export function AppSidebar({ scope: _scope, userRoles, user, ...props }: AppSidebarProps) {
  const queryClient = useQueryClient();
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;
  const dashboardIntent = getNavDataPrefetch("/", queryClient);

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <BrandLink onIntent={dashboardIntent} />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={operatorSidebarItems} userRoles={userRoles} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
        <div className="border-sidebar-border text-sidebar-foreground/40 border-t px-3 pt-2 pb-1 text-xs leading-relaxed group-data-[collapsible=icon]:hidden">
          <p>
            {APP_CONFIG.copyright} v.{APP_CONFIG.version}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
