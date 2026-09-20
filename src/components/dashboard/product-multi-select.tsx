import Select from "react-select";
import type { MultiValue, StylesConfig } from "react-select";
import type { ProductOption } from "@/lib/supabase/vouchers";

type Opt = { value: string; label: string };

const selectStyles: StylesConfig<Opt, true> = {
  control: (base, state) => ({
    ...base,
    minHeight: 36,
    backgroundColor: "hsl(var(--background))",
    borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--input))",
    boxShadow: state.isFocused ? "0 0 0 1px hsl(var(--ring))" : "none",
    "&:hover": { borderColor: "hsl(var(--input))" },
  }),
  menu: (base) => ({
    ...base,
    /* Above Radix dialog overlay (z-50); must receive hits when body has pointer-events:none */
    zIndex: 10000,
    pointerEvents: "auto",
    backgroundColor: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 10000,
    pointerEvents: "auto",
  }),
  menuList: (base) => ({ ...base, maxHeight: 280 }),
  option: (base, state) => ({
    ...base,
    fontSize: "0.875rem",
    backgroundColor: state.isSelected
      ? "hsl(var(--primary))"
      : state.isFocused
        ? "hsl(var(--accent))"
        : "transparent",
    color: state.isSelected ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: "hsl(var(--muted))",
    borderRadius: "0.25rem",
  }),
  multiValueLabel: (base) => ({
    ...base,
    fontSize: "0.75rem",
    color: "hsl(var(--foreground))",
  }),
  multiValueRemove: (base) => ({
    ...base,
    ":hover": { backgroundColor: "hsl(var(--destructive) / 0.2)", color: "hsl(var(--destructive))" },
  }),
  placeholder: (base) => ({ ...base, color: "hsl(var(--muted-foreground))", fontSize: "0.875rem" }),
  input: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
  singleValue: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
};

/**
 * Searchable multi-select for catalog products.
 */
export function ProductMultiSelect({
  products,
  value,
  onChange,
  placeholder = "Search and select products…",
  inputId,
  "aria-label": ariaLabel,
}: {
  products: ProductOption[];
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
  inputId?: string;
  "aria-label"?: string;
}) {
  const options: Opt[] = products.map((p) => ({ value: p.id, label: p.name }));
  const selected = options.filter((o) => value.has(o.value));

  return (
    <Select<Opt, true>
      inputId={inputId}
      aria-label={ariaLabel}
      isMulti
      closeMenuOnSelect={false}
      blurInputOnSelect={false}
      options={options}
      value={selected}
      onChange={(opts) => {
        const next = new Set<string>();
        for (const o of (opts as MultiValue<Opt>) ?? []) next.add(o.value);
        onChange(next);
      }}
      placeholder={placeholder}
      noOptionsMessage={() => "No products match."}
      styles={selectStyles}
      classNamePrefix="voucher-product-select"
      menuPlacement="top"
      menuPosition="fixed"
      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
    />
  );
}
