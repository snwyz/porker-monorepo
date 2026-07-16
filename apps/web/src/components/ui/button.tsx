"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent px-4 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm hover:bg-[var(--primary-hover)]",
        secondary:
          "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-raised)]",
        ghost: "text-[var(--text)] hover:bg-[var(--surface-raised)]",
        destructive:
          "bg-[var(--destructive)] text-[var(--destructive-foreground)] shadow-sm hover:bg-[var(--destructive-hover)]",
      },
      size: {
        default: "min-h-10 px-4 py-2",
        sm: "min-h-9 px-3 py-1.5 text-xs",
        lg: "min-h-11 px-5 py-2.5",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  icon?: React.ReactNode;
  loading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      disabled,
      icon,
      loading = false,
      loadingText,
      size,
      type = "button",
      variant,
      ...props
    },
    ref,
  ) => {
    const label = loading && loadingText ? loadingText : children;

    return (
      <button
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        ref={ref}
        type={type}
        {...props}
      >
        {icon}
        {loading ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : null}
        {label != null ? <span>{label}</span> : null}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
