import type { ReactNode } from "react";

import { cookies } from "next/headers";

import { AiPanel } from "@/components/ai-panel/ai-panel";
import { AiPanelProvider } from "@/components/ai-panel/ai-panel-provider";
import { AiPanelTrigger } from "@/components/ai-panel/ai-panel-trigger";
import { ClientAccountGuard } from "@/components/auth/client-account-guard";
import { AccountSwitcher } from "@/components/sidebar/account-switcher";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SearchDialog } from "@/components/sidebar/search-dialog";
import { ThemeSwitcher } from "@/components/sidebar/theme-switcher";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { toAccountDisplayUser } from "@/lib/account-user";
import { requireOperatorSession } from "@/lib/auth-guard";
import { AI_PANEL_STATE_VALUES, clampAiPanelWidth } from "@/lib/preferences/ai-panel";
import { SIDEBAR_COLLAPSIBLE_VALUES, SIDEBAR_VARIANT_VALUES } from "@/lib/preferences/layout";
import { parseAccountRoles } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/providers/query-provider";
import { getPreference, getValueFromCookie } from "@/server/server-actions";
import { AiThreadsProvider } from "@/stores/ai-threads/ai-threads-provider";

export default async function MainLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await requireOperatorSession();
  // Roles lấy từ server session và truyền xuống bằng prop — KHÔNG để sidebar tự
  // đọc từ `useSession()` (client-only). Client session chưa có lúc SSR nên
  // roles = [] ở server, đầy đủ ở client → sidebar render lệch → hydration
  // mismatch (item chỉ dành cho admin bị lệch href/icon).
  const userRoles = parseAccountRoles((session.user as Record<string, unknown>).roles);
  // Cùng lý do như `userRoles`: NavUser/AccountSwitcher trước đây đọc `useAuth()` và
  // render skeleton khi `isPending` (luôn true lúc SSR) ⇒ cây DOM server ≠ client.
  const displayUser = toAccountDisplayUser(session.user);

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const [variant, collapsible, aiPanelState, aiPanelWidthRaw] = await Promise.all([
    getPreference("sidebar_variant", SIDEBAR_VARIANT_VALUES, "inset"),
    getPreference("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_VALUES, "icon"),
    getPreference("ai_panel_state", AI_PANEL_STATE_VALUES, "closed"),
    getValueFromCookie("ai_panel_width"),
  ]);
  const aiPanelDefaultOpen = aiPanelState === "open";
  const aiPanelDefaultWidth = clampAiPanelWidth(aiPanelWidthRaw);

  return (
    <QueryProvider>
      <ClientAccountGuard>
        <AiThreadsProvider>
          <SidebarProvider defaultOpen={defaultOpen}>
            <AiPanelProvider defaultOpen={aiPanelDefaultOpen} defaultWidth={aiPanelDefaultWidth}>
              <AppSidebar
                scope="operator"
                variant={variant}
                collapsible={collapsible}
                userRoles={userRoles}
                user={displayUser}
              />
              <SidebarInset
                className={cn(
                  "[html[data-content-layout=centered]_&]:mx-auto! [html[data-content-layout=centered]_&]:max-w-screen-2xl!",
                  "max-[113rem]:peer-data-[variant=inset]:mr-2! min-[101rem]:peer-data-[variant=inset]:peer-data-[state=collapsed]:mr-auto!",
                )}
              >
                <header
                  className={cn(
                    "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
                    "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
                  )}
                >
                  <div className="flex w-full items-center justify-between px-4 lg:px-6">
                    <div className="flex items-center gap-1 lg:gap-2">
                      <SidebarTrigger className="-ml-1" />
                      <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
                      <SearchDialog />
                    </div>
                    <div className="flex items-center gap-2">
                      <AiPanelTrigger />
                      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
                      <ThemeSwitcher />
                      <AccountSwitcher user={displayUser} />
                    </div>
                  </div>
                </header>
                {/* `min-h-0 flex-1` (KHÔNG `h-full`): `SidebarInset` đã `flex flex-col`, `flex-1`
                    cho item con chiếm hết chiều cao còn lại sau header như `h-full`, nhưng
                    `min-h-0` là điều kiện bắt buộc để `overflow-y-auto` bên trong trang (vd
                    `Conversation` ở trang `/ai`, p1-01 §2.1.2) thật sự cuộn — flex item mặc định
                    có `min-height: auto` (= nội dung), khiến nó không bao giờ co lại nhỏ hơn nội
                    dung để kích hoạt scroll, thay vào đó đẩy dài cả trang. Đổi ở đây ảnh hưởng
                    MỌI trang trong (main) — đã regression-test các trang report/operations/form
                    (p1-01 §6.8) trước khi merge. */}
                <div className="min-h-0 flex-1 p-4 md:p-6">{children}</div>
              </SidebarInset>
              <AiPanel />
            </AiPanelProvider>
          </SidebarProvider>
        </AiThreadsProvider>
      </ClientAccountGuard>
    </QueryProvider>
  );
}
