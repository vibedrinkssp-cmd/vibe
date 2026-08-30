import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startScreenAlert,
  stopScreenAlert,
  ensureScreenAlertActive,
  ensureNotificationSoundUnlockListeners,
  shouldAlertOrder,
  type ScreenSoundId,
} from '@/lib/notification-sound-engine';

/**
 * Per-screen alert hook.
 *
 * - Cada tela tem sua própria fila de pedidos pendentes.
 * - alertOrder(id): adiciona pedido. Se for novo (dedupe permite), inicia loop.
 * - syncPendingOrders(ids): RECONCILIA com a verdade do servidor — usado em
 *   polling como rede de segurança caso realtime falhe ou a aba estivesse
 *   em background. Se houver pelo menos 1 pendente, garante que o loop esteja
 *   tocando (sem depender de dedupe).
 * - ackOrder(id): remove pedido. Se ficar vazio, para o loop daquela tela.
 * - ackAll(): para tudo manualmente (botão "Parar Alerta").
 *
 * Sem broadcast cross-painel: parar aqui não afeta outras telas.
 */
export function useOrderAlert(screen: ScreenSoundId = 'generic', volume = 0.85) {
  const pendingRef = useRef<Set<string>>(new Set());
  const silencedRef = useRef<Set<string>>(new Set());
  const [isAlertActive, setIsAlertActive] = useState(false);

  useEffect(() => {
    ensureNotificationSoundUnlockListeners();
    return () => {
      stopScreenAlert(screen);
    };
  }, [screen]);

  /** Adiciona pedido — dispara loop se for primeiro detectado nesta janela */
  const alertOrder = useCallback((orderId: string) => {
    if (!orderId) return;
    silencedRef.current.delete(orderId);
    pendingRef.current.add(orderId);
    setIsAlertActive(true);
    if (shouldAlertOrder(orderId, screen)) {
      startScreenAlert(screen, volume);
    } else {
      // Mesmo sem novo dispatch sonoro, garante que o loop esteja ativo
      // se o pedido continua pendente (cobre caso de aba que ficou em
      // background e perdeu o início do loop).
      ensureScreenAlertActive(screen, volume);
    }
  }, [screen, volume]);

  /**
   * Reconcilia o conjunto pendente com o que o backend diz que ainda é
   * acionável nesta tela. Remove pedidos que saíram da fila e garante que o
   * loop esteja tocando se sobrar alguém.
   */
  const syncPendingOrders = useCallback((actionableIds: string[]) => {
    const incoming = new Set(actionableIds.filter(Boolean));
    silencedRef.current.forEach((id) => {
      if (!incoming.has(id)) silencedRef.current.delete(id);
    });
    const next = new Set([...incoming].filter((id) => !silencedRef.current.has(id)));
    // Remover pedidos que não são mais acionáveis
    pendingRef.current.forEach((id) => {
      if (!next.has(id)) pendingRef.current.delete(id);
    });
    // Adicionar pedidos novos
    next.forEach((id) => {
      if (!pendingRef.current.has(id)) {
        pendingRef.current.add(id);
        // Aplica dedupe APENAS para o som de "novo pedido" — independente
        // disso, o loop é mantido ativo abaixo.
        shouldAlertOrder(id, screen);
      }
    });

    if (pendingRef.current.size > 0) {
      ensureScreenAlertActive(screen, volume);
      setIsAlertActive(true);
    } else {
      stopScreenAlert(screen);
      setIsAlertActive(false);
    }
  }, [screen, volume]);

  const ackOrder = useCallback((orderId: string) => {
    if (orderId) pendingRef.current.delete(orderId);
    if (pendingRef.current.size === 0) {
      stopScreenAlert(screen);
      setIsAlertActive(false);
    }
  }, [screen]);

  const ackAll = useCallback(() => {
    pendingRef.current.forEach((id) => silencedRef.current.add(id));
    pendingRef.current.clear();
    stopScreenAlert(screen);
    setIsAlertActive(false);
  }, [screen]);

  const isPending = useCallback((orderId: string) => {
    return pendingRef.current.has(orderId);
  }, []);

  return {
    alertOrder,
    syncPendingOrders,
    ackOrder,
    ackAll,
    isPending,
    isAlertActive,
    pendingCount: pendingRef.current.size,
  };
}
