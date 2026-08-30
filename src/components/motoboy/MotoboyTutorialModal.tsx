import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, ChevronRight, X, Sparkles,
  MapPin, Navigation, CheckCircle, MapPinCheck,
  DollarSign, BarChart3, LogOut, Phone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MotoboyTutorialModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TutorialStep {
  icon: any;
  title: string;
  description: string;
  color: string;
  targetSelector?: string;
  tooltipPosition: 'top' | 'bottom';
}

const tutorialSteps: TutorialStep[] = [
  {
    icon: Sparkles,
    title: '🏍️ Bem-vindo ao Painel de Entregas!',
    description: 'Este tour vai te ensinar a usar o app para realizar entregas de forma rápida e eficiente. Vamos lá!',
    color: 'from-primary to-purple-600',
    tooltipPosition: 'bottom',
  },
  {
    icon: MapPin,
    title: '📍 GPS Automático',
    description: 'Ao fazer login, o sistema ativa o GPS automaticamente e te coloca ONLINE. Você ficará disponível para receber entregas enquanto estiver logado.',
    color: 'from-emerald-500 to-green-500',
    tooltipPosition: 'bottom',
  },
  {
    icon: MapPin,
    title: '🛰️ Ativar GPS',
    description: 'Se o GPS não ativar automaticamente, toque no badge "GPS" vermelho para ativar manualmente. O GPS precisa estar ativo para o cliente acompanhar sua localização.',
    color: 'from-cyan-500 to-blue-500',
    tooltipPosition: 'bottom',
  },
  {
    icon: BarChart3,
    title: '📊 Resumo do Dia',
    description: 'Toque em "Resumo" para ver: horário de login, total de entregas, taxas acumuladas e pedidos em andamento.',
    color: 'from-violet-500 to-purple-500',
    tooltipPosition: 'bottom',
  },
  {
    icon: DollarSign,
    title: '💰 Ganhos de Hoje',
    description: 'No card verde você vê quanto ganhou hoje em taxas de entrega. Atualiza automaticamente a cada entrega concluída.',
    color: 'from-emerald-500 to-teal-500',
    tooltipPosition: 'bottom',
  },
  {
    icon: Navigation,
    title: '🗺️ Abrir Rota no Maps',
    description: 'Em cada pedido, toque no endereço ou no botão de navegação para abrir a rota diretamente no Google Maps.',
    color: 'from-blue-500 to-cyan-500',
    tooltipPosition: 'bottom',
  },
  {
    icon: Phone,
    title: '📱 Contato com Cliente',
    description: 'Toque no número do WhatsApp do cliente para abrir conversa direta. Use para avisar sobre chegada ou dificuldade de acesso.',
    color: 'from-green-500 to-emerald-500',
    tooltipPosition: 'bottom',
  },
  {
    icon: MapPinCheck,
    title: '📍 Botão CHEGUEI',
    description: 'Quando chegar ao destino, toque em "CHEGUEI" para notificar o cliente que você está no local.',
    color: 'from-cyan-500 to-sky-500',
    tooltipPosition: 'top',
  },
  {
    icon: CheckCircle,
    title: '✅ Marcar como Entregue',
    description: 'Após entregar o pedido, toque em "MARCAR COMO ENTREGUE" para finalizar. A taxa será adicionada aos seus ganhos.',
    color: 'from-primary to-amber-500',
    tooltipPosition: 'top',
  },
  {
    icon: LogOut,
    title: '🚪 Encerrar Expediente',
    description: 'Ao sair, toque no botão de logout. Você ficará OFFLINE automaticamente e não receberá mais entregas até fazer login novamente.',
    color: 'from-red-500 to-rose-500',
    tooltipPosition: 'bottom',
  },
];

export function MotoboyTutorialModal({ open, onOpenChange }: MotoboyTutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const step = tutorialSteps[currentStep];
  const Icon = step.icon;

  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
    }
  }, [open]);

  const goToNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onOpenChange(false);
    }
  };

  const goToPrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/90" />

      {/* Clickable overlay */}
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={() => onOpenChange(false)}
        style={{ pointerEvents: 'auto' }}
      />

      {/* Close button */}
      <button
        onClick={() => onOpenChange(false)}
        className="absolute top-4 right-4 z-30 p-2.5 rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
        style={{ pointerEvents: 'auto' }}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute left-4 right-4 z-20 top-1/2 -translate-y-1/2"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-sm mx-auto bg-black/95 backdrop-blur-xl rounded-2xl border border-primary/50 shadow-2xl overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-black/50 flex">
              {tutorialSteps.map((_, idx) => (
                <div
                  key={idx}
                  className={`flex-1 transition-colors duration-300 ${
                    idx <= currentStep ? 'bg-primary' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>

            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base leading-tight">
                    {step.title}
                  </h3>
                  <span className="text-white/40 text-xs">
                    Passo {currentStep + 1} de {tutorialSteps.length}
                  </span>
                </div>
              </div>

              <p className="text-white/70 text-sm leading-relaxed mb-5">
                {step.description}
              </p>

              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPrev}
                    className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white h-10 px-4"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Voltar
                  </Button>
                )}

                <div className="flex-1" />

                <span className="text-white/30 text-xs mr-2">
                  {currentStep + 1}/{tutorialSteps.length}
                </span>

                <Button
                  size="sm"
                  onClick={goToNext}
                  className="bg-gradient-to-r from-primary to-purple-600 text-white font-bold h-10 px-6 shadow-lg shadow-primary/30"
                >
                  {currentStep === tutorialSteps.length - 1 ? (
                    'Começar! 🚀'
                  ) : (
                    <>
                      Próximo
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body
  );
}
