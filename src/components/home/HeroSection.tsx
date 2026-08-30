import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, Sparkles, Clock, Truck, Gift, Wine } from 'lucide-react';
import { motion } from 'framer-motion';
const heroVideo = '/assets/hero-background.mp4';
import logoImage from '@/assets/logo-vibedrinks.gif';
import { ComboModal } from './ComboModal';
import { SpecialDrinksModal } from './SpecialDrinksModal';

export function HeroSection() {
  const [comboModalOpen, setComboModalOpen] = useState(false);
  const [specialDrinksOpen, setSpecialDrinksOpen] = useState(false);
  
  const scrollToProducts = () => {
    document.getElementById('products-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative h-screen w-full overflow-hidden" data-testid="section-hero">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover scale-105"
        data-testid="video-hero"
      >
        <source src={heroVideo} type="video/mp4" />
      </video>

      {/* Overlay mais claro e esbranquiçado */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-white/5 to-black/70" />
      <div className="absolute inset-0 bg-gradient-to-r from-purple-900/20 via-transparent to-purple-900/20" />
      
      <div className="absolute inset-0 bg-gradient-radial-gold opacity-20" />

      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="space-y-6"
        >
          <motion.div 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-primary font-medium">Bebidas Premium</span>
          </motion.div>

          <motion.img 
            src={logoImage}
            alt="Logo"
            className="h-48 md:h-72 lg:h-96 w-auto drop-shadow-2xl mx-auto"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            data-testid="img-hero-logo"
          />
          
          <motion.p 
            className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            As melhores bebidas premium com entrega rapida para voce
          </motion.p>

          <motion.div 
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <Button
              size="lg"
              className="relative bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 text-black font-bold text-lg rounded-full shadow-2xl shadow-amber-500/30 overflow-visible group"
              onClick={scrollToProducts}
              data-testid="button-hero-cta"
            >
              <span className="relative z-10 flex items-center gap-2">
                Ver Cardapio
                <ChevronDown className="h-5 w-5 group-hover:translate-y-1 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
            </Button>
            
            <Button
              size="lg"
              className="relative bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-400 text-black font-bold text-lg rounded-full shadow-2xl shadow-yellow-400/40 overflow-visible group animate-pulse"
              onClick={() => setComboModalOpen(true)}
              data-testid="button-combo-cta"
            >
              <span className="relative z-10 flex items-center gap-2">
                <Gift className="h-5 w-5" />
                MONTE SEU COMBO 5% OFF
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
            </Button>
            
            <Button
              size="lg"
              className="relative bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 text-white font-bold text-lg rounded-full shadow-2xl shadow-purple-500/40 overflow-visible group animate-pulse"
              onClick={() => setSpecialDrinksOpen(true)}
              data-testid="button-special-drinks-cta"
            >
              <span className="relative z-10 flex items-center gap-2">
                <Wine className="h-5 w-5" />
                DRINKS ESPECIAIS
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-400 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full" />
            </Button>
          </motion.div>

          <motion.div 
            className="flex flex-col items-center gap-4 pt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <div className="flex items-center justify-center gap-8 flex-wrap">
              <div className="flex items-center gap-2 text-white/70">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm">14h as 06h</span>
              </div>
              <div className="w-px h-8 bg-white/20" />
              <div className="flex items-center gap-2 text-white/70">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm">Entrega Propria</span>
              </div>
            </div>
            <p className="text-sm text-white/50">Todos os dias</p>
          </motion.div>
        </motion.div>

        <motion.button 
          onClick={scrollToProducts}
          className="absolute bottom-8 text-primary/80 hover:text-primary transition-colors"
          aria-label="Scroll para produtos"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: [0, 10, 0] }}
          transition={{ 
            opacity: { delay: 1, duration: 0.5 },
            y: { delay: 1, duration: 1.5, repeat: Infinity, ease: "easeInOut" }
          }}
        >
          <ChevronDown className="h-10 w-10" />
        </motion.button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      
      <ComboModal open={comboModalOpen} onOpenChange={setComboModalOpen} />
      <SpecialDrinksModal open={specialDrinksOpen} onOpenChange={setSpecialDrinksOpen} />
    </section>
  );
}
