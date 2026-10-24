import { useEffect, useState } from 'react';

/** Horário fixo da loja: abre às 14h e fecha às 05h do dia seguinte (horário de Brasília). */
export const STORE_OPEN_HOUR = 14;
export const STORE_CLOSE_HOUR = 5;
/** Dias em que a loja não abre (0 = domingo ... 2 = terça). O turno pertence ao dia em que começa. */
export const STORE_CLOSED_WEEKDAYS: readonly number[] = [2];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function saoPauloClock(now: Date): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekday = WEEKDAYS.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '');
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  return { weekday, hour };
}

export function isStoreOpenAt(now: Date): boolean {
  const { weekday, hour } = saoPauloClock(now);
  // Madrugada (00h–05h) ainda é o turno que começou na véspera.
  const afterMidnight = hour < STORE_CLOSE_HOUR;
  const afternoon = hour >= STORE_OPEN_HOUR;
  if (!afterMidnight && !afternoon) return false;
  const shiftWeekday = afterMidnight ? (weekday + 6) % 7 : weekday;
  return !STORE_CLOSED_WEEKDAYS.includes(shiftWeekday);
}

/** Loja aberta agora pelo horário fixo; reavalia a cada minuto. */
export function useStoreOpenNow(): boolean {
  const [open, setOpen] = useState(() => isStoreOpenAt(new Date()));
  useEffect(() => {
    const id = setInterval(() => setOpen(isStoreOpenAt(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);
  return open;
}
