import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, ShieldCheck, Monitor, ChefHat, Bike, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client-safe';

import logoImage from '@/assets/logo-vm.jpg';

type RoleType = 'admin' | 'pdv' | 'kitchen' | 'log';

interface RoleOption {
  id: RoleType;
  label: string;
  icon: React.ElementType;
  color: string;
  route: string;
}

const roles: RoleOption[] = [
  { id: 'admin', label: 'Admin', icon: ShieldCheck, color: 'from-primary to-purple-600', route: '/admin' },
  { id: 'pdv', label: 'PDV', icon: Monitor, color: 'from-blue-500 to-cyan-600', route: '/pdv' },
  { id: 'kitchen', label: 'KDE', icon: ChefHat, color: 'from-purple-500 to-pink-600', route: '/cozinha' },
  { id: 'log', label: 'LOG', icon: ClipboardList, color: 'from-orange-500 to-amber-600', route: '/log' },
];

interface AdminLoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMotoboySelect: () => void;
}

export function AdminLoginModal({ open, onOpenChange, onMotoboySelect }: AdminLoginModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login, logout } = useAuth();
  
  const [selectedRole, setSelectedRole] = useState<RoleType | null>(null);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRoleSelect = (role: RoleType) => {
    setSelectedRole(role);
    setPassword('');
  };

  const handleLogin = async () => {
    if (!selectedRole) return;

    setIsLoading(true);
    
    try {
      let result: any = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke('staff-login', {
            body: { role: selectedRole, password },
          });

          if (error) {
            throw error;
          }

          result = data;
          break;
        } catch (fetchErr) {
          if (attempt === 0) {
            console.warn('[AdminLogin] Fetch error, retrying...', fetchErr);
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          throw fetchErr;
        }
      }

      if (!result || !result.success) {
        toast({ title: result?.error || 'Senha incorreta', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      if (!result.user) {
        toast({ title: 'Usuário não encontrado', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      const roleConfig = roles.find(r => r.id === selectedRole)!;
      const user = { 
        id: result.user.id, 
        name: result.user.name, 
        role: selectedRole,
        whatsapp: result.user.whatsapp 
      };

      // Preload the target route chunk BEFORE navigating to avoid chunk errors
      const routeImports: Record<string, () => Promise<any>> = {
        '/admin': () => import('@/pages/admin/Dashboard'),
        '/pdv': () => import('@/pages/PDV'),
        '/cozinha': () => import('@/pages/Kitchen'),
        '/log': () => import('@/pages/Log'),
      };
      
      const preloader = routeImports[roleConfig.route];
      if (preloader) {
        try {
          await preloader();
        } catch (e) {
          console.warn('[AdminLogin] Chunk preload failed, proceeding anyway:', e);
        }
      }

      // Clear old session state WITHOUT calling supabase.auth.signOut()
      // to avoid race condition where signOut clears the new session
      localStorage.removeItem('vibe-drinks-session-token');
      localStorage.removeItem('vibe-drinks-role');
      localStorage.removeItem('vibe-drinks-user');
      localStorage.removeItem('vibe-drinks-address');

      if (!result.accessToken || !result.refreshToken) {
        toast({ title: 'Sessão operacional não criada', description: 'Tente entrar novamente.', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      try {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
        });
        if (sessionError) throw sessionError;

        const { data: sessionCheck } = await supabase.auth.getSession();
        if (!sessionCheck.session) throw new Error('Sessão operacional ausente após login');
      } catch (e) {
        console.warn('[AdminLogin] setSession failed:', e);
        toast({ title: 'Sessão operacional não criada', description: 'Tente entrar novamente.', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      login(user, selectedRole, result.sessionToken);
      toast({ title: 'Login realizado!', description: `Bem-vindo, ${result.user.name}!` });
      
      // Use requestAnimationFrame to ensure state is flushed before navigation
      requestAnimationFrame(() => {
        setIsLoading(false);
        onOpenChange(false);
        navigate(roleConfig.route);
      });
    } catch (err) {
      console.error('Login exception:', err);
      toast({ title: 'Erro no login', variant: 'destructive' });
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedRole(null);
    setPassword('');
  };

  const handleMotoboyClick = () => {
    onOpenChange(false);
    onMotoboySelect();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-primary/20">
        <DialogHeader className="text-center">
          <img src={logoImage} alt="VM Brasil" className="h-14 mx-auto mb-2" />
          <DialogTitle className="font-serif text-xl text-primary">
            Acesso Restrito
          </DialogTitle>
        </DialogHeader>

        {!selectedRole ? (
          <div className="space-y-4">
            <p className="text-center text-muted-foreground text-sm">
              Selecione seu perfil de acesso
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              {roles.map((role) => {
                const Icon = role.icon;
                return (
                  <motion.button
                    key={role.id}
                    onClick={() => handleRoleSelect(role.id)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl bg-gradient-to-br ${role.color} text-white shadow-lg`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    data-testid={`button-role-${role.id}`}
                  >
                    <Icon className="h-8 w-8" />
                    <span className="text-sm font-bold">{role.label}</span>
                  </motion.button>
                );
              })}
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-primary/20" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <motion.button
              onClick={handleMotoboyClick}
              className="w-full flex items-center justify-center gap-3 p-4 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              data-testid="button-motoboy-select"
            >
              <Bike className="h-6 w-6" />
              <span className="font-bold">Sou Motoboy</span>
            </motion.button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 p-4 rounded-xl bg-secondary">
              {(() => {
                const roleConfig = roles.find(r => r.id === selectedRole)!;
                const Icon = roleConfig.icon;
                return (
                  <>
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${roleConfig.color}`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <span className="font-bold text-lg text-foreground">{roleConfig.label}</span>
                  </>
                );
              })()}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  inputMode="numeric"
                  placeholder="Digite a senha (8 dígitos)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  onFocus={() => setPassword('')}
                  maxLength={8}
                  className="pl-10 bg-secondary border-primary/30 text-foreground text-center text-xl tracking-widest"
                  data-testid="input-admin-password"
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 border-primary/30"
                onClick={handleBack}
                disabled={isLoading}
              >
                Voltar
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground"
                onClick={handleLogin}
                disabled={isLoading || password.length < 8}
                data-testid="button-confirm-login"
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
