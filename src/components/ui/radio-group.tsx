import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@/lib/utils";

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} ref={ref} />
));
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "aspect-square h-5 w-5 shrink-0 rounded-full border-2 border-input/90 bg-gradient-to-b from-background to-muted/30 text-primary shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.05)] ring-offset-background transition-all duration-200 ease-out",
      "hover:border-primary/40 hover:from-muted/45 hover:to-muted/25 hover:shadow-sm",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-45",
      "data-[state=checked]:border-primary data-[state=checked]:from-primary/12 data-[state=checked]:to-primary/8 data-[state=checked]:shadow-[0_2px_8px_-1px_hsl(var(--primary)/0.35)]",
      "dark:border-input dark:from-input/25 dark:to-input/5 dark:data-[state=checked]:from-primary/25 dark:data-[state=checked]:to-primary/15",
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.2),0_2px_4px_hsl(var(--primary)/0.35)]" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
