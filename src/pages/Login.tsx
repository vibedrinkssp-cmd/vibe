import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Phone, User, MapPin, ArrowRight, Loader2, Lock, ArrowLeft, CheckCircle2, CreditCard, Info, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { checkPhone, customerLogin, registerCustomer, changePassword, requestPasswordReset } from '@/lib/customer-auth';
import { validateCPF, formatCPF, cleanCPF, generatePasswordFromCPF } from '@/lib/cpf-utils';
import { z } from 'zod';
import { AddressAutocomplete } from '@/components/location/AddressAutocomplete';
import { InteractiveAddressMap } from '@/components/location/InteractiveAddressMap';
import { useGoogleMaps, type AddressComponents } from '@/hooks/use-google-maps';
import logoImage from '@/assets/logo-vibedrinks.gif';
import { supabase } from '@/integrations/supabase/client-safe';

// Validation schemas
const phoneSchema = z.string().length(11, 'WhatsApp deve ter 11 dígitos (DDD + número)');
const passwordSchema = z.string().length(4, 'Senha deve ter 4 dígitos');
const cpfSchema = z.string().refine((val) => validateCPF(val), 'CPF inválido');
const registerSchema = z.object({
  whatsapp: z.string().length(11, 'WhatsApp deve ter 11 dígitos (DDD + número)'),
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  cpf: z.string().refine((val) => validateCPF(val), 'CPF inválido'),
  neighborhood: z.string().min(1, 'Preencha seu bairro'),
  street: z.string().min(1, 'Rua é obrigatória'),
  number: z.string().min(1, 'Número é obrigatório'),
});
type Step = 'choice' | 'phone' | 'password' | 'register';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { login, logout, setAddress, role, isHydrated } = useAuth();
  const { geocodeAddress } = useGoogleMaps();
  const [isNavigating, setIsNavigating] = useState(false);

  // If a staff member is logged in and lands on customer login, clear their session
  useEffect(() => {
    if (isHydrated && role && role !== 'customer') {
      logout();
    }
  }, [isHydrated, role, logout]);
  
  // Check if mode=register is in URL to start directly in register mode
  const initialMode = searchParams.get('mode');
  const [step, setStep] = useState<Step>(initialMode === 'register' ? 'register' : 'choice');
  const [isLoading, setIsLoading] = useState(false);
  const [userName, setUserName] = useState('');
  
  const [whatsapp, setWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [distanceError, setDistanceError] = useState('');

  // Fetch store location for distance validation
  const { data: storeSettings } = useQuery({
    queryKey: ['store-settings-for-distance'],
    queryFn: async () => {
      const { data, error } = await supabase.from('store_info').select('store_lat, store_lng').single();
      if (error) return null;
      return data;
    },
  });

  const MAX_DISTANCE_KM = 22;

  const calculateDistance = (lat: number, lng: number): number => {
    if (!storeSettings?.store_lat || !storeSettings?.store_lng) return 0;
    const R = 6371;
    const dLat = (Number(storeSettings.store_lat) - lat) * Math.PI / 180;
    const dLng = (Number(storeSettings.store_lng) - lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(Number(storeSettings.store_lat) * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const [showForgotPasswordDialog, setShowForgotPasswordDialog] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingLoginData, setPendingLoginData] = useState<{ user: any; address: any } | null>(null);

  const buildAddressSearchText = () =>
    [street, number, selectedNeighborhood, city, state, 'Brasil']
      .filter(Boolean)
      .join(', ');

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '').slice(0, 11);
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 3) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 3)} ${numbers.slice(3)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 3)} ${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWhatsapp(formatPhone(e.target.value));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPassword(value);
  };

  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpf(formatCPF(e.target.value));
  };

  const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setNewPassword(value);
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
    setConfirmPassword(value);
  };

  // Get password preview from CPF
  const passwordPreview = cpf.length >= 4 ? cleanCPF(cpf).substring(0, 4) : '****';

  const handleCheckPhone = async () => {
    const cleanPhone = whatsapp.replace(/\D/g, '');
    
    // Validate with Zod
    const validation = phoneSchema.safeParse(cleanPhone);
    if (!validation.success) {
      toast({ title: 'Número inválido', description: validation.error.errors[0].message, variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const result = await checkPhone(cleanPhone);
      
      if (result.isMotoboy) {
        toast({ 
          title: 'Acesso de motoboy', 
          description: 'Use o login de funcionarios na engrenagem da home', 
          variant: 'destructive' 
        });
        setTimeout(() => navigate('/'), 2000);
        return;
      }
      
      if (result.exists) {
        setUserName(result.userName || '');
        setStep('password');
      } else {
        setStep('register');
      }
    } catch (error) {
      toast({ 
        title: 'Erro de conexão', 
        description: 'Não foi possível verificar seu número. Tente novamente.', 
        variant: 'destructive' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    // Validate with Zod (now 4 digits)
    const validation = passwordSchema.safeParse(password);
    if (!validation.success) {
      toast({ title: 'Senha inválida', description: validation.error.errors[0].message, variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = whatsapp.replace(/\D/g, '');
      const result = await customerLogin(cleanPhone, password);
      
      if (result.success) {
        // Set real Supabase Auth session for RLS
        if (result.accessToken && result.refreshToken) {
          try {
            await supabase.auth.setSession({
              access_token: result.accessToken,
              refresh_token: result.refreshToken,
            });
          } catch (e) {
            console.warn('[Login] setSession failed:', e);
          }
        }

        if (result.requiresPasswordChange) {
          setPendingLoginData({ user: result.user, address: result.address });
          setShowChangePasswordDialog(true);
        } else {
          login(result.user!, 'customer', result.sessionToken);
          if (result.address) {
            setAddress(result.address);
          }
          toast({ title: 'Bem-vindo de volta!', description: `Ola, ${result.user!.name}!` });
          setIsNavigating(true);
          const params = new URLSearchParams(window.location.search);
          const redirect = params.get('redirect') || '/';
          navigate(redirect);
        }
      } else {
        toast({ title: 'Erro', description: result.error || 'Senha incorreta', variant: 'destructive' });
      }
    } catch (error) {
      toast({ 
        title: 'Erro ao entrar', 
        description: 'Verifique sua senha e tente novamente', 
        variant: 'destructive' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setForgotPasswordLoading(true);
    try {
      const cleanPhone = whatsapp.replace(/\D/g, '');
      const result = await requestPasswordReset(cleanPhone);
      
      if (result.success) {
        setShowForgotPasswordDialog(false);
        toast({ 
          title: 'Lembrete', 
          description: 'Sua senha são os 4 primeiros dígitos do seu CPF cadastrado.'
        });
        setStep('phone');
        setPassword('');
      } else {
        toast({ title: 'Erro', description: result.error || 'Erro ao solicitar', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Erro', description: 'Tente novamente mais tarde', variant: 'destructive' });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length !== 4) {
      toast({ title: 'Senha invalida', description: 'A senha deve ter 4 digitos', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Senhas nao conferem', description: 'Digite a mesma senha nos dois campos', variant: 'destructive' });
      return;
    }

    setChangePasswordLoading(true);
    try {
      const result = await changePassword(pendingLoginData?.user?.id, newPassword);
      
      if (result.success) {
        setShowChangePasswordDialog(false);
        login(result.user!, 'customer');
        if (pendingLoginData?.address) {
          setAddress(pendingLoginData.address);
        }
        toast({ title: 'Senha alterada!', description: 'Sua nova senha foi definida com sucesso.' });
        setIsNavigating(true);
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect') || '/';
        navigate(redirect);
      } else {
        toast({ title: 'Erro', description: result.error || 'Erro ao alterar senha', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Erro', description: 'Tente novamente', variant: 'destructive' });
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const handleRegister = async () => {
    const cleanPhone = whatsapp.replace(/\D/g, '');

    // Validate with Zod
    const validation = registerSchema.safeParse({
      whatsapp: cleanPhone,
      name: name.trim(),
      cpf: cleanCPF(cpf),
      neighborhood: selectedNeighborhood,
      street,
      number,
    });

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast({ title: 'Dados inválidos', description: firstError.message, variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      let resolvedLatitude = latitude;
      let resolvedLongitude = longitude;

      // Try geocoding if no coords yet — but DON'T block registration if it fails
      if (resolvedLatitude == null || resolvedLongitude == null) {
        try {
          const geocoded = await geocodeAddress(buildAddressSearchText());
          if (geocoded?.latitude && geocoded?.longitude) {
            resolvedLatitude = geocoded.latitude;
            resolvedLongitude = geocoded.longitude;
            setLatitude(geocoded.latitude);
            setLongitude(geocoded.longitude);
            if (!zipCode && geocoded.zipCode) {
              setZipCode(geocoded.zipCode);
            }
          }
        } catch {
          // Geocoding failed — proceed without coordinates
        }
      }

      // Distance check only if we have coordinates
      if (resolvedLatitude != null && resolvedLongitude != null) {
        const dist = calculateDistance(resolvedLatitude, resolvedLongitude);
        if (dist > MAX_DISTANCE_KM) {
          toast({ title: 'Endereço muito distante', description: `Não atendemos endereços acima de ${MAX_DISTANCE_KM}km da loja.`, variant: 'destructive' });
          setIsLoading(false);
          return;
        }
      }

      const cleanedCpf = cleanCPF(cpf);
      
      const result = await registerCustomer(
        { name: name.trim(), whatsapp: cleanPhone, cpf: cleanedCpf },
        {
          street,
          number,
          complement,
          neighborhood: selectedNeighborhood,
          city: city || 'São José dos Campos',
          state: state || 'SP',
          zipCode,
          notes,
          latitude: resolvedLatitude,
          longitude: resolvedLongitude,
        }
      );
      
      if (result.success) {
        // Set real Supabase Auth session for RLS
        if (result.accessToken && result.refreshToken) {
          try {
            await supabase.auth.setSession({
              access_token: result.accessToken,
              refresh_token: result.refreshToken,
            });
          } catch (e) {
            console.warn('[Login] setSession failed:', e);
          }
        }

        login(result.user!, 'customer');
        if (result.address) {
          setAddress(result.address);
        }
        toast({ title: 'Cadastro realizado!', description: `Bem-vindo, ${name}!` });
        setIsNavigating(true);
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect') || '/';
        navigate(redirect);
      } else {
        // Show specific error messages
        const errorMsg = result.error || 'Erro ao cadastrar';
        if (errorMsg.includes('WhatsApp já cadastrado')) {
          toast({ title: 'WhatsApp já cadastrado', description: 'Esse número já possui uma conta. Tente fazer login.', variant: 'destructive' });
        } else if (errorMsg.includes('CPF já cadastrado')) {
          toast({ title: 'CPF já cadastrado', description: 'Esse CPF já possui uma conta. Tente fazer login com o WhatsApp associado.', variant: 'destructive' });
        } else {
          toast({ title: 'Erro ao cadastrar', description: errorMsg, variant: 'destructive' });
        }
      }
    } catch (error) {
      toast({ title: 'Erro ao cadastrar', description: 'Verifique os dados e tente novamente.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const stepIndicators = step === 'register' ? [
    { step: 'register', label: 'Cadastro' },
  ] : [
    { step: 'phone', label: 'Telefone' },
    { step: 'password', label: 'Senha' },
  ];

  // Show loading state while navigating to prevent flash/crash
  if (isNavigating || !isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Entrando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-black/50 flex items-center justify-center p-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
      <div className="absolute inset-0 bg-gradient-radial-gold opacity-20 pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="bg-card/80 backdrop-blur-xl border-primary/20 shadow-2xl shadow-primary/5">
          <CardHeader className="text-center pb-2">
            <Link to="/">
              <img 
                src={logoImage} 
                alt="Logo" 
                className="h-14 mx-auto mb-4 hover:opacity-80 transition-opacity"
              />
            </Link>
            
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <CardTitle className="font-serif text-2xl bg-gradient-to-r from-primary via-purple-400 to-primary bg-clip-text text-transparent">
                  {step === 'choice' && 'Bem-vindo!'}
                  {step === 'phone' && 'Entrar'}
                  {step === 'password' && `Olá, ${userName}!`}
                  {step === 'register' && 'Criar Conta'}
                </CardTitle>
                <CardDescription className="text-muted-foreground mt-2">
                  {step === 'choice' && 'Como deseja continuar?'}
                  {step === 'phone' && 'Digite seu número de WhatsApp para continuar'}
                  {step === 'password' && 'Digite os 4 primeiros dígitos do seu CPF'}
                  {step === 'register' && 'Complete seu cadastro para fazer pedidos'}
                </CardDescription>
              </motion.div>
            </AnimatePresence>

            {step !== 'choice' && step !== 'register' && (
              <div className="flex items-center justify-center gap-2 mt-4">
                {stepIndicators.map((indicator, index) => (
                  <div key={indicator.step} className="flex items-center">
                    <div 
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                        step === indicator.step 
                          ? 'bg-primary text-primary-foreground' 
                          : step === 'password' && indicator.step === 'phone'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {step === 'password' && indicator.step === 'phone' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    {index < stepIndicators.length - 1 && (
                      <div className={`w-12 h-0.5 mx-1 ${
                        step === 'password' ? 'bg-primary' : 'bg-secondary'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardHeader>
          
          <CardContent className="space-y-4 pt-4 relative min-h-[200px]">

            <AnimatePresence mode="popLayout" initial={false}>
              {step === 'choice' && (
                <motion.div
                  key="choice"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4"
                >
                  <Button
                    className="w-full h-14 bg-primary text-primary-foreground font-semibold text-lg"
                    onClick={() => setStep('phone')}
                    data-testid="button-existing-customer"
                  >
                    <User className="h-5 w-5 mr-2" />
                    Já tenho cadastro
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full h-14 border-primary/30 text-primary hover:bg-primary/10 font-semibold text-lg"
                    onClick={() => setStep('register')}
                    data-testid="button-new-customer"
                  >
                    <ArrowRight className="h-5 w-5 mr-2" />
                    Sou novo cliente
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-primary"
                    onClick={() => navigate('/')}
                    data-testid="button-back-home"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar para o site
                  </Button>
                </motion.div>
              )}

              {step === 'phone' && (
                <motion.div
                  key="phone"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp" className="text-foreground">WhatsApp</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/60" />
                      <Input
                        id="whatsapp"
                        type="tel"
                        placeholder="(11) 9 1234-5678"
                        value={whatsapp}
                        onChange={handlePhoneChange}
                        className="pl-11 bg-secondary/50 border-primary/20 text-foreground focus:border-primary h-12 text-lg"
                        data-testid="input-whatsapp"
                      />
                    </div>
                  </div>

                  <Button
                    className="w-full h-12 bg-primary text-primary-foreground font-semibold text-lg"
                    onClick={handleCheckPhone}
                    disabled={isLoading}
                    data-testid="button-continue"
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Continuar
                        <ArrowRight className="h-5 w-5 ml-2" />
                      </>
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-primary"
                    onClick={() => setStep('choice')}
                    data-testid="button-back-choice"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar
                  </Button>
                </motion.div>
              )}

              {step === 'password' && (
                <motion.div
                  key="password"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-foreground">Senha (4 dígitos do CPF)</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/60" />
                      <Input
                        id="password"
                        type="password"
                        inputMode="numeric"
                        placeholder="****"
                        value={password}
                        onChange={handlePasswordChange}
                        maxLength={4}
                        className="pl-11 bg-secondary/50 border-primary/20 text-foreground text-center text-2xl tracking-[0.5em] h-12 font-mono"
                        data-testid="input-password"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Digite os 4 primeiros dígitos do seu CPF
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 h-12 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => {
                        setStep('phone');
                        setPassword('');
                      }}
                      data-testid="button-back-password"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Voltar
                    </Button>
                    <Button
                      className="flex-1 h-12 bg-primary text-primary-foreground font-semibold"
                      onClick={handleLogin}
                      disabled={isLoading || password.length !== 4}
                      data-testid="button-login"
                    >
                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        'Entrar'
                      )}
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground text-sm hover:text-primary"
                    onClick={() => setShowForgotPasswordDialog(true)}
                    data-testid="button-forgot-password"
                  >
                    Esqueci minha senha
                  </Button>
                </motion.div>
              )}

              {step === 'register' && (
                <motion.div
                  key="register"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4"
                >
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
                    className="space-y-2"
                  >
                    <Label htmlFor="register-whatsapp" className="text-foreground">WhatsApp</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/60" />
                      <Input
                        id="register-whatsapp"
                        type="tel"
                        placeholder="(11) 9 1234-5678"
                        value={whatsapp}
                        onChange={handlePhoneChange}
                        className="pl-11 bg-secondary/50 border-primary/20 text-foreground h-11"
                        data-testid="input-register-whatsapp"
                      />
                    </div>
                  </motion.div>

                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
                    className="space-y-2"
                  >
                    <Label htmlFor="name" className="text-foreground">Nome completo</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/60" />
                      <Input
                        id="name"
                        placeholder="Seu nome"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pl-11 bg-secondary/50 border-primary/20 text-foreground h-11"
                        data-testid="input-name"
                      />
                    </div>
                  </motion.div>

                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4, ease: "easeOut" }}
                    className="space-y-2"
                  >
                    <Label htmlFor="register-cpf" className="text-foreground">CPF</Label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/60" />
                      <Input
                        id="register-cpf"
                        type="tel"
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        value={cpf}
                        onChange={handleCPFChange}
                        maxLength={14}
                        className="pl-11 bg-secondary/50 border-primary/20 text-foreground h-11"
                        data-testid="input-register-cpf"
                      />
                    </div>
                    
                    {/* Password info alert */}
                    <Alert className="bg-primary/10 border-primary/20 mt-2">
                      <Info className="h-4 w-4 text-primary" />
                      <AlertDescription className="text-sm text-foreground">
                        Sua senha será os 4 primeiros dígitos do seu CPF: <strong className="font-mono tracking-wider">{passwordPreview}</strong>
                      </AlertDescription>
                    </Alert>
                  </motion.div>

                  <motion.div 
                    initial={{ opacity: 0, y: 20, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
                    className="space-y-3 p-4 rounded-xl bg-secondary/30 border border-primary/10"
                  >
                    <Label className="text-foreground flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      Endereço de entrega
                    </Label>
                    
                    {/* Smart Address Search with Google */}
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5, duration: 0.3 }}
                    >
                      <AddressAutocomplete
                        onAddressSelect={(addr: AddressComponents) => {
                          setStreet(addr.street);
                          setNumber(addr.number);
                          setSelectedNeighborhood(addr.neighborhood);
                          setCity(addr.city);
                          setState(addr.state.length === 2 ? addr.state : 'SP');
                          setZipCode(addr.zipCode);
                          setLatitude(addr.latitude);
                          setLongitude(addr.longitude);
                          // Check distance
                          if (addr.latitude && addr.longitude) {
                            const dist = calculateDistance(addr.latitude, addr.longitude);
                            if (dist > MAX_DISTANCE_KM) {
                              setDistanceError(`Endereço a ${dist.toFixed(1)}km — acima do limite de ${MAX_DISTANCE_KM}km.`);
                            } else {
                              setDistanceError('');
                            }
                          }
                        }}
                        placeholder="Buscar endereço ou usar GPS..."
                      />
                    </motion.div>

                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.55, duration: 0.3 }}
                      className="space-y-3"
                    >
                      <div className="grid grid-cols-4 gap-2">
                        <Input
                          placeholder="Rua"
                          value={street}
                          onChange={(e) => {
                            setStreet(e.target.value);
                            setLatitude(null);
                            setLongitude(null);
                            setDistanceError('');
                          }}
                          className="col-span-3 bg-secondary/50 border-primary/20 text-foreground h-10"
                          data-testid="input-street"
                        />
                        <Input
                          placeholder="Nro"
                          value={number}
                          onChange={(e) => {
                            setNumber(e.target.value);
                            setLatitude(null);
                            setLongitude(null);
                            setDistanceError('');
                          }}
                          className="bg-secondary/50 border-primary/20 text-foreground h-10"
                          data-testid="input-number"
                        />
                      </div>

                      <Input
                        placeholder="Bairro"
                        value={selectedNeighborhood}
                        onChange={(e) => {
                          setSelectedNeighborhood(e.target.value);
                          setLatitude(null);
                          setLongitude(null);
                          setDistanceError('');
                        }}
                        className="bg-secondary/50 border-primary/20 text-foreground h-10"
                        data-testid="input-neighborhood"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Cidade"
                          value={city}
                          onChange={(e) => {
                            setCity(e.target.value);
                            setLatitude(null);
                            setLongitude(null);
                            setDistanceError('');
                          }}
                          className="bg-secondary/50 border-primary/20 text-foreground h-10"
                          data-testid="input-city"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="UF"
                            value={state}
                            onChange={(e) => {
                              setState(e.target.value.toUpperCase().slice(0, 2));
                              setLatitude(null);
                              setLongitude(null);
                              setDistanceError('');
                            }}
                            maxLength={2}
                            className="bg-secondary/50 border-primary/20 text-foreground h-10"
                            data-testid="input-state"
                          />
                          <Input
                            placeholder="CEP"
                            value={zipCode}
                            onChange={(e) => setZipCode(e.target.value)}
                            className="bg-secondary/50 border-primary/20 text-foreground h-10"
                            data-testid="input-zipcode"
                          />
                        </div>
                      </div>

                      <Input
                        placeholder="Complemento (opcional)"
                        value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                        className="bg-secondary/50 border-primary/20 text-foreground h-10"
                        data-testid="input-complement"
                      />

                      <Textarea
                        placeholder="Observações para entrega..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="bg-secondary/50 border-primary/20 text-foreground resize-none"
                        rows={2}
                        data-testid="input-notes"
                      />

                      {/* Interactive Map Preview */}
                      <div className="pt-2">
                        <Label className="text-muted-foreground text-sm mb-2 block">
                          Localização no Mapa
                        </Label>
                        <InteractiveAddressMap
                          latitude={latitude ?? undefined}
                          longitude={longitude ?? undefined}
                          className="h-[180px]"
                          onLocationChange={(lat, lng) => {
                            setLatitude(lat);
                            setLongitude(lng);
                            const dist = calculateDistance(lat, lng);
                            if (dist > MAX_DISTANCE_KM) {
                              setDistanceError(`Endereço a ${dist.toFixed(1)}km — acima do limite de ${MAX_DISTANCE_KM}km.`);
                            } else {
                              setDistanceError('');
                            }
                          }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Clique no mapa para ajustar a localização
                        </p>
                      </div>
                    </motion.div>
                  </motion.div>

                  {distanceError && (
                    <Alert className="bg-destructive/10 border-destructive/30">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <AlertDescription className="text-sm text-destructive">
                        {distanceError}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-11 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => {
                        setStep('choice');
                        setCpf('');
                        setName('');
                        setWhatsapp('');
                        setStreet('');
                        setNumber('');
                        setComplement('');
                        setSelectedNeighborhood('');
                        setNotes('');
                      }}
                      data-testid="button-back-register"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Voltar
                    </Button>
                    <Button
                      className="flex-1 h-11 bg-primary text-primary-foreground font-semibold"
                      onClick={handleRegister}
                      disabled={isLoading || !!distanceError}
                      data-testid="button-register"
                    >
                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        'Criar Conta'
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={showForgotPasswordDialog} onOpenChange={setShowForgotPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Esqueceu sua senha?</DialogTitle>
            <DialogDescription>
              Sua senha são os 4 primeiros dígitos do seu CPF cadastrado.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              WhatsApp: <span className="font-medium text-foreground">{whatsapp}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Nome: <span className="font-medium text-foreground">{userName}</span>
            </p>
            <Alert className="mt-4 bg-primary/10 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                Se você não lembra seu CPF, entre em contato com o administrador.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowForgotPasswordDialog(false)}
              data-testid="button-cancel-forgot"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showChangePasswordDialog} onOpenChange={() => {}}>
        <DialogContent 
          className="sm:max-w-md" 
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          hideCloseButton
        >
          <DialogHeader>
            <DialogTitle>Criar Nova Senha</DialogTitle>
            <DialogDescription>
              Sua senha foi redefinida pelo administrador. Por favor, crie uma nova senha de 4 digitos para continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha (4 digitos)</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/60" />
                <Input
                  id="new-password"
                  type="password"
                  inputMode="numeric"
                  placeholder="****"
                  value={newPassword}
                  onChange={handleNewPasswordChange}
                  maxLength={4}
                  className="pl-11 bg-secondary/50 border-primary/20 text-foreground text-center text-xl tracking-[0.5em] h-11 font-mono"
                  data-testid="input-new-password"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary/60" />
                <Input
                  id="confirm-password"
                  type="password"
                  inputMode="numeric"
                  placeholder="****"
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  maxLength={4}
                  className="pl-11 bg-secondary/50 border-primary/20 text-foreground text-center text-xl tracking-[0.5em] h-11 font-mono"
                  data-testid="input-confirm-password"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleChangePassword}
              disabled={changePasswordLoading || newPassword.length !== 4 || confirmPassword.length !== 4}
              className="w-full bg-primary text-primary-foreground"
              data-testid="button-confirm-change-password"
            >
              {changePasswordLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Confirmar Nova Senha'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
