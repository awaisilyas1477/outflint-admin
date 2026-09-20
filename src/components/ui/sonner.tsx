import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/contexts/theme-context";

/** Global toast host — use `import { toast } from "sonner"` from any page. */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="top-right"
      richColors
      closeButton
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group-[.toaster]:border-border group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:shadow-lg",
          title: "group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground",
        },
      }}
    />
  );
}
