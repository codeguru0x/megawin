"use client";

import { CircleCheckIcon, CircleXIcon, InfoIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Custom Toaster with professional semantic styling.
 *
 * - Uses sonner as base
 * - Colored left-border accent per type (success/error/warning/info)
 * - Tinted backgrounds with dark mode support
 * - Position: top-center — tránh đè Mira chat input (góc phải dưới) và bulk action
 *   bar trên Ops Hub (góc dưới bảng). `props.position` vẫn override được nếu cần.
 *
 * Requires importing toast.css in the app's globals.css:
 *   @import "@megawin/ui/styles/toast.css";
 */
function MegawinToaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      richColors={false}
      gap={8}
      icons={{
        success: <CircleCheckIcon className="size-4.5" />,
        info: <InfoIcon className="size-4.5" />,
        warning: <TriangleAlertIcon className="size-4.5" />,
        error: <CircleXIcon className="size-4.5" />,
        loading: <Loader2Icon className="size-4.5 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !shadow-lg !border !py-3.5 !px-4 !gap-3 !items-start",
          title: "!text-sm !font-semibold !leading-snug",
          description: "!text-xs !leading-relaxed !mt-0.5",
          icon: "!mt-0.5 !mr-0",
          actionButton: "!text-xs !font-medium !rounded-md !px-3 !py-1.5",
          closeButton: "!border-0 !bg-transparent !opacity-60 hover:!opacity-100 !transition-opacity",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { MegawinToaster };
