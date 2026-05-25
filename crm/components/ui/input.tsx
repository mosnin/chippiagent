import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input system. Mirrors the Button polish:
 * - No shadow (paper-flat). The original had shadow-xs floating the input
 *   above the page; everything else in the redesign sits on the page, not
 *   above it.
 * - 2px focus ring + 1px offset, not the heavy 3px shadcn default.
 * - Quieter placeholder (muted-foreground/70) so empty fields don't shout.
 * - 150ms color transition; snappy without being abrupt.
 * - text-base on mobile prevents iOS zoom on focus; text-sm on md+.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base transition-colors duration-150 outline-none md:text-sm",
        "placeholder:text-muted-foreground/70 selection:bg-primary selection:text-primary-foreground",
        "file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
