import { ShoppingCart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/lib/cart';

interface FloatingCartButtonProps {
  onClick: () => void;
}

export function FloatingCartButton({ onClick }: FloatingCartButtonProps) {
  const { itemCount, total } = useCart();

  if (itemCount === 0) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0, opacity: 0, y: 100 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0, opacity: 0, y: 100 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="fixed bottom-20 right-4 z-[60] pt-3 pr-1"
        data-testid="container-floating-cart"
      >
        <motion.button
          onClick={onClick}
          className="relative rounded-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 text-black font-bold shadow-2xl border-2 border-amber-300 flex items-center gap-3 min-h-14"
          style={{
            boxShadow: '0 0 30px rgba(245, 158, 11, 0.5), 0 0 60px rgba(245, 158, 11, 0.3), 0 4px 15px rgba(0, 0, 0, 0.3)',
          }}
          whileHover={{ 
            scale: 1.05,
            boxShadow: '0 0 40px rgba(245, 158, 11, 0.7), 0 0 80px rgba(245, 158, 11, 0.4), 0 6px 20px rgba(0, 0, 0, 0.4)',
          }}
          whileTap={{ scale: 0.95 }}
          data-testid="button-floating-cart"
        >
          {/* Shimmer sweep effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            animate={{
              x: ['-100%', '200%'],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              repeatDelay: 3,
              ease: 'easeInOut',
            }}
          />

          <div className="flex items-center gap-3 px-4 relative z-10">
            <motion.div 
              className="relative"
              animate={{
                rotate: [0, -10, 10, -5, 0],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                repeatDelay: 4,
                ease: 'easeInOut',
              }}
            >
              <ShoppingCart className="w-6 h-6" />
              <motion.span
                key={itemCount}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                className="absolute -top-2 -right-2 bg-black text-amber-400 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border border-amber-400"
                data-testid="badge-cart-count"
              >
                {itemCount > 9 ? '9+' : itemCount}
              </motion.span>
            </motion.div>
            <div className="flex flex-col items-start">
              <span className="text-xs opacity-80">Finalizar Compra</span>
              <motion.span 
                key={total}
                initial={{ scale: 1.2, color: '#fff' }}
                animate={{ scale: 1, color: '#000' }}
                transition={{ duration: 0.3 }}
                className="text-lg font-bold" 
                data-testid="text-cart-subtotal"
              >
                {formatCurrency(total)}
              </motion.span>
            </div>
          </div>
        </motion.button>

        {/* Pulsing glow */}
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 blur-xl opacity-40 -z-10"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          data-testid="glow-overlay"
        />

        {/* Floating particles effect */}
        <motion.div
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-300"
          animate={{
            y: [-5, -15, -5],
            x: [0, 5, 0],
            opacity: [0.8, 0, 0.8],
            scale: [1, 0.5, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute -top-2 left-4 w-1.5 h-1.5 rounded-full bg-amber-300"
          animate={{
            y: [-3, -12, -3],
            opacity: [0.6, 0, 0.6],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.5,
          }}
        />
      </motion.div>
    </AnimatePresence>
  );
}
