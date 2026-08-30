import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { Shield, Lock, Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';

const PANELS: Array<{ id: string; label: string; description: string }> = [
  { id: 'admin', label: 'ADMIN', description: 'Painel administrativo principal' },
  { id: 'manager', label: 'MANAGER', description: 'Painel gerencial (este painel)' },
  { id: 'financeiro', label: 'FINANCEIRO', description: 'Aba financeira do Manager' },
  { id: 'pdv', label: 'PDV', description: 'Ponto de venda / balcão' },
  { id: 'kde', label: 'KDE', description: 'Cozinha / preparo de drinks' },
  { id: 'log', label: 'LOG', description: 'Painel de logística / entregas' },
];

const PINS: Array<{ id: string; label: string; description: string }> = [
  { id: 'excluir_pedido', label: 'EXCLUIR PEDIDO', description: 'Solicitado antes de remover qualquer pedido' },
  { id: 'editar_pedido', label: 'EDITAR PEDIDO', description: 'Solicitado ao editar itens de um pedido' },
  { id: 'ver_caixa', label: 'VER CAIXA', description: 'Solicitado para revelar o saldo do caixa no header' },
  { id: 'desconto', label: 'DESCONTO PDV', description: 'Solicitado para aplicar desconto no PDV' },
  { id: 'registrar_fiado', label: 'REGISTRAR FIADO', description: 'Solicitado antes de lançar venda na caderneta (PDV)' },
];

interface PanelRowState {
  current: string;
  next: string;
  confirm: string;
  showCurrent: boolean;
  showNext: boolean;
  loading: boolean;
}

const emptyState = (): PanelRowState => ({
  current: '',
  next: '',
  confirm: '',
  showCurrent: false,
  showNext: false,
  loading: false,
});

export function CredentialsTab() {
  const { toast } = useToast();
  const [state, setState] = useState<Record<string, PanelRowState>>(() =>
    Object.fromEntries(PANELS.map((p) => [p.id, emptyState()]))
  );
  const [pinState, setPinState] = useState<Record<string, PanelRowState>>(() =>
    Object.fromEntries(PINS.map((p) => [p.id, emptyState()]))
  );

  const updatePin = (id: string, patch: Partial<PanelRowState>) =>
    setPinState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleSubmitPin = async (pinId: string, label: string) => {
    const row = pinState[pinId];
    const current = row.current.trim();
    const next = row.next.trim();
    const confirm = row.confirm.trim();

    if (!/^\d{4}$/.test(current)) {
      toast({ title: 'PIN atual inválido', description: 'Informe os 4 dígitos do PIN atual.', variant: 'destructive' });
      return;
    }
    if (!/^\d{4}$/.test(next)) {
      toast({ title: 'Novo PIN inválido', description: 'O novo PIN deve conter exatamente 4 dígitos numéricos.', variant: 'destructive' });
      return;
    }
    if (next !== confirm) {
      toast({ title: 'Confirmação não confere', description: 'A confirmação do novo PIN está diferente.', variant: 'destructive' });
      return;
    }
    if (next === current) {
      toast({ title: 'PIN igual', description: 'O novo PIN deve ser diferente do atual.', variant: 'destructive' });
      return;
    }

    updatePin(pinId, { loading: true });
    try {
      const { data, error } = await supabase.rpc('change_operation_pin_v2', {
        p_operation: pinId,
        p_old: current,
        p_new: next,
        p_updated_by: 'manager',
      });
      if (error) throw error;
      if (data === true) {
        toast({ title: `PIN ${label} alterado`, description: 'O novo PIN já está ativo.' });
        setPinState((prev) => ({ ...prev, [pinId]: emptyState() }));
      } else {
        toast({ title: 'PIN atual incorreto', description: `Não foi possível alterar o PIN ${label}.`, variant: 'destructive' });
        updatePin(pinId, { loading: false });
      }
    } catch (err: any) {
      console.error('[CredentialsTab] change pin error', err);
      toast({ title: 'Erro ao alterar PIN', description: err?.message || 'Tente novamente em instantes.', variant: 'destructive' });
      updatePin(pinId, { loading: false });
    }
  };

  const update = (id: string, patch: Partial<PanelRowState>) =>
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleSubmit = async (panelId: string, label: string) => {
    const row = state[panelId];
    const current = row.current.trim();
    const next = row.next.trim();
    const confirm = row.confirm.trim();

    if (!/^\d{8}$/.test(current)) {
      toast({ title: 'Senha atual inválida', description: 'Informe os 8 dígitos da senha atual.', variant: 'destructive' });
      return;
    }
    if (!/^\d{8}$/.test(next)) {
      toast({ title: 'Nova senha inválida', description: 'A nova senha deve conter exatamente 8 dígitos numéricos.', variant: 'destructive' });
      return;
    }
    if (next !== confirm) {
      toast({ title: 'Confirmação não confere', description: 'A confirmação da nova senha está diferente.', variant: 'destructive' });
      return;
    }
    if (next === current) {
      toast({ title: 'Senha igual', description: 'A nova senha deve ser diferente da atual.', variant: 'destructive' });
      return;
    }

    update(panelId, { loading: true });
    try {
      const { data, error } = await supabase.rpc('change_panel_password_v2', {
        p_panel: panelId,
        p_old: current,
        p_new: next,
        p_updated_by: 'manager',
      });

      if (error) throw error;

      if (data === true) {
        toast({ title: `Senha do painel ${label} alterada`, description: 'A nova senha já está ativa.' });
        update(panelId, { ...emptyState() });
      } else {
        toast({ title: 'Senha atual incorreta', description: `Não foi possível alterar a senha do painel ${label}.`, variant: 'destructive' });
        update(panelId, { loading: false });
      }
    } catch (err: any) {
      console.error('[CredentialsTab] change error', err);
      toast({
        title: 'Erro ao alterar senha',
        description: err?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
      update(panelId, { loading: false });
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-semibold">Credenciais dos Painéis</h2>
          <p className="text-sm text-muted-foreground">
            Altere as senhas de acesso de cada painel. Todas as senhas são armazenadas com criptografia bcrypt.
          </p>
        </div>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 text-sm flex gap-3 items-start">
          <Lock className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Regras das senhas</p>
            <ul className="list-disc pl-4 text-xs text-muted-foreground space-y-0.5">
              <li>Cada senha deve conter exatamente <strong>8 dígitos numéricos</strong>.</li>
              <li>É obrigatório informar a senha atual para confirmar a alteração.</li>
              <li>A alteração tem efeito imediato — todos os logins futuros usarão a nova senha.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {PANELS.map((panel) => {
          const row = state[panel.id];
          return (
            <Card key={panel.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    {panel.label}
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">8 dígitos</Badge>
                </div>
                <CardDescription className="text-xs">{panel.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Senha atual</Label>
                  <div className="relative">
                    <Input
                      type={row.showCurrent ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="••••••••"
                      value={row.current}
                      onChange={(e) => update(panel.id, { current: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                      disabled={row.loading}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => update(panel.id, { showCurrent: !row.showCurrent })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {row.showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Nova senha</Label>
                  <div className="relative">
                    <Input
                      type={row.showNext ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="••••••••"
                      value={row.next}
                      onChange={(e) => update(panel.id, { next: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                      disabled={row.loading}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => update(panel.id, { showNext: !row.showNext })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {row.showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Confirmar nova senha</Label>
                  <Input
                    type={row.showNext ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="••••••••"
                    value={row.confirm}
                    onChange={(e) => update(panel.id, { confirm: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                    disabled={row.loading}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() => handleSubmit(panel.id, panel.label)}
                  disabled={row.loading || !row.current || !row.next || !row.confirm}
                >
                  {row.loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Alterando...
                    </>
                  ) : (
                    <>Alterar senha do {panel.label}</>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-4">
        <Shield className="h-6 w-6 text-amber-500" />
        <div>
          <h2 className="text-xl font-semibold">PINs Operacionais</h2>
          <p className="text-sm text-muted-foreground">
            PINs de 4 dígitos solicitados em ações sensíveis (excluir/editar pedido, ver caixa, desconto PDV).
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PINS.map((pin) => {
          const row = pinState[pin.id];
          return (
            <Card key={pin.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-amber-500" />
                    {pin.label}
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">4 dígitos</Badge>
                </div>
                <CardDescription className="text-xs">{pin.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">PIN atual</Label>
                  <div className="relative">
                    <Input
                      type={row.showCurrent ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="••••"
                      value={row.current}
                      onChange={(e) => updatePin(pin.id, { current: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      disabled={row.loading}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => updatePin(pin.id, { showCurrent: !row.showCurrent })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {row.showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Novo PIN</Label>
                  <div className="relative">
                    <Input
                      type={row.showNext ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="••••"
                      value={row.next}
                      onChange={(e) => updatePin(pin.id, { next: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      disabled={row.loading}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => updatePin(pin.id, { showNext: !row.showNext })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {row.showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Confirmar novo PIN</Label>
                  <Input
                    type={row.showNext ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={row.confirm}
                    onChange={(e) => updatePin(pin.id, { confirm: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    disabled={row.loading}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() => handleSubmitPin(pin.id, pin.label)}
                  disabled={row.loading || !row.current || !row.next || !row.confirm}
                >
                  {row.loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Alterando...
                    </>
                  ) : (
                    <>Alterar PIN {pin.label}</>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default CredentialsTab;
