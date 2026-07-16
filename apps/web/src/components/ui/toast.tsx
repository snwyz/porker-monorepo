"use client";

import { X } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/cn";

const ToastProvider = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);

interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: "default" | "destructive";
}

const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  (
    { className, onOpenChange, open = true, variant = "default", ...props },
    ref,
  ) => {
    if (!open) return null;

    return (
      <div
        className={cn(
          "pointer-events-auto flex w-full items-center gap-3 rounded-xl border bg-[var(--surface)] p-4 text-sm text-[var(--text)] shadow-xl",
          variant === "destructive"
            ? "border-[var(--destructive)]"
            : "border-[var(--border)]",
          className,
        )}
        ref={ref}
        role={variant === "destructive" ? "alert" : "status"}
        {...props}
      >
        {props.children}
        {onOpenChange ? (
          <button
            aria-label="Dismiss notification"
            className="ml-auto rounded-md p-1 text-[var(--muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
    );
  },
);
Toast.displayName = "Toast";

function ToastTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-semibold", className)} {...props} />;
}

function ToastDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-[var(--muted)]", className)} {...props} />;
}

const ToastAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, type = "button", ...props }, ref) => (
  <button
    className={cn(
      "rounded-md border border-[var(--border)] px-3 py-1.5 font-medium outline-none hover:bg-[var(--surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
      className,
    )}
    ref={ref}
    type={type}
    {...props}
  />
));
ToastAction.displayName = "ToastAction";

function ToastViewport({
  className,
  ...props
}: React.HTMLAttributes<HTMLOListElement>) {
  return (
    <ol
      aria-label="Notifications"
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-4 z-[100] grid max-h-screen gap-2 sm:left-auto sm:w-full sm:max-w-sm",
        className,
      )}
      {...props}
    />
  );
}

export {
  Toast,
  ToastAction,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastProps,
};
