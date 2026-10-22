import { cn } from '@/lib/utils';
import { ALPHABET, NON_LETTER_KEY } from '@/lib/initial-letter';

interface LetterFilterProps {
  value: string | null;
  onChange: (letter: string | null) => void;
  /** Letras que têm produtos; as demais ficam desabilitadas. Sem isso, todas ficam ativas. */
  available?: Set<string>;
  className?: string;
}

const LETTERS = [...ALPHABET, NON_LETTER_KEY];

export function LetterFilter({ value, onChange, available, className }: LetterFilterProps) {
  const chip = 'shrink-0 h-7 min-w-7 px-2 rounded-md text-xs font-semibold transition-colors';

  return (
    <div
      className={cn('flex items-center gap-1 overflow-x-auto scrollbar-none', className)}
      role="group"
      aria-label="Filtrar por letra inicial"
      data-testid="letter-filter"
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(chip, value === null ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-foreground')}
        data-testid="letter-filter-all"
      >
        Todas
      </button>
      {LETTERS.map((letter) => {
        const disabled = available ? !available.has(letter) : false;
        const active = value === letter;
        return (
          <button
            key={letter}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? null : letter)}
            className={cn(
              chip,
              active ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-foreground',
              disabled && 'opacity-30 cursor-not-allowed'
            )}
            data-testid={`letter-filter-${letter}`}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}
