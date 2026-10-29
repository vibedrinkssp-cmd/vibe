import { Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useStoreOpenNow, STORE_OPEN_HOUR, STORE_CLOSE_HOUR } from '@/lib/store-hours';

/**
 * Status da loja pelo horário fixo (o mesmo que o site usa), sem chave manual:
 * o que o operador liga/desliga é a ENTREGA (DeliveryToggle); a retirada segue o horário.
 */
export function StoreStatusToggle() {
  const open = useStoreOpenNow();

  return (
    <Badge
      className={open
        ? "bg-green-500/20 text-green-200 border-green-500/30"
        : "bg-red-500/20 text-red-200 border-red-500/30"
      }
      title={`Horário: ${STORE_OPEN_HOUR}h às ${STORE_CLOSE_HOUR}h (fechada às terças)`}
    >
      <Store className="h-3 w-3 mr-1" />
      <span>{open ? 'Loja aberta' : 'Loja fechada'}</span>
    </Badge>
  );
}
