import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Search, ShoppingCart, Truck, X, ChevronsUpDown, Sparkles, Wine, Grid3X3, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TutorialModalProps {
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
    title: '🎉 Bem-vindo ao Vibe Drinks!',
    description: 'Vamos te mostrar como usar o app para fazer seus pedidos de forma rápida e fácil. Vamos lá!',
    color: 'from-primary to-purple-600',
    tooltipPosition: 'bottom',
  },
  {
    icon: Search,
    title: '🔍 Busque produtos',
    description: 'Use a barra de busca para encontrar qualquer produto do catálogo: bebidas, lanches, combos e muito mais.',
    color: 'from-blue-500 to-cyan-500',
    targetSelector: '[data-testid="input-search-header"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Sparkles,
    title: '✨ Drinks Especiais da Casa',
    description: 'Nos banners superiores você encontra os Drinks Especiais exclusivos como Maracujack, Copo da Barbie, Drink Cannabis e muito mais! Toque para experimentar.',
    color: 'from-pink-500 to-rose-500',
    targetSelector: '[data-testid="feature-banner-carousel"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Wine,
    title: '🍹 Monte Seu Drink',
    description: 'Escolha entre Caipirinha, Caipi Ice, Copão, Batida, Drinks de Licor e mais! Cada um abre um assistente para você montar seu drink do jeito que quiser.',
    color: 'from-orange-500 to-amber-500',
    targetSelector: '[data-testid="special-drinks-carousel"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: ChevronsUpDown,
    title: '👆 Ocultar / Mostrar destaques',
    description: 'Toque aqui para esconder os banners e liberar mais espaço para ver os produtos. Toque novamente para mostrar.',
    color: 'from-violet-500 to-indigo-500',
    targetSelector: '[data-testid="button-toggle-carousels"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: Grid3X3,
    title: '📂 Categorias',
    description: 'Deslize pelas categorias para filtrar os produtos: Cervejas, Destilados, Energéticos, Lanches e muito mais.',
    color: 'from-teal-500 to-emerald-500',
    targetSelector: '[data-testid="carousel-categories-compact"]',
    tooltipPosition: 'bottom',
  },
  {
    icon: ShoppingCart,
    title: '🛒 Carrinho de Compras',
    description: 'Toque no botão dourado para ver seus itens, ajustar quantidades e finalizar o pedido.',
    color: 'from-yellow-500 to-orange-500',
    targetSelector: '[data-testid="button-cart-gold"]',
    tooltipPosition: 'top',
  },
  {
    icon: Bell,
    title: '📦 Acompanhe Pedidos',
    description: 'Veja o status dos seus pedidos em tempo real, acompanhe a entrega e receba notificações.',
    color: 'from-purple-500 to-pink-500',
    targetSelector: '[data-testid="button-nav-orders"]',
    tooltipPosition: 'top',
  },
];

export function TutorialModal({ open, onOpenChange }: TutorialModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);

  const step = tutorialSteps[currentStep];
  const Icon = step.icon;

  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      setSpotlightRect(null);
      return;
    }

    if (step.targetSelector) {
      const updateRect = () => {
        const element = document.querySelector(step.targetSelector!);
        if (element) {
          setSpotlightRect(element.getBoundingClientRect());
        } else {
          setSpotlightRect(null);
        }
      };

      const timer = setTimeout(updateRect, 50);
      window.addEventListener('resize', updateRect);
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateRect);
      };
    } else {
      setSpotlightRect(null);
    }
  }, [open, currentStep, step.targetSelector]);

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

  const handleClose = () => {
    onOpenChange(false);
  };

  if (!open) return null;

  const spotPadding = 10;
  const spotX = spotlightRect ? spotlightRect.left - spotPadding : 0;
  const spotY = spotlightRect ? spotlightRect.top - spotPadding : 0;
  const spotW = spotlightRect ? spotlightRect.width + spotPadding * 2 : 0;
  const spotH = spotlightRect ? spotlightRect.height + spotPadding * 2 : 0;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* Dark overlay with spotlight hole */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tutorial-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlightRect && (
              <rect
                x={spotX}
                y={spotY}
                width={spotW}
                height={spotH}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.92)"
          mask="url(#tutorial-spotlight-mask)"
        />
      </svg>

      {/* Glowing highlight border */}
      {spotlightRect && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute pointer-events-none rounded-xl"
          style={{
            left: spotX,
            top: spotY,
            width: spotW,
            height: spotH,
            border: '2px solid',
            borderColor: 'hsl(var(--primary))',
            boxShadow: '0 0 0 4px rgba(255, 215, 0, 0.2), 0 0 30px rgba(255, 215, 0, 0.4), inset 0 0 20px rgba(255, 215, 0, 0.1)',
          }}
        />
      )}

      {/* Clickable overlay to close */}
      <div 
        className="absolute inset-0 cursor-pointer" 
        onClick={handleClose}
        style={{ pointerEvents: 'auto' }}
      />

      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 z-30 p-2.5 rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
        style={{ pointerEvents: 'auto' }}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: step.tooltipPosition === 'top' ? -20 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`absolute left-4 right-4 z-20 ${
            step.tooltipPosition === 'top' 
              ? 'top-16' 
              : 'bottom-24'
          }`}
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-sm mx-auto bg-black/90 backdrop-blur-xl rounded-2xl border border-primary/50 shadow-2xl overflow-hidden">
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
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                  <Icon className="h-5 w-5 text-white" />
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
              
              {/* Description */}
              <p className="text-white/70 text-sm leading-relaxed mb-4">
                {step.description}
              </p>

              {/* Navigation */}
              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPrev}
                    className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white h-9 px-3"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Voltar
                  </Button>
                )}
                
                <div className="flex-1" />

                <Button
                  size="sm"
                  onClick={goToNext}
                  className="bg-gradient-to-r from-primary to-purple-600 text-white font-bold h-9 px-5 shadow-lg shadow-primary/30"
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

      {/* Arrow pointing to spotlight */}
      {spotlightRect && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute z-10 pointer-events-none"
          style={{
            left: spotlightRect.left + spotlightRect.width / 2 - 12,
            top: step.tooltipPosition === 'top' 
              ? spotlightRect.top - 40 
              : spotlightRect.bottom + 16,
          }}
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className={`text-primary ${step.tooltipPosition === 'top' ? 'rotate-180' : ''}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 16l-6-6h12l-6 6z" />
            </svg>
          </motion.div>
        </motion.div>
      )}
    </div>,
    document.body
  );
}
