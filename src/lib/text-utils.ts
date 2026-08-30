import type { ChangeEvent } from 'react';

export function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize text for search comparison — strips accents and lowercases.
 * Use this for all search/filter operations so accented and non-accented
 * input both match (e.g. "acai" matches "Açaí", "agua" matches "Água").
 */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Check if `haystack` contains `needle` with accent-insensitive matching.
 */
export function searchIncludes(haystack: string, needle: string): boolean {
  return normalizeSearch(haystack).includes(normalizeSearch(needle));
}

export function handleUppercaseInput(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.value = normalizeText(e.target.value);
}
