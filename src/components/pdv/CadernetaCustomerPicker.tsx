import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { User, Loader2, Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/integrations/supabase/client-safe';
import { searchIncludes } from '@/lib/text-utils';

export interface CadernetaCustomer {
  id: string;
  name: string;
  whatsapp: string | null;
  is_active: boolean | null;
  notes: string | null;
}

interface CadernetaCustomerPickerProps {
  open: boolean;
  selectedId: string;
  onSelect: (customer: { id: string; name: string }) => void;
}

const CUSTOMERS_KEY = ['caderneta-customers-pdv'];

async function fetchCustomers(): Promise<CadernetaCustomer[]> {
  // Primary: SECURITY DEFINER RPC (bypasses RLS, works even with flaky auth)
  try {
    const { data, error } = await supabase.rpc('list_caderneta_customers_staff', { p_active_only: true });
    if (!error && data) {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed?.customers && Array.isArray(parsed.customers)) {
        return parsed.customers as CadernetaCustomer[];
      }
    }
    if (error) console.warn('[Caderneta] RPC failed:', error.message);
  } catch (err) {
    console.warn('[Caderneta] RPC exception:', err);
  }

  // Fallback: direct query (works if Supabase Auth session is valid + RLS passes)
  const { data, error } = await (supabase.from('caderneta_customers') as any)
    .select('id, name, whatsapp, is_active, notes')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CadernetaCustomer[];
}

export function CadernetaCustomerPicker({ open, selectedId, onSelect }: CadernetaCustomerPickerProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [newName, setNewName] = useState('');

  const { data: customers = [], isLoading } = useQuery({
    queryKey: CUSTOMERS_KEY,
    queryFn: fetchCustomers,
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('create_caderneta_customer', { p_name: name });
      if (error) throw new Error(error.message);
      return { id: data as string, name: name.toUpperCase() };
    },
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      setNewName('');
      onSelect(customer);
      toast({ title: `Cliente ${customer.name} cadastrado` });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao cadastrar cliente',
        description: error instanceof Error ? error.message : 'Falha inesperada.',
        variant: 'destructive',
      });
    },
  });

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const existing = customers.find(c => c.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      onSelect({ id: existing.id, name: existing.name });
      setNewName('');
      toast({ title: 'Cliente já cadastrado', description: `${existing.name} foi selecionado.` });
      return;
    }
    createMutation.mutate(name);
  };

  const filteredCustomers = customers.filter(c => searchIncludes(c.name, searchTerm));

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Cliente</label>

      <div className="flex gap-2">
        <Input
          placeholder="Novo cliente: digite o nome"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          maxLength={120}
          className="uppercase"
          data-testid="input-caderneta-new-customer"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={!newName.trim() || createMutation.isPending}
          onClick={handleCreate}
          data-testid="button-caderneta-new-customer"
        >
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : customers.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          Nenhum cliente cadastrado ainda. Digite um nome acima para cadastrar.
        </p>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="max-h-36 overflow-auto border rounded-lg divide-y">
            {filteredCustomers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhum cliente encontrado</p>
            ) : (
              filteredCustomers.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    selectedId === c.id ? 'bg-violet-500/20 text-violet-300 font-medium' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => onSelect({ id: c.id, name: c.name })}
                >
                  <User className="h-3 w-3 flex-shrink-0" />
                  {c.name}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
