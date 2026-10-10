// Descobre o CEP a partir de UF + cidade + rua via ViaCEP (gratuito, sem chave).
// Usado quando o Google não devolve o CEP; falhas retornam null e o cliente digita manualmente.

interface ViaCepItem {
  cep: string;
}

/** Primeiro CEP encontrado (ruas longas têm vários CEPs, o primeiro serve de aproximação). */
export async function lookupCepByStreet(state: string, city: string, street: string): Promise<string | null> {
  if (state.length !== 2 || city.trim().length < 3 || street.trim().length < 3) return null;
  const path = [state, city, street].map((part) => encodeURIComponent(part.trim())).join('/');
  try {
    const res = await fetch(`https://viacep.com.br/ws/${path}/json/`);
    if (!res.ok) return null;
    const items = (await res.json()) as ViaCepItem[];
    return Array.isArray(items) && items.length > 0 ? items[0].cep : null;
  } catch (error) {
    console.error('ViaCEP error:', error);
    return null;
  }
}
