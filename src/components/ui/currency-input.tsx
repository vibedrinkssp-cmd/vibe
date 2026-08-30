import * as React from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number | string;
  onChange: (numericValue: number) => void;
  placeholder?: string;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  id?: string;
  name?: string;
  "data-testid"?: string;
  /** Show R$ prefix (default: true) */
  showPrefix?: boolean;
  /** Size variant */
  size?: "default" | "sm";
}

/**
 * Currency input formatted for Brazilian Real (R$).
 * Displays values with comma as decimal separator.
 * Internally works with numeric values (dot separator).
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      placeholder = "0,00",
      className,
      min = 0,
      max,
      step = 0.01,
      disabled,
      id,
      name,
      showPrefix = true,
      size = "default",
      ...props
    },
    ref
  ) => {
    // Convert numeric value to display string with comma
    const toDisplayValue = (val: number | string): string => {
      const num = typeof val === "string" ? parseFloat(val) : val;
      if (isNaN(num) || num === 0) return "";
      // Format with 2 decimal places using comma
      return num.toFixed(2).replace(".", ",");
    };

    const [displayValue, setDisplayValue] = React.useState(() =>
      toDisplayValue(value)
    );
    const [isFocused, setIsFocused] = React.useState(false);

    // Sync display when value changes externally (and not focused)
    React.useEffect(() => {
      if (!isFocused) {
        setDisplayValue(toDisplayValue(value));
      }
    }, [value, isFocused]);

    const parseInputValue = (input: string): number => {
      // Remove R$ and spaces
      let cleaned = input.replace(/R\$\s?/g, "").trim();
      // Replace comma with dot for parsing
      cleaned = cleaned.replace(",", ".");
      // Remove any non-numeric chars except dot and minus
      cleaned = cleaned.replace(/[^\d.\-]/g, "");
      const num = parseFloat(cleaned);
      if (isNaN(num)) return 0;
      // Clamp
      let result = Math.max(min, num);
      if (max !== undefined) result = Math.min(max, result);
      return result;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow typing freely: digits, comma, dot
      // Only allow valid currency-like patterns
      const sanitized = raw.replace(/[^\d,.\-]/g, "");
      setDisplayValue(sanitized);
      // Fire onChange immediately so parent state updates while typing
      const numericValue = parseInputValue(sanitized);
      onChange(numericValue);
    };

    const handleBlur = () => {
      setIsFocused(false);
      const numericValue = parseInputValue(displayValue);
      // Round to step precision
      const precision = step < 1 ? String(step).split(".")[1]?.length || 2 : 0;
      const rounded = parseFloat(numericValue.toFixed(precision));
      onChange(rounded);
      setDisplayValue(toDisplayValue(rounded));
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Select all on focus for easy replacement
      setTimeout(() => e.target.select(), 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // On mobile/touch devices, don't block any keys — the virtual keyboard
      // sends non-standard key events (e.g. "Unidentified", "Process") that
      // must not be prevented, otherwise typing breaks entirely on iOS.
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

      // Desktop: Allow navigation and editing keys
      if (
        ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
      ) {
        return;
      }
      // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
      if (e.ctrlKey || e.metaKey) return;
      // Allow: digits, comma, dot, minus
      if (/[\d,.\-]/.test(e.key)) return;
      // Block everything else on desktop
      e.preventDefault();
    };

    const sizeClasses =
      size === "sm"
        ? "h-7 text-xs px-2"
        : "h-9 text-base md:text-sm px-3";

    return (
      <div className="relative">
        {showPrefix && (
          <span
            className={cn(
              "absolute top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none",
              size === "sm" ? "left-1.5 text-xs" : "left-3 text-sm"
            )}
          >
            R$
          </span>
        )}
        <input
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex w-full rounded-md border border-input bg-background py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            sizeClasses,
            showPrefix && (size === "sm" ? "pl-7" : "pl-10"),
            className
          )}
          data-testid={props["data-testid"]}
        />
      </div>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
export type { CurrencyInputProps };
