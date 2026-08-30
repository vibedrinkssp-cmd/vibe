// Sistema de autocomplete de nomes do totem.
// Combina nomes aprendidos no banco (totem_customer_names) com a base local de
// nomes brasileiros (br-names.ts). Quando o cliente digitou primeiro nome + espaço,
// começamos a sugerir sobrenomes. O nome final é gravado de volta no banco para
// reforçar o aprendizado.

import { supabase } from "@/integrations/supabase/client-safe";
import { BR_FIRST_NAMES, BR_SURNAMES } from "./br-names";

const MAX_RESULTS = 8;

/**
 * Retorna os N primeiros nomes mais usados (apenas primeiro token do display_name),
 * únicos, para atalhos rápidos no checkout.
 */
export async function getTopFirstNames(limit = 10): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("totem_customer_names" as any)
      .select("display_name, use_count")
      .order("use_count", { ascending: false })
      .limit(limit * 4);
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of (data as unknown as Array<{ display_name: string }>)) {
      const first = (row.display_name || "").trim().split(/\s+/)[0]?.toUpperCase();
      if (!first || first.length < 2) continue;
      const key = norm(first);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(first);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const norm = (s: string) => stripAccents(s).toLowerCase().trim();

interface Suggestion {
  display: string;
  weight: number; // higher = better
}

function localFirstNameSuggestions(prefix: string): Suggestion[] {
  if (!prefix) return [];
  const np = norm(prefix);
  const out: Suggestion[] = [];
  for (const n of BR_FIRST_NAMES) {
    if (norm(n).startsWith(np)) {
      // Shorter exact-prefix matches score higher
      out.push({ display: n.toUpperCase(), weight: 100 - n.length });
      if (out.length >= 40) break;
    }
  }
  return out;
}

function localSurnameSuggestions(firstPart: string, surnamePrefix: string): Suggestion[] {
  const np = norm(surnamePrefix);
  const out: Suggestion[] = [];
  for (const s of BR_SURNAMES) {
    if (!np || norm(s).startsWith(np)) {
      out.push({
        display: `${firstPart} ${s}`.toUpperCase(),
        weight: 50 - s.length,
      });
      if (out.length >= 40) break;
    }
  }
  return out;
}

export async function getNameSuggestions(input: string): Promise<string[]> {
  const value = input.trim();
  // 1) Sugestões aprendidas no banco (case-insensitive prefix)
  let learned: Suggestion[] = [];
  try {
    const { data } = await supabase.rpc("search_totem_names" as any, {
      p_prefix: value,
      p_limit: MAX_RESULTS,
    });
    if (Array.isArray(data)) {
      learned = (data as Array<{ display_name: string; use_count: number }>).map((r) => ({
        display: (r.display_name || "").toUpperCase(),
        // Aprendido sempre vem na frente
        weight: 1000 + (r.use_count || 0),
      }));
    }
  } catch {
    // ignore — fallback to local list only
  }

  // 2) Base local
  let local: Suggestion[] = [];
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    local = BR_FIRST_NAMES.slice(0, 20).map((n) => ({
      display: n.toUpperCase(),
      weight: 10,
    }));
  } else if (parts.length === 1) {
    // Digitando primeiro nome
    local = localFirstNameSuggestions(parts[0]);
    // Se o primeiro nome já estiver completo (existe exatamente), oferecemos
    // também alguns sobrenomes populares.
    const exact = BR_FIRST_NAMES.find((n) => norm(n) === norm(parts[0]));
    if (exact) {
      local = local.concat(localSurnameSuggestions(exact, "").slice(0, 8));
    }
  } else {
    // Já tem primeiro nome + algo: tratamos o último token como prefixo de sobrenome
    const firstPart = parts.slice(0, -1).join(" ");
    const surnamePrefix = parts[parts.length - 1];
    local = localSurnameSuggestions(firstPart, surnamePrefix);
  }

  // Merge dedup pelo display normalizado
  const merged = new Map<string, Suggestion>();
  for (const s of [...learned, ...local]) {
    const key = norm(s.display);
    const existing = merged.get(key);
    if (!existing || s.weight > existing.weight) merged.set(key, s);
  }

  return Array.from(merged.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_RESULTS)
    .map((s) => s.display);
}

export async function rememberCustomerName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length < 2) return;
  try {
    await supabase.rpc("increment_totem_name" as any, { p_name: trimmed });
  } catch {
    // best-effort, never block the order flow
  }
}
