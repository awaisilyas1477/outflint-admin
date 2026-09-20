import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[9px] border-2 border-input/90 bg-gradient-to-b from-background to-muted/30 text-primary-foreground shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.06)] ring-offset-background transition-all duration-200 ease-out",
      "hover:border-primary/40 hover:from-muted/50 hover:to-muted/30 hover:shadow-sm",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-input",
      "data-[state=checked]:border-primary data-[state=checked]:bg-gradient-to-br data-[state=checked]:from-primary data-[state=checked]:to-primary data-[state=checked]:text-primary-foreground",
      "data-[state=checked]:shadow-[0_3px_10px_-2px_hsl(var(--primary)/0.45),inset_0_1px_0_0_hsl(var(--primary-foreground)/0.15)]",
      "data-[state=checked]:hover:brightness-[1.04]",
      "dark:border-input dark:from-input/25 dark:to-input/5 dark:data-[state=checked]:shadow-[0_4px_14px_-3px_hsl(var(--primary)/0.55),inset_0_1px_0_0_hsl(var(--primary-foreground)/0.12)]",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check
        className="h-[0.9rem] w-[0.9rem] drop-shadow-sm"
        strokeWidth={3}
        aria-hidden
      />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
