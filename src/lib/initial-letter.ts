export const NON_LETTER_KEY = '#';

export const ALPHABET = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');

/** Letra inicial do nome sem acento (ex.: "Água" -> "A"); números e símbolos viram "#". */
export function initialLetter(name: string): string {
  const first = name.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : NON_LETTER_KEY;
}

export function availableLetters(names: string[]): Set<string> {
  return new Set(names.map(initialLetter));
}
