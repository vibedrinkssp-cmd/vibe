// Weekly promotions manager tab — create/edit/toggle recurring discounts per weekday.
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BadgePercent, Plus, Trash2, Pencil, Loader2, Power, PowerOff, Calendar, Percent, DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useProducts, useCategories } from '@/hooks/use-supabase-data';
import {
  useAllPromotions, WEEKDAY_LABELS, DRINK_TYPE_KEYS, type WeeklyPromotion,
} from '@/lib/weekly-promotions';

type FormState = {
  id?: string;
  name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  target_type: 'product' | 'category' | 'drink_type';
  target_id: string | null;
  target_key: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_quantity: number;
  active: boolean;
};

const emptyForm = (): FormState => ({
  name: '',
  weekday: new Date().getDay(),
  start_time: '00:00',
  end_time: '23:59',
  target_type: 'product',
  target_id: null,
  target_key: null,
  discount_type: 'percent',
  discount_value: 10,
  min_quantity: 1,
  active: true,
});

export function WeeklyPromotionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: promos = [], isLoading } = useAllPromotions();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const { data: categories = [] } = useCategories({ activeOnly: true });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const grouped = useMemo(() => {
    const map = new Map<number, WeeklyPromotion[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    for (const p of promos) map.get(p.weekday)?.push(p);
    return map;
  }, [promos]);

  const save = useMutation({
    mutationFn: async (payload: FormState) => {
      const row = {
        name: payload.name.trim(),
        weekday: payload.weekday,
        start_time: payload.start_time,
        end_time: payload.end_time,
        target_type: payload.target_type,
        target_id: payload.target_type === 'drink_type' ? null : payload.target_id,
        target_key: payload.target_type === 'drink_type' ? payload.target_key : null,
        discount_type: payload.discount_type,
        discount_value: payload.discount_value,
        min_quantity: payload.min_quantity,
        active: payload.active,
      };
      if (payload.id) {
        const { error } = await supabase.from('weekly_promotions').update(row).eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('weekly_promotions').insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekly-promotions'] });
      setOpen(false);
      setForm(emptyForm());
      toast({ title: 'Promoção salva' });
    },
    onError: (e: unknown) => toast({
      title: 'Erro ao salvar',
      description: e instanceof Error ? e.message : 'Falha',
      variant: 'destructive',
    }),
  });

  const toggleActive = useMutation({
    mutationFn: async (p: WeeklyPromotion) => {
      const { error } = await supabase
        .from('weekly_promotions')
        .update({ active: !p.active })
        .eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weekly-promotions'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('weekly_promotions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weekly-promotions'] }),
  });

  const openNew = () => { setForm(emptyForm()); setOpen(true); };
  const openEdit = (p: WeeklyPromotion) => {
    setForm({
      id: p.id,
      name: p.name,
      weekday: p.weekday,
      start_time: p.start_time.slice(0, 5),
      end_time: p.end_time.slice(0, 5),
      target_type: p.target_type,
      target_id: p.target_id,
      target_key: p.target_key,
      discount_type: p.discount_type,
      discount_value: Number(p.discount_value),
      min_quantity: p.min_quantity,
      active: p.active,
    });
    setOpen(true);
  };

  const targetLabel = (p: WeeklyPromotion) => {
    if (p.target_type === 'product') return products.find(x => x.id === p.target_id)?.name ?? '—';
    if (p.target_type === 'category') return categories.find(x => x.id === p.target_id)?.name ?? '—';
    return DRINK_TYPE_KEYS.find(x => x.key === p.target_key)?.label ?? '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BadgePercent className="w-5 h-5" />
            Promoções Semanais
          </h2>
          <p className="text-sm text-muted-foreground">
            Cadastre descontos que se repetem em determinado dia da semana. Aplicados automaticamente no PDV, Totem e Home.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> Nova promoção
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {WEEKDAY_LABELS.map((label, wd) => {
            const list = grouped.get(wd) ?? [];
            return (
              <Card key={wd}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Calendar className="w-4 h-4" /> {label}
                    <Badge variant="secondary" className="ml-auto">{list.length}</Badge>
                  </div>
                  {list.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">Nenhuma promoção</p>
                  )}
                  {list.map(p => (
                    <div key={p.id} className={`rounded-md border p-2 ${p.active ? '' : 'opacity-50'}`}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {targetLabel(p)} · {p.start_time.slice(0,5)}–{p.end_time.slice(0,5)}
                          </div>
                        </div>
                        <Badge className="gap-1">
                          {p.discount_type === 'percent'
                            ? <><Percent className="w-3 h-3" />{p.discount_value}%</>
                            : <><DollarSign className="w-3 h-3" />{p.discount_value}</>}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-2">
                        <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate(p)}>
                          {p.active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar promoção' : 'Nova promoção'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Segunda da Cerveja"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Dia</Label>
                <Select
                  value={String(form.weekday)}
                  onValueChange={v => setForm(f => ({ ...f, weekday: Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_LABELS.map((l, i) => (
                      <SelectItem key={i} value={String(i)}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Das</Label>
                <Input type="time" value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div>
                <Label>Até</Label>
                <Input type="time" value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label>Alvo</Label>
              <Select
                value={form.target_type}
                onValueChange={(v) => setForm(f => ({ ...f, target_type: v as FormState['target_type'], target_id: null, target_key: null }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Produto específico</SelectItem>
                  <SelectItem value="category">Categoria inteira</SelectItem>
                  <SelectItem value="drink_type">Tipo de drink (wizard)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.target_type === 'product' && (
              <div>
                <Label>Produto</Label>
                <Select value={form.target_id ?? ''} onValueChange={v => setForm(f => ({ ...f, target_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.target_type === 'category' && (
              <div>
                <Label>Categoria</Label>
                <Select value={form.target_id ?? ''} onValueChange={v => setForm(f => ({ ...f, target_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.target_type === 'drink_type' && (
              <div>
                <Label>Tipo de drink</Label>
                <Select value={form.target_key ?? ''} onValueChange={v => setForm(f => ({ ...f, target_key: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {DRINK_TYPE_KEYS.map(d => (
                      <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Tipo</Label>
                <Select
                  value={form.discount_type}
                  onValueChange={(v) => setForm(f => ({ ...f, discount_type: v as 'percent' | 'fixed' }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">% (percentual)</SelectItem>
                    <SelectItem value="fixed">R$ (fixo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor</Label>
                <Input type="number" step="0.01" min={0} value={form.discount_value}
                  onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Qtd. mín.</Label>
                <Input type="number" min={1} value={form.min_quantity}
                  onChange={e => setForm(f => ({ ...f, min_quantity: Math.max(1, Number(e.target.value) || 1) }))} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
              <Label className="!m-0">Ativa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={
                save.isPending ||
                !form.name.trim() ||
                (form.target_type !== 'drink_type' && !form.target_id) ||
                (form.target_type === 'drink_type' && !form.target_key)
              }
            >
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WeeklyPromotionsTab;
