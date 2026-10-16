import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client-safe";
import { OpenCashDialog } from "@/pages/admin/tabs/caixa/OpenCashDialog";
import { useOpenCashRegister } from "@/pages/admin/tabs/caixa/useOpenCashRegister";

/** true/false quando já sabemos se há caixa aberto; undefined enquanto carrega. */
export function useIsCashOpen() {
  const { data } = useQuery({
    queryKey: ["header-session-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_session_summary");
      if (error) throw error;
      const summary = Array.isArray(data) ? data[0] : data;
      return summary?.session_status === "open";
    },
    refetchInterval: 30000,
    retry: 0,
  });
  return data;
}

/** Botão "Abrir Caixa" com o diálogo embutido. Só aparece quando o caixa está fechado. */
export function OpenCashButton({ pulse = false, ...buttonProps }: ButtonProps & { pulse?: boolean }) {
  const [open, setOpen] = useState(false);
  const isCashOpen = useIsCashOpen();
  const openMutation = useOpenCashRegister(() => setOpen(false));

  if (isCashOpen !== false) return null;

  return (
    <>
      <Button
        size="sm"
        {...buttonProps}
        className={`gap-1.5 font-bold ${pulse ? "animate-pulse" : ""} ${buttonProps.className ?? ""}`}
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        Abrir Caixa
      </Button>
      <OpenCashDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={(openingCash) => openMutation.mutate(openingCash)}
        isPending={openMutation.isPending}
      />
    </>
  );
}
