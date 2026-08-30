/**
 * Helpers para tratar o erro padrão de "caixa fechado" disparado
 * pelos triggers do banco (mensagem prefixada com "CAIXA_FECHADO:").
 */

export const CASH_CLOSED_PREFIX = "CAIXA_FECHADO";

export function isCashClosedError(err: unknown): boolean {
  const msg =
    (err as any)?.message ??
    (err as any)?.error_description ??
    String(err ?? "");
  return typeof msg === "string" && msg.includes(CASH_CLOSED_PREFIX);
}

export function getCashClosedMessage(err: unknown, fallback?: string): string {
  const raw =
    (err as any)?.message ??
    (err as any)?.error_description ??
    String(err ?? "");
  if (typeof raw === "string" && raw.includes(CASH_CLOSED_PREFIX)) {
    // Remove o prefixo técnico para mostrar ao usuário
    return raw.replace(/^.*CAIXA_FECHADO:\s*/i, "").trim() ||
      "O caixa está fechado. Realize a abertura do caixa para movimentar dinheiro físico.";
  }
  return fallback || raw || "Ocorreu um erro inesperado.";
}

/**
 * Padrão para usar em onError do react-query / catch:
 *   toast({ ...cashClosedToast(err, "Erro ao processar") })
 */
export function cashClosedToast(err: unknown, fallbackTitle = "Erro") {
  if (isCashClosedError(err)) {
    return {
      title: "Caixa fechado",
      description: getCashClosedMessage(err),
      variant: "destructive" as const,
    };
  }
  return {
    title: fallbackTitle,
    description: getCashClosedMessage(err, fallbackTitle),
    variant: "destructive" as const,
  };
}
