import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client-safe";

export function useOpenCashRegister(onOpened?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (openingCash: number) => {
      const { data, error } = await supabase.rpc("open_cash_register", {
        p_opening_balance: openingCash,
        p_opened_by: "Admin",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast({ title: "Caixa aberto com sucesso!" });
      onOpened?.();
    },
    onError: (e: unknown) =>
      toast({
        title: "Erro ao abrir caixa",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      }),
  });
}
