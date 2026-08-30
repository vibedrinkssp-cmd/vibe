import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';

export interface Employee {
  id: string;
  name: string;
  whatsapp: string | null;
  isActive: boolean;
  createdAt: string;
}

function mapEmployee(row: Record<string, unknown>): Employee {
  return {
    id: row.id as string,
    name: row.name as string,
    whatsapp: row.whatsapp as string | null,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
  };
}

export function useEmployees(onlyActive = true) {
  return useQuery<Employee[]>({
    queryKey: ['employees', onlyActive],
    queryFn: async () => {
      let query = supabase
        .from('employees')
        .select('*')
        .order('name', { ascending: true });
      if (onlyActive) {
        query = query.eq('is_active', true);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapEmployee);
    },
  });
}
