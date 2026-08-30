import { Wine, Minus, Plus, ShoppingCart, ChevronLeft } from 'lucide-react';
import { getFruitEmoji } from '@/lib/emoji-icons';

export interface RecipeDoseLine {
  bottleName: string;
  doses: number;
  imageUrl?: string | null;
}

export interface RecipeFruitLine {
  id: string;
  name: string;
}

interface DrinkRecipeReviewProps {
  /** Header title, e.g. "🍋 1 CAIPIRINHA MONTADA" */
  title: string;
  /** Friendly singular noun used on the buttons, e.g. "caipirinha", "drink", "caipi ice" */
  noun: string;

  doses?: RecipeDoseLine[];
  energetico?: { name: string } | null;
  gelo?: { name: string; emoji?: string } | null;
  fruits?: RecipeFruitLine[];
  /** Optional free-form lines (ex.: ICE escolhida) */
  extraLines?: { label: string; value: string; emoji?: string; color?: string }[];

  quantity: number;
  setQuantity: (n: number) => void;
  maxQuantity?: number;
  unitPrice: number;

  onBack?: () => void;
  onAddAnotherDifferent: () => void;
  onFinish: () => void;
}

/**
 * Cartão visual de revisão final para drinks montados (Copão, Caipirinha,
 * Caipi Ice, Batidas, Drink de Licor, Drink Personalizado…).
 *
 * Padrão único de UX para evitar dúvidas do cliente ao montar drinks.
 */
export function DrinkRecipeReview({
  title,
  noun,
  doses = [],
  energetico,
  gelo,
  fruits = [],
  extraLines = [],
  quantity,
  setQuantity,
  maxQuantity = 10,
  unitPrice,
  onBack,
  onAddAnotherDifferent,
  onFinish,
}: DrinkRecipeReviewProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-2 space-y-2">

      {/* Visual Recipe Card — compact */}
      <div className="rounded-xl border-2 border-purple-500 bg-purple-500/5 overflow-hidden">
        <div className="bg-purple-600 text-white text-center py-1 px-2">
          <p className="text-xs font-extrabold leading-tight">{title}</p>
        </div>
        <div className="p-2 space-y-1">
          {doses.map((d, i) => (
            <div key={`${d.bottleName}-${i}`} className="flex items-center gap-2 bg-background/60 rounded-lg p-1.5">
              {d.imageUrl ? (
                <img src={d.imageUrl} alt={d.bottleName} className="w-8 h-8 object-contain shrink-0" />
              ) : (
                <Wine className="w-7 h-7 text-purple-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold leading-tight truncate">{d.bottleName}</p>
                <p className="text-[10px] font-semibold text-amber-600 leading-none">
                  {d.doses} {d.doses > 1 ? 'DOSES' : 'DOSE'}
                </p>
              </div>
            </div>
          ))}

          {energetico && (
            <div className="flex items-center gap-2 bg-background/60 rounded-lg p-1.5">
              <span className="text-xl shrink-0">⚡</span>
              <p className="text-xs font-bold leading-tight truncate flex-1 min-w-0">{energetico.name}</p>
            </div>
          )}

          {gelo && (
            <div className="flex items-center gap-2 bg-background/60 rounded-lg p-1.5">
              <span className="text-xl shrink-0">{gelo.emoji ?? '🧊'}</span>
              <p className="text-xs font-bold leading-tight truncate flex-1 min-w-0">{gelo.name}</p>
            </div>
          )}

          {fruits.length > 0 && (
            <div className="flex items-center gap-2 bg-background/60 rounded-lg p-1.5">
              <div className="flex shrink-0">
                {fruits.map(f => (
                  <span key={f.id} className="text-lg -ml-1 first:ml-0">{getFruitEmoji(f.name)}</span>
                ))}
              </div>
              <p className="text-xs font-bold leading-tight flex-1 min-w-0 truncate">
                {fruits.map(f => f.name).join(', ')}
              </p>
            </div>
          )}

          {extraLines.map((ex, i) => (
            <div key={i} className="flex items-center gap-2 bg-background/60 rounded-lg p-1.5">
              <span className="text-xl shrink-0">{ex.emoji ?? '✨'}</span>
              <p className="text-xs font-bold leading-tight truncate flex-1 min-w-0">
                <span className={`uppercase mr-1 ${ex.color ?? 'text-emerald-500'}`}>{ex.label}:</span>
                {ex.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      </div>

      {/* Sticky footer: Quantity + Total + Actions */}
      <div className="shrink-0 border-t bg-background px-3 py-2 space-y-2">
        {/* Quantity + Total — single row */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-2 py-1.5 flex-1">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-8 h-8 rounded-full bg-background border-2 border-purple-500 flex items-center justify-center shrink-0"
              aria-label="Diminuir"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="text-2xl font-extrabold w-8 text-center tabular-nums text-purple-500">{quantity}</span>
            <button
              onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
              className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0"
              aria-label="Aumentar"
            >
              <Plus className="h-4 w-4" />
            </button>
            <p className="text-[10px] text-muted-foreground leading-tight ml-1">iguais<br/>(mesma receita)</p>
          </div>
          <div className="bg-secondary/40 rounded-lg px-3 py-1.5 text-center">
            <p className="text-[10px] text-muted-foreground leading-none">TOTAL</p>
            <p className="text-xl font-extrabold text-primary leading-tight">R$ {(unitPrice * quantity).toFixed(2)}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-1.5">
          <button
            onClick={onFinish}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition"
          >
            <ShoppingCart className="h-4 w-4" />
            Finalizar • R$ {(unitPrice * quantity).toFixed(2)}
          </button>
          <div className="grid grid-cols-2 gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="py-2 rounded-xl border text-xs font-medium text-muted-foreground flex items-center justify-center"
              >
                <ChevronLeft className="h-3 w-3 inline mr-1" />Editar
              </button>
            )}
            <button
              onClick={onAddAnotherDifferent}
              className={`py-2 rounded-xl border-2 border-purple-500 text-purple-600 dark:text-purple-300 text-xs font-bold active:scale-[0.98] transition ${!onBack ? 'col-span-2' : ''}`}
            >
              🍷 OUTRO {noun}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

