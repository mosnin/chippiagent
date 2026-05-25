import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Button system. One canonical component, used everywhere.
 *
 * Design rules:
 * - 150ms ease for hover transitions; subtle, not loud.
 * - active:scale-[0.98] for tactile press feedback. Excluded on link
 *   variant where scaling text reads as a bug.
 * - 2px focus ring with offset, not the heavy 3px shadcn default.
 * - Ghost + outline variants share the sidebar's hover language
 *   (bg-foreground/[0.04]) so a ghost button next to a nav row reads
 *   as the same surface family.
 * - Outline lost its shadow — it was the only place chrome floated
 *   above the page; everything else in the redesign is paper-flat.
 *
 * Sizes (kept lean):
 *   default — h-9 (matches sidebar nav rows)
 *   sm      — h-8
 *   lg      — h-10
 *   xs      — h-6 (rare; small inline pills)
 *   icon{,-sm,-lg,-xs} — square variants of the same heights
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-150 outline-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30 dark:bg-destructive/60",
        outline:
          "border border-border bg-background hover:bg-foreground/[0.04] hover:text-foreground dark:bg-input/30 dark:hover:bg-foreground/[0.06]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-foreground/[0.04] hover:text-foreground dark:hover:bg-foreground/[0.06]",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
