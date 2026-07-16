"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";

import { cn } from "../../lib/cn";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(
  (
    {
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      className,
      ...props
    },
    ref,
  ) => {
    const values = props.value ?? props.defaultValue ?? [props.min ?? 0];

    return (
      <SliderPrimitive.Root
        className={cn(
          "relative flex w-full touch-none select-none items-center py-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-[var(--surface-raised)]">
          <SliderPrimitive.Range className="absolute h-full bg-[var(--primary)]" />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            className="block size-5 rounded-full border-2 border-[var(--primary)] bg-[var(--text)] shadow outline-none transition-transform hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100 focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            key={index}
          />
        ))}
      </SliderPrimitive.Root>
    );
  },
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
