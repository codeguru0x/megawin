"use client";

import Link from "next/link";

import type { AccountRole } from "@megawin/identity/entities";
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

export function AppSidebar({ scope: _scope, userRoles, user, ...props }: AppSidebarProps) {
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link prefetch={false} href="/">
                <Crown />
                <span className="font-semibold text-base">{APP_CONFIG.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={operatorSidebarItems} userRoles={userRoles} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
        <div className="group-data-[collapsible=icon]:hidden border-t border-sidebar-border px-3 pt-2 pb-1 text-xs leading-relaxed text-sidebar-foreground/40">
          <p>
            {APP_CONFIG.copyright} v.{APP_CONFIG.version}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
