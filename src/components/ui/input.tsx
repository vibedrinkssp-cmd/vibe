import * as React from "react"

import { cn } from "@/lib/utils"
import { normalizeText } from "@/lib/text-utils"

export interface InputProps extends React.ComponentProps<"input"> {
  autoUppercase?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, autoUppercase = false, onChange, onFocus, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (autoUppercase && type !== 'password' && type !== 'email' && type !== 'number' && type !== 'tel' && type !== 'date' && type !== 'time' && type !== 'datetime-local') {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = normalizeText(e.target.value);
        e.target.setSelectionRange(start, end);
      }
      onChange?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      // Auto-select all text on focus for easy replacement
      if (type === 'number' || type === 'tel') {
        setTimeout(() => e.target.select(), 0);
      }
      onFocus?.(e);
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          autoUppercase && "uppercase",
          className
        )}
        ref={ref}
        onChange={handleChange}
        onFocus={handleFocus}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
