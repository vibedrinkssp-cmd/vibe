import { Store, Ban } from 'lucide-react';

interface PickupOnlyNoticeProps {
  /** "banner" = faixa grande (home/checkout); "compact" = caixa menor (carrinho). */
  variant?: 'banner' | 'compact';
}

/** Aviso grande exibido quando as entregas estão desligadas: só retirada na loja. */
export function PickupOnlyNotice({ variant = 'banner' }: PickupOnlyNoticeProps) {
  if (variant === 'compact') {
    return (
      <div
        className="rounded-xl border-2 border-red-500 bg-red-600 p-4 text-center text-white"
        data-testid="cart-sem-entrega"
      >
        <p className="flex items-center justify-center gap-2 text-lg font-extrabold uppercase leading-tight">
          <Ban className="h-6 w-6 shrink-0" /> Sem entrega
        </p>
        <p className="mt-1 text-base font-bold uppercase">Apenas retirada na loja</p>
      </div>
    );
  }

  return (
    <div
      className="bg-red-600 px-4 py-5 text-center text-white"
      role="alert"
      data-testid="banner-sem-motoboy"
    >
      <p className="flex items-center justify-center gap-3 text-2xl font-extrabold uppercase leading-tight sm:text-3xl">
        <Ban className="h-8 w-8 shrink-0" /> Sem entrega no momento
      </p>
      <p className="mt-1 flex items-center justify-center gap-2 text-xl font-extrabold uppercase sm:text-2xl">
        <Store className="h-6 w-6 shrink-0" /> Apenas retirada na loja
      </p>
      <p className="mt-2 text-sm font-medium opacity-90">
        Estamos sem motoboy. Faça seu pedido e retire no balcão.
      </p>
    </div>
  );
}
