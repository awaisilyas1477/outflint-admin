import { useState } from "react";
import CreatableSelect from "react-select/creatable";
import type { MultiValue, StylesConfig } from "react-select";
import type { TagRow } from "@/lib/supabase/catalog-types";
import { saveTag } from "@/lib/supabase/catalog";
import { slugFromLabel } from "@/lib/slug";
import { toast } from "sonner";

type Opt = { value: string; label: string; __isNew__?: boolean };

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
    zIndex: 50,
    backgroundColor: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
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

export function TagMultiSelect({
  tags,
  value,
  onChange,
  onTagCreated,
  placeholder = "Search or type new tag…",
  inputId,
  "aria-label": ariaLabel,
  disabled,
}: {
  tags: TagRow[];
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  onTagCreated?: (newTag: TagRow) => void;
  placeholder?: string;
  inputId?: string;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  const [creating, setCreating] = useState(false);

  const options: Opt[] = tags.map((t) => ({
    value: t.id,
    label: `${t.label} (${t.name})`,
  }));
  const selected = options.filter((o) => value.has(o.value));

  async function handleCreate(inputValue: string) {
    const rawLabel = inputValue.trim();
    if (!rawLabel) return;
    const slug = slugFromLabel(rawLabel);
    if (!slug) {
      toast.error("Tag name must contain letters or numbers.");
      return;
    }

    // Check if tag with this slug already exists in current list
    const existing = tags.find((t) => t.name.toLowerCase() === slug.toLowerCase());
    if (existing) {
      const next = new Set(value);
      next.add(existing.id);
      onChange(next);
      toast.info(`Selected existing tag: ${existing.label}`);
      return;
    }

    setCreating(true);
    try {
      const result = await saveTag(null, { name: slug, label: rawLabel });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const newTag: TagRow = {
        id: result.id,
        name: slug,
        label: rawLabel,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (onTagCreated) {
        onTagCreated(newTag);
      }
      const next = new Set(value);
      next.add(result.id);
      onChange(next);
      toast.success(`Tag "${rawLabel}" created and assigned.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create tag.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <CreatableSelect<Opt, true>
      inputId={inputId}
      aria-label={ariaLabel}
      isMulti
      isLoading={creating}
      closeMenuOnSelect={false}
      blurInputOnSelect={false}
      isDisabled={disabled || creating}
      options={options}
      value={selected}
      onCreateOption={(inputValue) => {
        void handleCreate(inputValue);
      }}
      onChange={(opts) => {
        const next = new Set<string>();
        for (const o of (opts as MultiValue<Opt>) ?? []) {
          if (o.value) next.add(o.value);
        }
        onChange(next);
      }}
      placeholder={placeholder}
      formatCreateLabel={(input) => `Create new tag "${input}"`}
      noOptionsMessage={() => "Type a tag name to create or search…"}
      styles={selectStyles}
      classNamePrefix="tag-multi-select"
    />
  );
}
