import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEmployees } from '@/hooks/use-employees';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Camera, CheckCircle2, XCircle, LogIn, LogOut, Trash2, ExternalLink, Plus, Pencil, Users, Phone } from 'lucide-react';
import { FaceEnrollModal } from '@/components/ponto/FaceEnrollModal';
import { normalizeStoredDescriptor } from '@/lib/face-recognition';
import { toast } from 'sonner';

interface PunchRow {
  id: string;
  employee_id: string;
  punch_type: 'in' | 'out';
  punched_at: string;
  photo_url: string | null;
  match_score: number | null;
}

export function TimeClockTab() {
  const qc = useQueryClient();
  const [enrollFor, setEnrollFor] = useState<{ id: string; name: string } | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<{ id: string; name: string; whatsapp: string | null; isActive: boolean } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formWhatsapp, setFormWhatsapp] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [empFilter, setEmpFilter] = useState<string>('');

  const { data: employees = [], isLoading: loadingEmployees } = useEmployees(false);

  const { data: withFaces = [] } = useQuery({
    queryKey: ['employees-faces'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('employees') as any)
        .select('id, face_descriptor, reference_photo_url');
      if (error) throw error;
      return data as Array<{ id: string; face_descriptor: any; reference_photo_url: string | null }>;
    },
  });

  const facesById = useMemo(() => {
    const m = new Map<string, { hasFace: boolean; url: string | null }>();
    withFaces.forEach((r) => m.set(r.id, {
      hasFace: Boolean(normalizeStoredDescriptor(r.face_descriptor)),
      url: r.reference_photo_url,
    }));
    return m;
  }, [withFaces]);

  const openNewEmployee = () => {
    setEditingEmployee(null);
    setFormName('');
    setFormWhatsapp('');
    setFormActive(true);
    setShowForm(true);
  };

  const openEditEmployee = (emp: typeof employees[number]) => {
    setEditingEmployee({ id: emp.id, name: emp.name, whatsapp: emp.whatsapp, isActive: emp.isActive });
    setFormName(emp.name);
    setFormWhatsapp(emp.whatsapp ?? '');
    setFormActive(emp.isActive);
    setShowForm(true);
  };

  const saveEmployee = useMutation({
    mutationFn: async () => {
      const name = formName.trim().toUpperCase();
      if (!name) throw new Error('Nome é obrigatório');
      const whatsapp = formWhatsapp.trim() || null;
      if (editingEmployee) {
        const { error } = await (supabase.rpc as any)('update_employee', {
          p_id: editingEmployee.id,
          p_name: name,
          p_whatsapp: whatsapp,
          p_is_active: formActive,
        });
        if (error) throw error;
        return editingEmployee.id;
      }
      const { data, error } = await (supabase.rpc as any)('create_employee', {
        p_name: name,
        p_whatsapp: whatsapp,
        p_is_active: formActive,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (employeeId) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['employees-faces'] });
      toast.success(editingEmployee ? 'Funcionário atualizado' : 'Funcionário cadastrado');
      setShowForm(false);
      if (!editingEmployee && employeeId) {
        setTimeout(() => setEnrollFor({ id: employeeId, name: formName.trim().toUpperCase() }), 150);
      }
    },
    onError: (err: any) => toast.error(err?.message || 'Erro ao salvar funcionário'),
  });

  const deleteEmployee = async (id: string, name: string) => {
    if (!confirm(`Remover ${name}?`)) return;
    const { error } = await (supabase.rpc as any)('delete_employee', { p_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success('Funcionário removido');
    qc.invalidateQueries({ queryKey: ['employees'] });
    qc.invalidateQueries({ queryKey: ['employees-faces'] });
  };

  const { data: punches = [] } = useQuery({
    queryKey: ['time-clocks', dateFrom, dateTo, empFilter],
    queryFn: async () => {
      let q = (supabase.from('employee_time_clocks') as any)
        .select('*')
        .gte('punched_at', `${dateFrom}T00:00:00`)
        .lte('punched_at', `${dateTo}T23:59:59`)
        .order('punched_at', { ascending: false })
        .limit(500);
      if (empFilter) q = q.eq('employee_id', empFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PunchRow[];
    },
    refetchInterval: 15000,
  });

  const empName = (id: string) => employees.find((e) => e.id === id)?.name ?? '—';

  const removeFace = async (id: string, name: string) => {
    if (!confirm(`Remover rosto cadastrado de ${name}?`)) return;
    const { error } = await (supabase.from('employees') as any)
      .update({ face_descriptor: null, reference_photo_url: null })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Rosto removido');
    qc.invalidateQueries({ queryKey: ['employees-faces'] });
  };

  // Hours summary: pair in→out sequentially per employee
  const summary = useMemo(() => {
    const byEmp = new Map<string, PunchRow[]>();
    for (const p of [...punches].sort((a, b) => a.punched_at.localeCompare(b.punched_at))) {
      const arr = byEmp.get(p.employee_id) ?? [];
      arr.push(p);
      byEmp.set(p.employee_id, arr);
    }
    const rows: Array<{ id: string; name: string; hours: number; punches: number }> = [];
    byEmp.forEach((list, id) => {
      let ms = 0;
      let openIn: number | null = null;
      for (const p of list) {
        if (p.punch_type === 'in') openIn = new Date(p.punched_at).getTime();
        else if (p.punch_type === 'out' && openIn != null) {
          ms += new Date(p.punched_at).getTime() - openIn;
          openIn = null;
        }
      }
      rows.push({ id, name: empName(id), hours: ms / 3600000, punches: list.length });
    });
    return rows.sort((a, b) => b.hours - a.hours);
  }, [punches, employees]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">Funcionários e Ponto</h2>
          <p className="text-sm text-muted-foreground">Cadastre funcionários, capture o rosto inicial e acompanhe entradas/saídas</p>
        </div>
        <Button variant="outline" asChild>
          <a href="/ponto" target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" /> Abrir /ponto
          </a>
        </Button>
      </div>

      <Tabs defaultValue="funcionarios">
        <TabsList>
          <TabsTrigger value="funcionarios">Funcionários</TabsTrigger>
          <TabsTrigger value="registros">Registros</TabsTrigger>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
        </TabsList>

        <TabsContent value="funcionarios" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              {employees.filter((e) => e.isActive).length} ativo(s) de {employees.length} total
            </div>
            <Button onClick={openNewEmployee} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Novo Funcionário
            </Button>
          </div>
          {loadingEmployees && <p className="text-sm text-muted-foreground">Carregando funcionários...</p>}
          {!loadingEmployees && employees.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum funcionário cadastrado</p>
            </Card>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            {employees.map((emp) => {
              const info = facesById.get(emp.id);
              const hasFace = info?.hasFace ?? false;
              return (
                <Card key={emp.id} className={`p-3 flex items-center gap-3 ${!emp.isActive ? 'opacity-60' : ''}`}>
                  <div className="h-14 w-14 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                    {info?.url ? (
                      <img src={info.url} alt={emp.name} className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{emp.name}</div>
                    {emp.whatsapp && (
                      <div className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate">
                        <Phone className="h-3 w-3" /> {emp.whatsapp}
                      </div>
                    )}
                    <div className="text-xs">
                      {hasFace ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Rosto cadastrado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <XCircle className="h-3 w-3" /> Sem rosto
                        </span>
                      )}
                    </div>
                    <Badge variant={emp.isActive ? 'default' : 'secondary'} className="mt-1 text-[10px]">
                      {emp.isActive ? 'ATIVO' : 'INATIVO'}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" onClick={() => setEnrollFor({ id: emp.id, name: emp.name })}>
                      <Camera className="h-4 w-4 mr-1" /> {hasFace ? 'Refazer' : 'Cadastrar'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEditEmployee(emp)}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    {hasFace && (
                      <Button size="sm" variant="ghost" onClick={() => removeFace(emp.id, emp.name)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Remover
                      </Button>
                    )}
                    {!hasFace && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteEmployee(emp.id, emp.name)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="registros" className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-muted-foreground">De</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Até</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Funcionário</label>
              <select
                className="h-10 px-3 rounded-md border bg-background text-sm"
                value={empFilter}
                onChange={(e) => setEmpFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            {punches.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro no período.</p>}
            {punches.map((p) => (
              <Card key={p.id} className="p-2 flex items-center gap-3">
                {p.photo_url ? (
                  <a href={p.photo_url} target="_blank" rel="noreferrer">
                    <img src={p.photo_url} alt="" className="h-10 w-10 rounded object-cover" />
                  </a>
                ) : (
                  <div className="h-10 w-10 rounded bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{empName(p.employee_id)}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(p.punched_at).toLocaleString('pt-BR')}
                    {p.match_score != null && ` · ${(p.match_score * 100).toFixed(0)}%`}
                  </div>
                </div>
                <Badge className={p.punch_type === 'in' ? 'bg-emerald-600' : 'bg-rose-600'}>
                  {p.punch_type === 'in' ? <><LogIn className="h-3 w-3 mr-1" /> ENTRADA</> : <><LogOut className="h-3 w-3 mr-1" /> SAÍDA</>}
                </Badge>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="resumo" className="space-y-1">
          {summary.map((s) => (
            <Card key={s.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.punches} batidas</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold tabular-nums">{s.hours.toFixed(1)} h</div>
                <div className="text-xs text-muted-foreground">no período</div>
              </div>
            </Card>
          ))}
          {summary.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
        </TabsContent>
      </Tabs>

      {enrollFor && (
        <FaceEnrollModal
          open
          onOpenChange={(o) => { if (!o) setEnrollFor(null); }}
          employeeId={enrollFor.id}
          employeeName={enrollFor.name}
          onSaved={() => qc.invalidateQueries({ queryKey: ['employees-faces'] })}
        />
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nome do funcionário"
                autoUppercase
              />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input
                value={formWhatsapp}
                onChange={(e) => setFormWhatsapp(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
            <Button
              className="w-full"
              disabled={!formName.trim() || saveEmployee.isPending}
              onClick={() => saveEmployee.mutate()}
            >
              {saveEmployee.isPending ? 'Salvando...' : editingEmployee ? 'Salvar alterações' : 'Salvar e capturar rosto'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
