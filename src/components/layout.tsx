import { ChevronLeft } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

// iOS-style building blocks: translucent navigation bar, large title, grouped list.

interface NavBarProps {
  back?: { onClick: () => void; label?: string; a11yLabel?: string };
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Thin line under the bar, shown once the page scrolls. */
  hairline?: boolean;
  /** Space kept free for the back button and actions, [left, right] in px. */
  titleInset?: [number, number];
  /** The bar title is the screen's main heading (screens without a large title). */
  titleIsHeading?: boolean;
}

export function NavBar({ back, title, actions, className, hairline = true, titleInset = [96, 96], titleIsHeading }: NavBarProps) {
  const Title = titleIsHeading ? "h1" : "div";
  return (
    <header
      className={cn(
        "pt-safe sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200",
        hairline ? "border-border/70" : "border-transparent",
        className,
      )}
    >
      <div className="relative flex h-11 items-center justify-between px-1.5">
        <div className="flex min-w-0 items-center">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              aria-label={back.label ? undefined : back.a11yLabel}
              className="flex h-11 min-w-11 items-center gap-0.5 rounded-md pr-2 text-body text-foreground outline-none active:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-7" strokeWidth={2.2} aria-hidden />
              {back.label && <span className="-ml-0.5">{back.label}</span>}
            </button>
          )}
        </div>
        {title && (
          <Title
            className="pointer-events-none absolute truncate text-center text-body font-semibold animate-in fade-in-0 duration-200"
            style={{ left: titleInset[0], right: titleInset[1] }}
          >
            {title}
          </Title>
        )}
        <div className="flex items-center gap-0.5">{actions}</div>
      </div>
    </header>
  );
}

export function LargeTitle({ children, trailing }: { children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between px-4 pt-1 pb-2">
      <h1 className="text-large-title font-bold tracking-[-0.02em]">{children}</h1>
      {trailing}
    </div>
  );
}

export function Group({
  title,
  footer,
  children,
  className,
}: {
  title?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-4", className)}>
      {title && <h2 className="px-4 pb-1.5 text-footnote uppercase tracking-[0.02em] text-muted-foreground">{title}</h2>}
      <div className="overflow-hidden rounded-lg bg-surface">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-footnote text-muted-foreground">{footer}</p>}
    </section>
  );
}

export function Row({ label, children, className }: { label?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex min-h-11 items-center gap-3 pl-4 pr-4 after:absolute after:right-0 after:bottom-0 after:left-4 after:h-px after:bg-border last:after:hidden",
        className,
      )}
    >
      {label && <span className="shrink-0 text-body text-foreground">{label}</span>}
      <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
    </div>
  );
}
