import { forwardRef, useState } from 'react';
import { Home, Ticket, ClipboardList, User, ShoppingCart } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { motion } from 'framer-motion';
import { AuthRequiredModal } from '@/components/auth/AuthRequiredModal';
import { CouponsModal } from '@/components/coupons/CouponsModal';
import { useCouponNotifications } from '@/hooks/use-coupon-notifications';
import { useCustomerOrderBadge } from '@/hooks/use-customer-order-badge';

interface FixedBottomBarProps {
  onCartOpen: () => void;
  onHomeReset?: () => void;
}

interface NavButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  testId: string;
  badge?: number;
}

const NavButton = forwardRef<HTMLButtonElement, NavButtonProps>(function NavButton(
  {
    icon: Icon,
    label,
    onClick,
    isActive = false,
    disabled = false,
    testId,
    badge,
  },
  ref,
) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center justify-center gap-1 min-w-[60px] py-2 px-3 rounded-2xl transition-all duration-300 ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : isActive
            ? 'text-white bg-white/15 shadow-inner'
            : 'text-white/75 hover:text-white hover:bg-white/10'
      }`}
      data-testid={testId}
    >
      <div className="relative">
        <Icon className={`h-5 w-5 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`} />
        {badge != null && badge > 0 && (
          <motion.span
            key={badge}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-2 -right-2.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 border border-red-400"
          >
            {badge > 99 ? '99+' : badge}
          </motion.span>
        )}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
});

export function FixedBottomBar({ onCartOpen, onHomeReset }: FixedBottomBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { itemCount } = useCart();
  const { isAuthenticated } = useAuth();
  const { badgeCount, clearBadge } = useCustomerOrderBadge();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCouponsModal, setShowCouponsModal] = useState(false);
  const [authModalContext, setAuthModalContext] = useState<'orders' | 'profile' | 'coupons'>('profile');

  // Subscribe to coupon notifications
  useCouponNotifications();

  const handleHomeClick = () => {
    if (location.pathname === '/') {
      onHomeReset?.();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/');
    }
  };

  const handleOrdersClick = () => {
    if (isAuthenticated) {
      clearBadge();
      navigate('/pedidos');
    } else {
      setAuthModalContext('orders');
      setShowAuthModal(true);
    }
  };

  const handleProfileClick = () => {
    if (isAuthenticated) {
      navigate('/perfil');
    } else {
      setAuthModalContext('profile');
      setShowAuthModal(true);
    }
  };

  const handleCouponsClick = () => {
    if (isAuthenticated) {
      setShowCouponsModal(true);
    } else {
      setAuthModalContext('coupons');
      setShowAuthModal(true);
    }
  };

  const handleLogin = () => {
    const redirectMap = {
      orders: '/pedidos',
      profile: '/perfil',
      coupons: '/'
    };
    navigate(`/login?redirect=${redirectMap[authModalContext]}&mode=login`);
  };

  const handleRegister = () => {
    const redirectMap = {
      orders: '/pedidos',
      profile: '/perfil',
      coupons: '/'
    };
    navigate(`/login?redirect=${redirectMap[authModalContext]}&mode=register`);
  };

  const getAuthModalContent = () => {
    if (authModalContext === 'orders') {
      return {
        title: 'Acesse seus pedidos',
        description: 'Faça login ou crie uma conta para ver o histórico dos seus pedidos.'
      };
    }
    if (authModalContext === 'coupons') {
      return {
        title: 'Acesse seus cupons',
        description: 'Faça login ou crie uma conta para ver seus cupons de desconto.'
      };
    }
    return {
      title: 'Acesse seu perfil',
      description: 'Faça login ou crie uma conta para gerenciar seu perfil e endereços.'
    };
  };

  const modalContent = getAuthModalContent();

  return (
    <>
      {/* Floating Golden Cart Button - Positioned just above the bar with iOS safe area */}
      <div className="fixed left-1/2 -translate-x-1/2 z-[45] pointer-events-none" style={{ bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="pointer-events-auto">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative"
          >
            <motion.button
              onClick={onCartOpen}
              className="relative rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 text-primary-foreground p-4 border-2 border-amber-200/50"
              style={{
                boxShadow: '0 0 25px rgba(255, 215, 0, 0.5), 0 0 50px rgba(255, 215, 0, 0.25), 0 6px 20px rgba(0, 0, 0, 0.35)',
              }}
              whileHover={{ 
                scale: 1.08,
                boxShadow: '0 0 35px rgba(255, 215, 0, 0.7), 0 0 70px rgba(255, 215, 0, 0.35), 0 8px 25px rgba(0, 0, 0, 0.4)',
              }}
              whileTap={{ scale: 0.92 }}
              data-testid="button-cart-gold"
            >
              {/* Animated glow background */}
              <motion.div
                className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-200 via-amber-100 to-yellow-200 opacity-50"
                animate={{
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              
              {/* Shimmer effect */}
              <motion.div
                className="absolute inset-0 rounded-full overflow-hidden"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                  animate={{
                    x: ['-100%', '200%'],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    repeatDelay: 2,
                    ease: 'easeInOut',
                  }}
                />
              </motion.div>

              <div className="relative">
                <ShoppingCart className="w-6 h-6 text-primary" />
                {itemCount > 0 && (
                  <motion.span
                    key={itemCount}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2 bg-primary-foreground text-primary text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-amber-300"
                    data-testid="badge-cart-count"
                  >
                    {itemCount > 9 ? '9+' : itemCount}
                  </motion.span>
                )}
              </div>
            </motion.button>

            {/* Outer glow */}
            <motion.div
              className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 blur-xl -z-10"
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.4, 0.7, 0.4],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* Bottom Navigation Bar - Premium frosted glass with iOS safe area */}
      <div className="fixed bottom-0 left-0 right-0 z-40 safe-area-inset-bottom">
        <div className="glass-bar-purple rounded-t-3xl px-3 pt-2 shadow-2xl ios-bottom-bar">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-1">
            {/* Left buttons */}
            <div className="flex items-center gap-1">
              <NavButton
                icon={Home}
                label="Home"
                onClick={handleHomeClick}
                isActive={location.pathname === '/'}
                testId="button-nav-home"
              />
              <NavButton
                icon={Ticket}
                label="Cupons"
                onClick={handleCouponsClick}
                testId="button-nav-coupons"
              />
            </div>

            {/* Spacer for cart button */}
            <div className="w-16" />

            {/* Right buttons */}
            <div className="flex items-center gap-1">
              <NavButton
                icon={ClipboardList}
                label="Pedidos"
                onClick={handleOrdersClick}
                isActive={location.pathname === '/pedidos'}
                testId="button-nav-orders"
                badge={badgeCount}
              />
              <NavButton
                icon={User}
                label="Perfil"
                onClick={handleProfileClick}
                isActive={location.pathname === '/perfil'}
                testId="button-nav-profile"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Auth Required Modal */}
      <AuthRequiredModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        onLogin={handleLogin}
        onRegister={handleRegister}
        title={modalContent.title}
        description={modalContent.description}
      />

      {/* Coupons Modal */}
      <CouponsModal
        open={showCouponsModal}
        onOpenChange={setShowCouponsModal}
      />
    </>
  );
}
