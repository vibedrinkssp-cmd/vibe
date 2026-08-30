import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Safe date formatting that handles undefined values
 */
export function formatDateSafe(date: string | Date | null | undefined, formatStr: string = 'dd/MM/yyyy HH:mm'): string {
  if (!date) return '-';
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return format(dateObj, formatStr, { locale: ptBR });
  } catch {
    return '-';
  }
}

/**
 * Normalize a Postgres `numeric` column value to a JS number.
 *
 * Why: supabase-js serializes Postgres `numeric` columns as **strings** to
 * preserve precision. Doing `value * qty` or `value.toFixed(2)` directly on
 * those strings silently produces `NaN` / runtime errors. Always pipe
 * unit_price / total_price / subtotal / amount through this helper before any
 * arithmetic or display formatting.
 *
 * Accepts number | string | null | undefined and always returns a finite
 * number (defaults to 0 for nullish / non-finite inputs).
 */
export function parseNumeric(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Alias for readability when the field is specifically a unit price. */
export const parseUnitPrice = parseNumeric;

/**
 * Format currency in BRL
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date | null | undefined): string {
  return formatDateSafe(date, 'dd/MM/yyyy HH:mm');
}

/**
 * Format short date
 */
export function formatShortDate(date: string | Date | null | undefined): string {
  return formatDateSafe(date, 'dd/MM/yyyy');
}

/**
 * Ensure string or null (convert undefined to null)
 */
export function toStringOrNull(value: string | null | undefined): string | null {
  return value ?? null;
}
