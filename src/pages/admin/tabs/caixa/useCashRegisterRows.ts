import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client-safe";

export interface CashRegisterSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  current_balance: number;
  cash_supplies: number;
  status: string;
  opened_by: string | null;
  closed_by: string | null;
}

export interface CashRegisterRowMetrics {
  cash: number;
  pix: number;
  card_credit: number;
  card_debit: number;
  sangrias: number;
  cash_supplies: number;
  expected_cash: number;
  actual_cash: number | null;
  difference: number | null;
  orders_count: number;
  counter_orders: number;
  delivery_orders: number;
  delivery_fees: number;
  gross_profit: number;
  total_saques: number;
  total_depositos: number; // legacy/compat - always 0
  saque_fees: number;
  cash_pending: number;
}

export interface CashRegisterRow {
  session: CashRegisterSession;
  metrics: CashRegisterRowMetrics;
}

export interface SessionSummary {
  session_id: string;
  opened_at: string;
  opened_by: string | null;
  opening_balance: number;
  cash_supplies: number;
  cash_sales: number;
  total_sales: number;
  pix_sales: number;
  card_credit_sales: number;
  card_debit_sales: number;
  total_sangrias: number;
  saques: number;
  depositos: number;
  fees: number;
  total_orders: number;
  counter_orders: number;
  delivery_orders: number;
  delivery_fees: number;
  product_cost: number;
  expected_cash: number;
  gross_profit: number;
  cash_pending: number;
  session_status: string;
}

export function useCashRegisterRows() {
  const queryClient = useQueryClient();
  const [realtimeTrigger, setRealtimeTrigger] = useState(0);

  // Buscar sessão aberta atual com resumo via RPC
  const sessionSummaryQuery = useQuery({
    queryKey: ["session_summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_session_summary");
      if (error) {
        console.error("Error fetching session summary:", error);
        return null;
      }
      // RPC retorna array, pegamos o primeiro
      const summary = Array.isArray(data) ? data[0] : data;
      return summary as SessionSummary | null;
    },
    staleTime: 10000, // Dados válidos por 10s
    refetchInterval: 30000, // Refetch a cada 30s (apenas para manter atualizado se não houver realtime)
  });

  // Buscar histórico de sessões via RPC (bypass RLS)
  const sessionsQuery = useQuery({
    queryKey: ["cash_register_sessions", "history"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cash_register_sessions");

      if (error) {
        console.error("Error fetching sessions:", error);
        return [] as CashRegisterSession[];
      }
      
      return (data || []) as CashRegisterSession[];
    },
    staleTime: 10000,
    refetchInterval: 30000,
  });

  // Buscar fechamentos históricos para métricas completas
  const closuresQuery = useQuery({
    queryKey: ["cash_register_closures"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_all_cash_closures");
      if (error) {
        console.error("Error fetching closures:", error);
        return [];
      }
      return data || [];
    },
    staleTime: 30000,
    refetchInterval: 60000, // Closures mudam raramente
  });

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel("cash-register-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cash_register_sessions",
        },
        () => {
          setRealtimeTrigger((t) => t + 1);
          queryClient.invalidateQueries({ queryKey: ["cash_register_sessions"] });
          queryClient.invalidateQueries({ queryKey: ["session_summary"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public", 
          table: "orders",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["session_summary"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sangrias",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["session_summary"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cash_transactions",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["cash_register_sessions"] });
          queryClient.invalidateQueries({ queryKey: ["session_summary"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Mapear closures por session_id ou period_start para acesso rápido
  const closuresBySessionId = useMemo(() => {
    const map: Record<string, any> = {};
    for (const c of closuresQuery.data || []) {
      if (c.session_id) {
        map[c.session_id] = c;
      }
    }
    return map;
  }, [closuresQuery.data]);

  // Fallback: mapear por period_start (para closures sem session_id)
  const closuresByPeriodStart = useMemo(() => {
    const map: Record<string, any> = {};
    for (const c of closuresQuery.data || []) {
      if (c.period_start) {
        map[c.period_start] = c;
      }
    }
    return map;
  }, [closuresQuery.data]);

  const rows = useMemo<CashRegisterRow[]>(() => {
    const sessions = sessionsQuery.data || [];
    const summary = sessionSummaryQuery.data;

    return sessions.map((session) => {
      const isOpen = session.status === "open";

      // Se é a sessão aberta, usar dados do resumo
      if (isOpen && summary && summary.session_id === session.id) {
        return {
          session,
          metrics: {
            cash: Number(summary.cash_sales) || 0,
            pix: Number(summary.pix_sales) || 0,
            card_credit: Number(summary.card_credit_sales) || 0,
            card_debit: Number(summary.card_debit_sales) || 0,
            sangrias: Number(summary.total_sangrias) || 0,
            cash_supplies: Number(summary.cash_supplies) || 0,
            expected_cash: Number(summary.expected_cash) || 0,
            actual_cash: null,
            difference: null,
            orders_count: Number(summary.total_orders) || 0,
            counter_orders: Number(summary.counter_orders) || 0,
            delivery_orders: Number(summary.delivery_orders) || 0,
            delivery_fees: Number(summary.delivery_fees) || 0,
            gross_profit: Number(summary.gross_profit) || 0,
            total_saques: Number((summary as any).saques) || 0,
            total_depositos: Number((summary as any).depositos) || 0,
            saque_fees: Number((summary as any).fees) || 0,
            cash_pending: Number((summary as any).cash_pending) || 0,
          },
        };
      }

      // Para sessões fechadas, usar dados do closure (por session_id ou period_start)
      const closure = closuresBySessionId[session.id] || closuresByPeriodStart[session.opened_at];
      
      if (closure) {
        const expected = Number(closure.expected_cash) || 0;
        const actual = Number(closure.actual_cash) || 0;
        
        return {
          session,
          metrics: {
            cash: Number(closure.total_cash) || 0,
            pix: Number(closure.total_pix) || 0,
            card_credit: Number(closure.total_card_credit) || 0,
            card_debit: Number(closure.total_card_debit) || 0,
            sangrias: Number(closure.total_sangrias) || 0,
            cash_supplies: Number(closure.cash_supplies) || 0,
            expected_cash: expected,
            actual_cash: actual,
            difference: Number(closure.cash_difference) || 0,
            orders_count: Number(closure.total_orders) || 0,
            counter_orders: Number(closure.counter_orders_count) || 0,
            delivery_orders: Number(closure.delivery_orders_count) || 0,
            delivery_fees: Number(closure.total_delivery_fees) || 0,
            gross_profit: Number(closure.gross_profit) || 0,
            total_saques: 0,
            total_depositos: 0,
            saque_fees: 0,
            cash_pending: 0,
          },
        };
      }

      // Fallback para sessão fechada sem closure (legacy)
      return {
        session,
        metrics: {
          cash: 0,
          pix: 0,
          card_credit: 0,
          card_debit: 0,
          sangrias: 0,
          cash_supplies: Number(session.cash_supplies) || 0,
          expected_cash: Number(session.opening_balance) || 0,
          actual_cash: Number(session.current_balance) || 0,
          difference: (Number(session.current_balance) || 0) - (Number(session.opening_balance) || 0),
          orders_count: 0,
          counter_orders: 0,
          delivery_orders: 0,
          delivery_fees: 0,
          gross_profit: 0,
          total_saques: 0,
          total_depositos: 0,
          saque_fees: 0,
          cash_pending: 0,
        },
      };
    });
  }, [sessionsQuery.data, sessionSummaryQuery.data, closuresBySessionId, closuresByPeriodStart]);

  const openSession = useMemo(() => rows.find((r) => r.session.status === "open") || null, [rows]);

  return {
    rows,
    openSession,
    sessionSummary: sessionSummaryQuery.data,
    isLoading: sessionsQuery.isLoading || sessionSummaryQuery.isLoading,
    error: sessionsQuery.error,
    refetch: async () => {
      setRealtimeTrigger((t) => t + 1);
      await Promise.all([
        sessionsQuery.refetch(),
        sessionSummaryQuery.refetch(),
        closuresQuery.refetch(),
      ]);
    },
  };
}
