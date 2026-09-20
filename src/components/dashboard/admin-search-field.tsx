import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AdminSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
  inputClassName?: string;
};

export function AdminSearchField({
  value,
  onChange,
  placeholder = "Search…",
  "aria-label": ariaLabel = "Search",
  className,
  inputClassName,
}: AdminSearchFieldProps) {
  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-10 pl-9", inputClassName)}
        aria-label={ariaLabel}
      />
    </div>
  );
}
