"use client";

import Link from "next/link";

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
import { operatorSidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

export type SidebarScope = "operator";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  scope: SidebarScope;
}

export function AppSidebar({ scope: _scope, ...props }: AppSidebarProps) {
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
        <NavMain items={operatorSidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
        <div className="group-data-[collapsible=icon]:hidden border-t border-sidebar-border px-3 pt-2 pb-1 text-xs leading-relaxed text-sidebar-foreground/40">
          <p>
            {APP_CONFIG.copyright} v.{APP_CONFIG.version}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
