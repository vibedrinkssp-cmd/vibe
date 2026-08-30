import type { KeyboardEvent, ReactNode } from 'react';
import { Percent } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ComboWizardShellProps {
  children: ReactNode;
  description?: string;
  discountPercent: number;
  footer: ReactNode;
  icon: ReactNode;
  step: number;
  stepLabels: [string, string];
  title: string;
}

export function ComboWizardShell({
  children,
  description,
  discountPercent,
  footer,
  icon,
  step,
  stepLabels,
  title,
}: ComboWizardShellProps) {
  return (
    <DialogContent className="grid h-[min(82vh,38rem)] w-[calc(100vw-1.5rem)] max-w-sm grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl">
      <DialogHeader className="shrink-0 gap-3 border-b border-border px-4 pb-4 pt-4 pr-12 text-left">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-primary shadow-sm">
            {icon}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-2">
              <DialogTitle className="min-w-0 flex-1 text-base leading-tight text-foreground">
                {title}
              </DialogTitle>

              <Badge className="shrink-0 rounded-full border border-border bg-secondary px-2 py-1 text-[10px] font-semibold text-secondary-foreground">
                <Percent className="mr-1 h-3 w-3" />
                {discountPercent}% OFF
              </Badge>
            </div>

            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {stepLabels.map((label, index) => {
            const stepNumber = index + 1;
            const active = step >= stepNumber;

            return (
              <div key={label} className="space-y-1">
                <div className={cn('h-2 rounded-full transition-colors', active ? 'bg-primary' : 'bg-muted')} />
                <p className={cn('text-[11px] leading-none', active ? 'text-foreground' : 'text-muted-foreground')}>
                  {stepNumber}. {label}
                </p>
              </div>
            );
          })}
        </div>
      </DialogHeader>

      <ScrollArea className="h-full min-h-0">
        <div className="space-y-3 px-4 py-4">{children}</div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border bg-background/95 px-4 py-3">{footer}</div>
    </DialogContent>
  );
}

const handleSelectWithKeyboard = (
  event: KeyboardEvent<HTMLDivElement>,
  onSelect: () => void,
) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect();
  }
};

interface ComboWizardOptionCardProps {
  children: ReactNode;
  onSelect: () => void;
  selected: boolean;
}

export function ComboWizardOptionCard({
  children,
  onSelect,
  selected,
}: ComboWizardOptionCardProps) {
  return (
    <Card
      aria-pressed={selected}
      className={cn(
        'cursor-pointer rounded-xl border bg-card p-3 transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background',
        selected ? 'border-primary bg-secondary/50 shadow-sm' : 'border-border hover:bg-secondary/25'
      )}
      onClick={onSelect}
      onKeyDown={(event) => handleSelectWithKeyboard(event, onSelect)}
      role="button"
      tabIndex={0}
    >
      {children}
    </Card>
  );
}

export function ComboWizardEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

interface ComboWizardFilterButtonProps {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}

export function ComboWizardFilterButton({
  active,
  children,
  onClick,
}: ComboWizardFilterButtonProps) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'min-h-12 rounded-xl border px-2 py-2 text-center text-xs font-medium leading-tight transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-background text-foreground hover:bg-secondary'
      )}
      onClick={onClick}
      type="button"
    >
      <span className="block break-words">{children}</span>
    </button>
  );
}

export function ComboWizardSectionTitle({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold leading-tight text-foreground">
      {icon}
      <span className="break-words">{children}</span>
    </h3>
  );
}

interface ComboWizardSummaryProps {
  rows: Array<{
    label: ReactNode;
    value: string;
  }>;
  totalLabel: string;
  totalValue: string;
}

export function ComboWizardSummary({
  rows,
  totalLabel,
  totalValue,
}: ComboWizardSummaryProps) {
  if (!rows.length) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 break-words leading-tight">{row.label}</span>
            <span className="shrink-0 whitespace-nowrap font-medium">{row.value}</span>
          </div>
        ))}

        <div className="flex items-start justify-between gap-3 border-t border-border pt-2 text-sm font-semibold text-foreground">
          <span className="min-w-0 flex-1 leading-tight">{totalLabel}</span>
          <span className="shrink-0 whitespace-nowrap text-primary">{totalValue}</span>
        </div>
      </div>
    </div>
  );
}