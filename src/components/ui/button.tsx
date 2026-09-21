import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const pressMotion =
  "transition-[transform,background-color,color,border-color,opacity,box-shadow] duration-150 ease-out active:not-disabled:scale-[0.96]";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40 select-none touch-manipulation",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-hover active:bg-primary-active",
        secondary: "border border-primary bg-surface text-primary hover:bg-primary-soft",
        ghost: "bg-transparent text-fg hover:bg-surface-muted",
        danger: "bg-down text-primary-fg hover:opacity-90",
        inverse: "bg-transparent text-nav-muted hover:bg-nav-hover hover:text-nav-fg",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-sm",
        icon: "size-10",
        iconSm: "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Disable the press scale when motion would be distracting. */
  static?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, static: isStatic, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        type={asChild ? type : type ?? "button"}
        data-static={isStatic ? "" : undefined}
        className={cn(buttonVariants({ variant, size }), !isStatic && pressMotion, className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
