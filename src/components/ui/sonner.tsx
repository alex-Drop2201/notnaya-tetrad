import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from "lucide-react";
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="system"
    className="toaster group"
    position="top-center"
    icons={{
      success: <CircleCheck className="size-4" />,
      info: <Info className="size-4" />,
      warning: <TriangleAlert className="size-4" />,
      error: <OctagonX className="size-4" />,
      loading: <LoaderCircle className="size-4 animate-spin" />,
    }}
    style={
      {
        "--normal-bg": "var(--surface-raised)",
        "--normal-text": "var(--foreground)",
        "--normal-border": "var(--separator)",
        "--border-radius": "var(--radius-lg)",
        "--offset-top": "calc(var(--safe-top) + 8px)",
      } as React.CSSProperties
    }
    {...props}
  />
);

export { Toaster };
