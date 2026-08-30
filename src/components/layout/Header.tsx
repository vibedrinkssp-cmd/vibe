import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, Menu, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import logoImage from '@/assets/logo-vm.jpg';

interface HeaderProps {
  onCartOpen: () => void;
}

export function Header({ onCartOpen }: HeaderProps) {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { itemCount, subtotal } = useCart();
  const { isAuthenticated, user, logout } = useAuth();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-primary/10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <img 
              src={logoImage} 
              alt="VM Brasil" 
              className="h-10 w-auto rounded-xl hover:opacity-80 transition-opacity"
              data-testid="img-logo"
            />
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="relative text-foreground/80 hover:text-primary hover:bg-primary/10"
              onClick={onCartOpen}
              data-testid="button-cart"
            >
              <ShoppingCart className="h-5 w-5" />
              <AnimatePresence>
                {itemCount > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-1 -right-1"
                  >
                    <Badge 
                      className="h-5 min-w-5 flex items-center justify-center p-0 px-1 bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs font-bold border-none"
                      data-testid="badge-cart-count"
                    >
                      {itemCount}
                    </Badge>
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>

            {isAuthenticated ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-foreground/80 hover:text-primary hover:bg-primary/10"
                onClick={() => navigate('/perfil')}
                data-testid="button-profile"
              >
                <User className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-primary border-primary/40 hover:bg-primary/10 hover:border-primary font-medium"
                onClick={() => navigate('/login')}
                data-testid="button-login"
              >
                Entrar
              </Button>
            )}

            <Link 
              to="/admin" 
              className="text-muted-foreground/30 hover:text-primary/50 transition-colors p-2"
            >
              <Settings className="h-4 w-4" />
            </Link>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" className="text-foreground/80" data-testid="button-menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="bg-white/95 border-primary/20 backdrop-blur-xl w-80">
                <SheetHeader>
                  <SheetTitle className="sr-only">Menu</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col h-full pt-8">
                  <div className="flex items-center justify-between mb-8">
                    <img src={logoImage} alt="VM Brasil" className="h-8 rounded-lg" />
                  </div>

                  {isAuthenticated && (
                    <div className="space-y-1 mb-8">
                      <p className="text-sm text-muted-foreground">Bem-vindo,</p>
                      <p className="text-lg font-semibold text-primary">{user?.name}</p>
                    </div>
                  )}

                  <nav className="flex flex-col gap-2">
                    {isAuthenticated ? (
                      <>
                        <Link 
                          to="/perfil" 
                          className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-primary/10 transition-colors"
                          onClick={() => setMobileMenuOpen(false)}
                          data-testid="link-profile-mobile"
                        >
                          <User className="h-5 w-5 text-primary" />
                          Meu Perfil
                        </Link>
                        <Link 
                          to="/pedidos" 
                          className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-primary/10 transition-colors"
                          onClick={() => setMobileMenuOpen(false)}
                          data-testid="link-orders-mobile"
                        >
                          <ShoppingCart className="h-5 w-5 text-primary" />
                          Meus Pedidos
                        </Link>
                        
                        <div className="my-4 border-t border-primary/10" />
                        
                        <Button 
                          variant="ghost" 
                          className="justify-start text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={() => { logout(); setMobileMenuOpen(false); }}
                        >
                          <X className="h-5 w-5 mr-3" />
                          Sair da conta
                        </Button>
                      </>
                    ) : (
                      <Button
                        className="bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold"
                        onClick={() => { navigate('/login'); setMobileMenuOpen(false); }}
                      >
                        Entrar ou Cadastrar
                      </Button>
                    )}
                  </nav>

                  {itemCount > 0 && (
                    <div className="mt-auto pt-8 border-t border-primary/10">
                      <Button
                        className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold"
                        onClick={() => { onCartOpen(); setMobileMenuOpen(false); }}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Ver Carrinho ({itemCount}) - {formatPrice(subtotal)}
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
