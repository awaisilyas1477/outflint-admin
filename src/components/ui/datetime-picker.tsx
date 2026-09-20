import * as React from "react";
import DatePicker from "react-datepicker";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/** Same string shape as native `datetime-local`: `YYYY-MM-DDTHH:mm` (local). */
export function formatLocalDatetimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseLocalDatetimeString(s: string): Date | null {
  if (!s?.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type DatetimePickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Classes for the outer DatePicker wrapper */
  className?: string;
  /** Classes merged into the trigger input (height, text size) */
  inputClassName?: string;
  placeholder?: string;
  "aria-label"?: string;
};

const CustomInput = React.forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("cursor-pointer font-normal", className)} {...props} />
  ),
);
CustomInput.displayName = "DatetimePickerInput";

export function DatetimePicker({
  id,
  value,
  onChange,
  disabled,
  className,
  inputClassName,
  placeholder = "Select date & time",
  "aria-label": ariaLabel,
}: DatetimePickerProps) {
  const selected = parseLocalDatetimeString(value);

  return (
    <DatePicker
      id={id}
      selected={selected}
      onChange={(d: Date | null) => {
        if (!d) {
          onChange("");
          return;
        }
        onChange(formatLocalDatetimeString(d));
      }}
      showTimeSelect
      timeIntervals={15}
      dateFormat="MMM d, yyyy h:mm aa"
      placeholderText={placeholder}
      disabled={disabled}
      popperClassName="admin-datepicker-popper"
      calendarClassName="admin-datepicker-calendar"
      showPopperArrow={false}
      className={cn("w-full", className)}
      customInput={<CustomInput className={inputClassName} aria-label={ariaLabel} />}
    />
  );
}
