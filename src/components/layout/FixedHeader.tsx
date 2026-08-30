import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, HelpCircle, Bell, Settings, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth';
import { AdminLoginModal } from '@/components/auth/AdminLoginModal';
import { MotoboySelectModal } from '@/components/auth/MotoboySelectModal';
import logoImage from '@/assets/logo-vm.jpg';
import instagramIcon from '@/assets/instagram-icon.jpg';
import { triggerPWAInstallPrompt, directInstallPWA } from '@/components/PWAInstallPrompt';

interface FixedHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onTutorialOpen: () => void;
  notificationCount?: number;
  onSearchFocus?: () => void;
}

export function FixedHeader({ searchQuery, onSearchChange, onTutorialOpen, notificationCount = 0, onSearchFocus }: FixedHeaderProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showMotoboyModal, setShowMotoboyModal] = useState(false);

  const handleAdminClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowAdminModal(true);
  };

  const handleMotoboySelect = () => {
    setShowMotoboyModal(true);
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 glass-bar-purple rounded-b-3xl shadow-xl">
        <div className="max-w-7xl mx-auto px-3">
          <div className="flex items-center h-14 gap-2">
            {/* Logo */}
            <Link to="/" className="flex-shrink-0 group">
              <img 
                src={logoImage} 
                alt="VM Brasil" 
                className="h-10 w-auto rounded-xl transition-all duration-300 group-hover:scale-105"
                data-testid="img-logo"
              />
            </Link>

            {/* Instagram */}
            <button onClick={() => window.open('https://www.instagram.com/_vmbrasil', '_blank', 'noopener,noreferrer')} className="flex-shrink-0 group">
              <img 
                src={instagramIcon} 
                alt="Instagram VM Brasil" 
                className="h-10 w-auto rounded-xl transition-all duration-300 group-hover:scale-105"
              />
            </button>

            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
              <Input
                type="text"
                placeholder="Buscar produtos..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={onSearchFocus}
                className="pl-9 h-9 bg-white/10 border-white/20 text-white placeholder:text-white/50 rounded-full text-sm focus:bg-white/15"
                data-testid="input-search"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              {/* Tutorial */}
              <button
                onClick={onTutorialOpen}
                className="text-white/70 hover:text-white transition-colors p-1.5"
                data-testid="button-tutorial"
              >
                <HelpCircle className="h-5 w-5" />
              </button>

              {/* Notifications */}
              <Link to="/pedidos" className="relative text-white/70 hover:text-white transition-colors p-1.5" data-testid="link-orders">
                <Bell className="h-5 w-5" />
                {notificationCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-red-500 text-white border-0">
                    {notificationCount}
                  </Badge>
                )}
              </Link>

              {/* Install App */}
              <button
                onClick={() => { directInstallPWA(); }}
                className="text-white/50 hover:text-white transition-colors p-1.5"
                title="Instalar aplicativo"
              >
                <Download className="h-4 w-4" />
              </button>

              {/* Admin Settings */}
              <button 
                onClick={handleAdminClick}
                className="text-white/20 hover:text-white/50 transition-colors p-1.5"
                data-testid="link-admin"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <AdminLoginModal 
        open={showAdminModal} 
        onOpenChange={setShowAdminModal}
        onMotoboySelect={handleMotoboySelect}
      />
      
      <MotoboySelectModal 
        open={showMotoboyModal} 
        onOpenChange={setShowMotoboyModal}
      />
    </>
  );
}
