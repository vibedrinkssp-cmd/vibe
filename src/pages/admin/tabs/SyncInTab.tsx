import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Search, Check, Loader2, RefreshCw } from 'lucide-react';

interface ProductRow {
  id: string;
  name: string;
}

function ProductNameRow({ product, onSaved }: { product: ProductRow; onSaved: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState(product.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(product.name);
  }, [product.name]);

  const dirty = value.trim() !== product.name && value.trim().length > 0;

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    const newName = value.trim().toUpperCase();
    const { error } = await supabase
      .from('products')
      .update({ name: newName })
      .eq('id', product.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      setValue(product.name);
      return;
    }
    setValue(newName);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onSaved();
  };

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/40">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setValue(product.name);
        }}
        className="h-9 font-mono text-sm uppercase"
        spellCheck={false}
      />
      <div className="w-7 flex-shrink-0 flex items-center justify-center">
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : saved ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : dirty ? (
          <span className="h-2 w-2 rounded-full bg-amber-500" title="Não salvo" />
        ) : null}
      </div>
    </div>
  );
}

export function SyncInTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: products = [], isLoading, refetch, isFetching } = useQuery<ProductRow[]>({
    queryKey: ['sync-in-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
    staleTime: 15_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return products;
    return products.filter((p) => p.name.toUpperCase().includes(q));
  }, [products, search]);

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['sync-in-products'] });
    queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">SYNC IN</h2>
        <p className="text-sm text-muted-foreground">
          Lista de referência dos nomes exatos cadastrados no sistema. Use estes nomes ao cadastrar/renomear
          produtos no iFood para que os pedidos importados batam automaticamente com o estoque.
          Edite e pressione Enter (ou clique fora) para salvar — a alteração reflete em todo o sistema.
        </p>
      </div>

      <div className="flex items-center gap-2 sticky top-0 bg-background py-2 z-10">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {filtered.length} / {products.length}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-8">Carregando produtos...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">Nenhum produto encontrado.</div>
      ) : (
        <div className="border rounded-lg p-2 bg-card">
          {filtered.map((p) => (
            <ProductNameRow key={p.id} product={p} onSaved={handleSaved} />
          ))}
        </div>
      )}
    </div>
  );
}
