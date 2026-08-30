import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getNameSuggestions, getTopFirstNames, rememberCustomerName } from '@/lib/totem-name-autocomplete';
import { cn } from '@/lib/utils';

interface CustomerNameInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  required?: boolean;
}

const SIMPLE_QUICK_NAMES = [
  'JOÃO',
  'MARIA',
  'PEDRO',
  'ANA',
  'JOSÉ',
  'CARLOS',
  'LUCAS',
  'PAULO',
  'GABRIEL',
  'RAFAEL',
];

export function CustomerNameInput({
  value,
  onChange,
  placeholder = 'Ex: JOÃO',
  id,
  className,
  required,
}: CustomerNameInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string>('');
  const [topNames, setTopNames] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const quickNames = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const name of [...topNames, ...SIMPLE_QUICK_NAMES]) {
      const normalized = name.trim().toUpperCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      merged.push(normalized);
      if (merged.length >= 10) break;
    }
    return merged;
  }, [topNames]);

  useEffect(() => {
    let cancelled = false;
    getTopFirstNames(10).then((n) => { if (!cancelled) setTopNames(n); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1 || q.toUpperCase() === picked.toUpperCase()) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const s = await getNameSuggestions(q);
        if (!cancelled) {
          setSuggestions(s.filter((n) => n.toUpperCase() !== q.toUpperCase()));
          setOpen(true);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, picked]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (name: string) => {
    setPicked(name);
    onChange(name);
    setOpen(false);
    setSuggestions([]);
    rememberCustomerName(name).catch(() => {});
  };

  const handleBlur = () => {
    const t = value.trim();
    if (t.length >= 2) rememberCustomerName(t.toUpperCase()).catch(() => {});
  };

  return (
    <div ref={wrapRef} className="relative">
      {quickNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {quickNames.map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              variant={value.trim().toUpperCase() === n ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs font-bold uppercase"
              onClick={() => pick(n)}
              aria-label={`Usar nome ${n}`}
            >
              {n}
            </Button>
          ))}
        </div>
      )}
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn('uppercase', className)}
        autoCapitalize="characters"
        autoComplete="off"
        required={required}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-primary/20 bg-popover shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className="w-full text-left px-3 py-2 text-sm font-semibold uppercase hover:bg-secondary/70 border-b border-primary/10 last:border-0"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
