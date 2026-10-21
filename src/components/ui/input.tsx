import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-md bg-transparent px-0 text-body text-foreground outline-none placeholder:text-faint disabled:pointer-events-none disabled:opacity-50",
        "aria-invalid:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
