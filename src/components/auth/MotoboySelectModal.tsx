import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Loader2, Bike, UserPlus, LogIn } from 'lucide-react';
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
import { resilientRpc } from '@/lib/resilient-rpc';
import { supabase } from '@/integrations/supabase/client-safe';
import { formatCPF, validateCPF, cleanCPF } from '@/lib/cpf-utils';

import logoImage from '@/assets/logo-vibedrinks.gif';

type MotoboyView = 'main' | 'login' | 'register';

interface MotoboySelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MotoboySelectModal({ open, onOpenChange }: MotoboySelectModalProps) {
  const { toast } = useToast();
  const { login } = useAuth();
  const navigate = useNavigate();
  
  const [view, setView] = useState<MotoboyView>('main');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const resetState = () => {
    setView('main');
    setCpf('');
    setPassword('');
    setName('');
    setWhatsapp('');
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  };

  const formatWhatsApp = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleLogin = async () => {
    const cpfDigits = cleanCPF(cpf);
    
    if (cpfDigits.length !== 11) {
      toast({ title: 'CPF inválido', description: 'Digite um CPF com 11 dígitos', variant: 'destructive' });
      return;
    }

    if (password.length !== 4) {
      toast({ title: 'Senha inválida', description: 'A senha são os 4 primeiros dígitos do seu CPF', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    
    try {
      const { data, error } = await resilientRpc('login_motoboy_by_cpf', {
        p_cpf: cpfDigits,
        p_password: password
      });

      if (error) {
        console.error('Login error:', error);
        toast({ title: 'Erro no login', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      const result = data as { success: boolean; error?: string; not_found?: boolean; motoboy?: { id: string; name: string; whatsapp: string; is_active: boolean } };

      if (!result.success) {
        if (result.not_found) {
          toast({ 
            title: 'CPF não cadastrado', 
            description: 'Faça seu cadastro primeiro',
            variant: 'destructive' 
          });
          setView('register');
        } else {
          toast({ title: result.error || 'Erro no login', variant: 'destructive' });
        }
        setIsLoading(false);
        return;
      }

      if (!result.motoboy) {
        toast({ title: 'Motoboy não encontrado', variant: 'destructive' });
        setIsLoading(false);
        return;
      }
      
      const user = { 
        id: result.motoboy.id, 
        name: result.motoboy.name, 
        role: 'motoboy',
        whatsapp: result.motoboy.whatsapp 
      };

      // Generate Supabase Auth session for RLS
      try {
        const { data: authData } = await supabase.functions.invoke('auth-login', {
          body: { whatsapp: result.motoboy.whatsapp, password, loginType: 'motoboy' },
        });
        if (authData?.accessToken && authData?.refreshToken) {
          await supabase.auth.setSession({
            access_token: authData.accessToken,
            refresh_token: authData.refreshToken,
          });
        }
      } catch (e) {
        console.warn('[MotoboyLogin] Auth session generation failed:', e);
      }

      login(user, 'motoboy');
      toast({ title: 'Login realizado!', description: `Bem-vindo, ${result.motoboy.name}!` });
      
      // Preload chunk before navigating
      try { await import('@/pages/Motoboy'); } catch {}
      
      requestAnimationFrame(() => {
        setIsLoading(false);
        handleClose(false);
        navigate('/motoboy');
      });
    } catch (err) {
      console.error('Login exception:', err);
      toast({ title: 'Erro no login', variant: 'destructive' });
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    const cpfDigits = cleanCPF(cpf);
    const whatsappDigits = whatsapp.replace(/\D/g, '');
    
    if (!validateCPF(cpfDigits)) {
      toast({ title: 'CPF inválido', variant: 'destructive' });
      return;
    }

    if (!name.trim()) {
      toast({ title: 'Digite seu nome', variant: 'destructive' });
      return;
    }

    if (whatsappDigits.length < 10) {
      toast({ title: 'WhatsApp inválido', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    
    try {
      const { data, error } = await resilientRpc('register_motoboy_self', {
        p_name: name.trim(),
        p_cpf: cpfDigits,
        p_whatsapp: whatsappDigits,
      });

      if (error) {
        console.error('Register error:', error);
        toast({ title: 'Erro no cadastro', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      const result = data as { success: boolean; error?: string; motoboy?: { id: string; name: string; whatsapp: string; is_active: boolean } };

      if (!result.success) {
        toast({ title: result.error || 'Erro no cadastro', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      if (!result.motoboy) {
        toast({ title: 'Erro inesperado', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      const user = { 
        id: result.motoboy.id, 
        name: result.motoboy.name, 
        role: 'motoboy',
        whatsapp: result.motoboy.whatsapp 
      };

      // Generate Supabase Auth session for RLS
      const regCpfDigits = cleanCPF(cpf);
      const motoPassword = regCpfDigits.substring(0, 4);
      try {
        const { data: authData } = await supabase.functions.invoke('auth-login', {
          body: { whatsapp: result.motoboy.whatsapp, password: motoPassword, loginType: 'motoboy' },
        });
        if (authData?.accessToken && authData?.refreshToken) {
          await supabase.auth.setSession({
            access_token: authData.accessToken,
            refresh_token: authData.refreshToken,
          });
        }
      } catch (e) {
        console.warn('[MotoboyRegister] Auth session generation failed:', e);
      }

      login(user, 'motoboy');
      toast({ 
        title: 'Cadastro realizado!', 
        description: `Bem-vindo, ${result.motoboy.name}! Sua senha são os 4 primeiros dígitos do seu CPF.` 
      });
      
      try { await import('@/pages/Motoboy'); } catch {}
      
      requestAnimationFrame(() => {
        setIsLoading(false);
        handleClose(false);
        navigate('/motoboy');
      });
    } catch (err) {
      console.error('Register exception:', err);
      toast({ title: 'Erro no cadastro', variant: 'destructive' });
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-card border-primary/20">
        <DialogHeader className="text-center">
          <img src={logoImage} alt="Logo" className="h-14 mx-auto mb-2" />
          <DialogTitle className="font-serif text-xl text-primary flex items-center justify-center gap-2">
            <Bike className="h-5 w-5" />
            Área do Motoboy
          </DialogTitle>
        </DialogHeader>

        {view === 'main' && (
          <div className="space-y-4">
            <p className="text-center text-muted-foreground text-sm">
              Faça login ou cadastre-se como motoboy
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              <motion.button
                onClick={() => setView('login')}
                className="flex flex-col items-center gap-3 p-6 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <LogIn className="h-8 w-8" />
                <span className="font-bold">Entrar</span>
                <span className="text-xs opacity-80">Já tenho cadastro</span>
              </motion.button>

              <motion.button
                onClick={() => setView('register')}
                className="flex flex-col items-center gap-3 p-6 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-lg"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <UserPlus className="h-8 w-8" />
                <span className="font-bold">Cadastrar</span>
                <span className="text-xs opacity-80">Sou novo aqui</span>
              </motion.button>
            </div>
          </div>
        )}

        {view === 'login' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white">
              <LogIn className="h-6 w-6" />
              <span className="font-bold text-lg">Login Motoboy</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="cpf-login">CPF</Label>
                <Input
                  id="cpf-login"
                  placeholder="000.000.000-00"
                  value={formatCPF(cpf)}
                  onChange={(e) => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  className="bg-secondary border-primary/30 text-center text-lg tracking-wider"
                  inputMode="numeric"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="password-login">Senha (4 primeiros dígitos do CPF)</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password-login"
                    type="password"
                    inputMode="numeric"
                    placeholder="••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    onFocus={() => setPassword('')}
                    maxLength={4}
                    className="pl-10 bg-secondary border-primary/30 text-center text-xl tracking-widest"
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-primary/30" onClick={() => { setView('main'); setCpf(''); setPassword(''); }} disabled={isLoading}>
                Voltar
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={handleLogin}
                disabled={isLoading || cleanCPF(cpf).length !== 11 || password.length !== 4}
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Entrar'}
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Não tem cadastro?{' '}
              <button className="text-primary underline" onClick={() => setView('register')}>
                Cadastre-se aqui
              </button>
            </p>
          </div>
        )}

        {view === 'register' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white">
              <UserPlus className="h-6 w-6" />
              <span className="font-bold text-lg">Cadastro Motoboy</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name-register">Nome Completo</Label>
                <Input
                  id="name-register"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-secondary border-primary/30"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="cpf-register">CPF</Label>
                <Input
                  id="cpf-register"
                  placeholder="000.000.000-00"
                  value={formatCPF(cpf)}
                  onChange={(e) => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  className="bg-secondary border-primary/30 text-center tracking-wider"
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  Sua senha será os 4 primeiros dígitos do CPF
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="whatsapp-register">WhatsApp</Label>
                <Input
                  id="whatsapp-register"
                  placeholder="(11) 99999-9999"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(formatWhatsApp(e.target.value))}
                  className="bg-secondary border-primary/30"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-primary/30" onClick={() => { setView('main'); resetState(); }} disabled={isLoading}>
                Voltar
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleRegister}
                disabled={isLoading || !name.trim() || cleanCPF(cpf).length !== 11 || whatsapp.replace(/\D/g, '').length < 10}
              >
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Cadastrar'}
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Já tem cadastro?{' '}
              <button className="text-primary underline" onClick={() => setView('login')}>
                Faça login
              </button>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
