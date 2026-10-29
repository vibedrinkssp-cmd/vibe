import { useCallback, useEffect, useState } from 'react';
import { Loader2, LogOut, RefreshCw, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client-safe';
import { ShoppingListView, type ShoppingCategory, type ShoppingProduct } from './admin/tabs/ShoppingListTab';

const TOKEN_KEY = 'compras_token';

interface ComprasPayload {
  success: boolean;
  error?: string;
  expired?: boolean;
  token?: string;
  products?: { id: string; name: string; stock: number | null; is_active: boolean; category_id: string | null }[];
  categories?: ShoppingCategory[];
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // sem storage: a sessão vale só até fechar a tela
  }
}

async function callCompras(body: Record<string, unknown>): Promise<ComprasPayload> {
  const { data, error } = await supabase.functions.invoke('compras', { body });
  if (error) return { success: false, error: 'Sem conexão com o servidor' };
  return data as ComprasPayload;
}

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await callCompras({ action: 'login', username, password });
    setBusy(false);
    if (res.success && res.token) onLogin(res.token);
    else setError(res.error ?? 'Não foi possível entrar');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Lista de Compras</h1>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Usuário" autoCapitalize="none" autoComplete="username" />
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" autoComplete="current-password" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !username || !password}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ListScreen({ token, onExit }: { token: string; onExit: () => void }) {
  const [products, setProducts] = useState<ShoppingProduct[]>([]);
  const [categories, setCategories] = useState<ShoppingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await callCompras({ action: 'list', token });
    setLoading(false);
    if (res.expired) return onExit();
    if (!res.success) return setError(res.error ?? 'Erro ao carregar');
    setProducts((res.products ?? []).map((p) => ({ id: p.id, name: p.name, stock: p.stock, isActive: p.is_active, categoryId: p.category_id })));
    setCategories(res.categories ?? []);
  }, [token, onExit]);

  useEffect(() => {
    void load();
  }, [load]);

  const header = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">Compras - Vibe Drinks</h1>
      </div>
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" onClick={load} disabled={loading} aria-label="Atualizar lista">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button size="icon" variant="ghost" onClick={onExit} aria-label="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-background p-3">
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <ShoppingListView products={products} categories={categories} isLoading={loading} header={header} />
    </div>
  );
}

/** Lista de compras para o Nelson usar no mercado, com login próprio (sem acesso ao admin). */
export default function Compras() {
  const [token, setToken] = useState<string | null>(readToken);

  const exit = useCallback(() => {
    writeToken(null);
    setToken(null);
  }, []);

  if (!token) {
    return <LoginForm onLogin={(t) => { writeToken(t); setToken(t); }} />;
  }
  return <ListScreen token={token} onExit={exit} />;
}
