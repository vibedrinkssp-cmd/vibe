// Aba de cupons do PDV — cadastrados via wizard, não atribuídos a clientes
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ticket, Plus, Trash2, Power, PowerOff, Percent, Calendar, Tag, Wine, Loader2, Pencil, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface PosCouponRow {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  valid_from: string;
  valid_until: string;
  category_ids: string[];
  include_drinks: boolean;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function defaultFrom(): string {
  return toLocalInput(new Date().toISOString());
}
function defaultUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return toLocalInput(d.toISOString());
}

export function PosCouponsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PosCouponRow | null>(null);
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 3;

  // form
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [percent, setPercent] = useState('');
  const [validFrom, setValidFrom] = useState(defaultFrom());
  const [validUntil, setValidUntil] = useState(defaultUntil());
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [includeDrinks, setIncludeDrinks] = useState(true);
  const [maxUses, setMaxUses] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['mgr-categories-coupons'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name').order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
  });

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ['pos-coupons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_coupons' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PosCouponRow[];
    },
  });

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const resetForm = () => {
    setEditing(null);
    setCode(''); setDescription(''); setPercent('');
    setValidFrom(defaultFrom()); setValidUntil(defaultUntil());
    setCategoryIds([]); setIncludeDrinks(true); setMaxUses('');
  };

  const openCreate = () => { resetForm(); setStep(1); setModalOpen(true); };
  const openEdit = (c: PosCouponRow) => {
    setEditing(c);
    setCode(c.code);
    setDescription(c.description || '');
    setPercent(String(c.discount_percent));
    setValidFrom(toLocalInput(c.valid_from));
    setValidUntil(toLocalInput(c.valid_until));
    setCategoryIds(c.category_ids || []);
    setIncludeDrinks(c.include_drinks);
    setMaxUses(c.max_uses != null ? String(c.max_uses) : '');
    setStep(1);
    setModalOpen(true);
  };

  const canAdvance = (): boolean => {
    if (step === 1) {
      const num = Number(percent.replace(',', '.'));
      return !!code.trim() && !!num && num > 0 && num <= 100;
    }
    if (step === 2) {
      return !!validFrom && !!validUntil && new Date(validUntil) > new Date(validFrom);
    }
    return true;
  };


  const toggleCategory = (id: string) => {
    setCategoryIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleanCode = code.trim().toUpperCase();
      if (!cleanCode) throw new Error('Digite o código do cupom');
      const num = Number(percent.replace(',', '.'));
      if (!num || num <= 0 || num > 100) throw new Error('Percentual deve ser entre 1 e 100');
      if (!validFrom || !validUntil) throw new Error('Defina início e fim de validade');
      if (new Date(validUntil) <= new Date(validFrom)) throw new Error('O fim deve ser depois do início');

      const payload = {
        code: cleanCode,
        description: description.trim() || null,
        discount_percent: num,
        valid_from: new Date(validFrom).toISOString(),
        valid_until: new Date(validUntil).toISOString(),
        category_ids: categoryIds,
        include_drinks: includeDrinks,
        max_uses: maxUses.trim() ? Math.max(1, parseInt(maxUses, 10)) : null,
      };

      if (editing) {
        const { error } = await supabase.from('pos_coupons' as any).update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('pos_coupons' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-coupons'] });
      toast({ title: editing ? 'Cupom atualizado!' : 'Cupom criado!' });
      setModalOpen(false);
      resetForm();
    },
    onError: (e: any) => {
      const msg = e?.message?.includes('pos_coupons_code_unique') ? 'Já existe um cupom com esse código' : e.message;
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (c: PosCouponRow) => {
      const { error } = await supabase.from('pos_coupons' as any).update({ is_active: !c.is_active }).eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pos-coupons'] }),
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pos_coupons' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-coupons'] });
      toast({ title: 'Cupom removido' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" /> Cupons do PDV
          </h2>
          <p className="text-sm text-muted-foreground">Cupons gerais usados pelo operador no PDV. Validade por data/hora, percentual e categorias.</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Novo cupom
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : coupons.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum cupom cadastrado.</CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {coupons.map((c) => {
            const expired = new Date(c.valid_until) < new Date();
            const exhausted = c.max_uses != null && c.used_count >= c.max_uses;
            return (
              <Card key={c.id} className={!c.is_active || expired || exhausted ? 'opacity-60' : ''}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-lg tracking-wider">{c.code}</span>
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                          <Percent className="w-3 h-3 mr-1" />{c.discount_percent}%
                        </Badge>
                        {!c.is_active && <Badge variant="outline">Inativo</Badge>}
                        {expired && <Badge variant="destructive">Expirado</Badge>}
                        {exhausted && <Badge variant="destructive">Esgotado</Badge>}
                      </div>
                      {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActiveMutation.mutate(c)} title={c.is_active ? 'Desativar' : 'Ativar'}>
                        {c.is_active ? <PowerOff className="w-4 h-4 text-amber-500" /> : <Power className="w-4 h-4 text-emerald-500" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (confirm('Remover este cupom?')) deleteMutation.mutate(c.id); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{fmtDate(c.valid_from)} → {fmtDate(c.valid_until)}</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    {(!c.category_ids || c.category_ids.length === 0) ? (
                      <Badge variant="secondary">Todas as categorias</Badge>
                    ) : (
                      c.category_ids.map((id) => (
                        <Badge key={id} variant="secondary">{categoryNameById.get(id) || '—'}</Badge>
                      ))
                    )}
                    {c.include_drinks && (
                      <Badge variant="secondary" className="gap-1"><Wine className="w-3 h-3" />Monte seu Drink</Badge>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Usos: <span className="font-semibold text-foreground">{c.used_count}{c.max_uses != null ? ` / ${c.max_uses}` : ' (ilimitado)'}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-primary" /> {editing ? 'Editar cupom' : 'Novo cupom'}
            </DialogTitle>
          </DialogHeader>

          {/* Indicador de etapas do wizard */}
          <div className="flex items-center gap-2 py-1">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${step === s ? 'bg-primary text-primary-foreground' : step > s ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {step > s ? '✓' : s}
                </div>
                {s < 3 && <div className={`h-0.5 flex-1 ${step > s ? 'bg-emerald-500' : 'bg-muted'}`} />}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {step === 1 && 'Etapa 1 de 3 — Identificação e desconto'}
            {step === 2 && 'Etapa 2 de 3 — Validade e limite de usos'}
            {step === 3 && 'Etapa 3 de 3 — Onde o cupom vale'}
          </p>

          <div className="space-y-4 py-2 min-h-[220px]">
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">CÓDIGO</Label>
                    <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="EX: VERAO20" className="mt-1 font-mono uppercase tracking-wider" maxLength={32} autoFocus />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">DESCONTO (%)</Label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                      <Input type="number" inputMode="decimal" min={1} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="10" className="pl-8 font-bold" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">DESCRIÇÃO (opcional)</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Promoção de verão" className="mt-1" maxLength={120} />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">INÍCIO (data/hora)</Label>
                    <Input type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">FIM (data/hora)</Label>
                    <Input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">LIMITE DE USOS (vazio = ilimitado)</Label>
                  <Input type="number" inputMode="numeric" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Ilimitado" className="mt-1" />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Wine className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Aplicar em "Monte seu Drink"</p>
                      <p className="text-xs text-muted-foreground">Drinks montados também recebem o desconto</p>
                    </div>
                  </div>
                  <Switch checked={includeDrinks} onCheckedChange={setIncludeDrinks} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-muted-foreground">CATEGORIAS PERMITIDAS</Label>
                    {categoryIds.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setCategoryIds([])}>
                        <X className="w-3 h-3" /> Limpar (todas)
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">Nenhuma selecionada = vale para todas as categorias.</p>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                    {categories.map((cat) => {
                      const sel = categoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleCategory(cat.id)}
                          className={`text-left text-xs rounded-md border px-2 py-1.5 transition-colors ${sel ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-accent'}`}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            {step > 1 ? (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="gap-1">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            )}

            {step < TOTAL_STEPS ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance()} className="gap-1">
                Próximo <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
                <Ticket className="w-4 h-4" />
                {saveMutation.isPending ? 'Salvando...' : (editing ? 'Salvar' : 'Criar cupom')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
