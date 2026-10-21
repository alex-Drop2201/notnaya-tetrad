import type * as React from "react";
import { NavBar } from "@/components/layout";

/** Full-height screen with a navigation bar, scrolling content and a pinned footer button. */
export function FormScreen({
  title,
  back,
  footer,
  children,
}: {
  title: string;
  back: { label: string; onClick: () => void };
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <NavBar back={back} title={title} />
      <main className="flex-1 overflow-y-auto pt-4">{children}</main>
      {footer && (
        <div className="pb-safe border-t border-border/70 bg-background/90 px-4 pt-3 pb-3 backdrop-blur-xl">{footer}</div>
      )}
    </div>
  );
}
