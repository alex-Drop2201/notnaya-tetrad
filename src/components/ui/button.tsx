import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-[background-color,color,opacity,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground active:bg-primary-pressed",
        destructive: "bg-destructive text-white active:opacity-90",
        outline: "border border-border bg-surface text-foreground active:bg-fill",
        secondary: "bg-fill text-foreground active:bg-fill-strong",
        ghost: "text-foreground active:bg-fill",
        plain: "font-normal text-foreground active:opacity-60",
        link: "font-normal text-select underline-offset-4 active:opacity-60",
      },
      size: {
        default: "h-11 px-4 text-body",
        lg: "h-[50px] w-full rounded-lg px-5 text-body",
        sm: "h-9 px-3 text-subhead",
        icon: "size-11 rounded-full",
        "icon-sm": "size-9 rounded-full",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
