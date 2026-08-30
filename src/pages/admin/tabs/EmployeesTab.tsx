import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useEmployees, type Employee } from '@/hooks/use-employees';
import { Plus, Pencil, Trash2, Users, Phone } from 'lucide-react';

export function EmployeesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading } = useEmployees(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formWhatsapp, setFormWhatsapp] = useState('');
  const [formActive, setFormActive] = useState(true);

  const openNew = () => {
    setEditingEmployee(null);
    setFormName('');
    setFormWhatsapp('');
    setFormActive(true);
    setShowForm(true);
  };

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormName(emp.name);
    setFormWhatsapp(emp.whatsapp || '');
    setFormActive(emp.isActive);
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formName.trim()) throw new Error('Nome é obrigatório');
      const name = formName.trim().toUpperCase();
      const whatsapp = formWhatsapp.trim() || null;
      if (editingEmployee) {
        const { error } = await supabase.rpc('update_employee', {
          p_id: editingEmployee.id,
          p_name: name,
          p_whatsapp: whatsapp,
          p_is_active: formActive,
        } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('create_employee', {
          p_name: name,
          p_whatsapp: whatsapp,
          p_is_active: formActive,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: editingEmployee ? 'Funcionário atualizado!' : 'Funcionário cadastrado!' });
      setShowForm(false);
    },
    onError: (err: any) => {
      toast({ title: err?.message || 'Erro ao salvar', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_employee', { p_id: id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: 'Funcionário removido!' });
    },
    onError: () => {
      toast({ title: 'Erro ao remover', variant: 'destructive' });
    },
  });

  const activeCount = employees.filter(e => e.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Funcionários
          </h2>
          <p className="text-sm text-muted-foreground">{activeCount} ativo(s) de {employees.length} total</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Novo Funcionário
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : employees.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>Nenhum funcionário cadastrado</p>
            <p className="text-xs mt-1">Cadastre seus funcionários para usar no PDV e Caderneta</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {employees.map(emp => (
            <Card key={emp.id} className={!emp.isActive ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{emp.name}</h3>
                    {emp.whatsapp && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Phone className="h-3 w-3" />
                        {emp.whatsapp}
                      </p>
                    )}
                    <Badge variant={emp.isActive ? 'default' : 'secondary'} className="mt-2 text-xs">
                      {emp.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(emp)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        if (confirm(`Remover ${emp.name}?`)) deleteMutation.mutate(emp.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Editar Funcionário' : 'Novo Funcionário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Nome *</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Nome do funcionário"
                autoUppercase
              />
            </div>
            <div>
              <Label className="text-sm">WhatsApp</Label>
              <Input
                value={formWhatsapp}
                onChange={e => setFormWhatsapp(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Ativo</Label>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
            <Button
              className="w-full"
              disabled={!formName.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
