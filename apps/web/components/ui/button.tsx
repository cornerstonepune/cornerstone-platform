import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-transparent bg-clip-padding text-[length:var(--text-label)] leading-[var(--lh-label)] font-[var(--weight-label)] whitespace-nowrap outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-[var(--state-late)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[var(--action)] text-[var(--action-ink)] hover:bg-[color-mix(in_srgb,var(--action)_85%,var(--ground))]",
        outline:
          "border-[var(--line-control)] bg-[var(--panel)] text-[var(--ink)] hover:bg-[var(--highlight)] aria-expanded:bg-[var(--highlight)]",
        secondary:
          "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--highlight)] aria-expanded:bg-[var(--surface)]",
        ghost:
          "text-[var(--ink)] hover:bg-[var(--highlight)] aria-expanded:bg-[var(--highlight)]",
        destructive:
          "bg-[var(--state-late-bg)] text-[var(--state-late)] border-[var(--state-late)] hover:bg-[color-mix(in_srgb,var(--state-late-bg)_80%,var(--state-late))]",
        link: "text-[var(--link)] underline underline-offset-4",
      },
      size: {
        default: "min-h-[var(--tap)] gap-[var(--space-2)] px-[var(--space-3)]",
        xs: "min-h-[var(--tap)] gap-[var(--space-1)] px-[var(--space-2)]",
        sm: "min-h-[var(--tap)] gap-[var(--space-1)] px-[var(--space-2)]",
        lg: "min-h-[var(--tap)] gap-[var(--space-2)] px-[var(--space-4)]",
        icon: "size-[var(--tap)]",
        "icon-xs":
          "size-[var(--tap)]",
        "icon-sm":
          "size-[var(--tap)]",
        "icon-lg": "size-[var(--tap)]",
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
