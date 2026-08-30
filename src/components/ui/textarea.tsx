import * as React from "react"

import { cn } from "@/lib/utils"
import { normalizeText } from "@/lib/text-utils"

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  autoUppercase?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoUppercase = false, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (autoUppercase) {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = normalizeText(e.target.value);
        e.target.setSelectionRange(start, end);
      }
      onChange?.(e);
    };

    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          autoUppercase && "uppercase",
          className
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
