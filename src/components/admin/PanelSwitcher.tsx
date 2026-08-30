import { useNavigate } from 'react-router-dom';
import { ChefHat, ClipboardList, ShoppingCart, ChevronDown, ShieldCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth';

type PanelKey = 'kitchen' | 'log' | 'pdv' | 'admin';

const PANELS: Record<PanelKey, { label: string; route: string; icon: React.ElementType }> = {
  kitchen: { label: 'Cozinha (KDE)', route: '/cozinha', icon: ChefHat },
  log:     { label: 'Logística (LOG)', route: '/log', icon: ClipboardList },
  pdv:     { label: 'PDV', route: '/pdv', icon: ShoppingCart },
  admin:   { label: 'Admin', route: '/admin', icon: ShieldCheck },
};

interface PanelSwitcherProps {
  current: PanelKey;
}

export function PanelSwitcher({ current }: PanelSwitcherProps) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const Current = PANELS[current];
  const CurrentIcon = Current.icon;

  // Admin can access everything; staff roles can navigate between operational panels
  // Admin sees admin too; all operational staff (pdv/kitchen/log) can swap freely between the 3 panels
  const isAdmin = role === 'admin';
  const allowedKeys: PanelKey[] = isAdmin
    ? ['kitchen', 'log', 'pdv', 'admin']
    : ['kitchen', 'log', 'pdv'];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-primary-foreground/10 transition-colors"
          data-testid="button-panel-switcher"
        >
          <CurrentIcon className="h-6 w-6 md:h-7 md:w-7 text-primary-foreground" />
          <h1 className="font-serif text-lg md:text-2xl text-primary-foreground">
            {Current.label.replace(/\s*\(.*\)/, '')}
          </h1>
          <ChevronDown className="h-4 w-4 text-primary-foreground/70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Trocar painel
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allowedKeys.map((key) => {
          const p = PANELS[key];
          const Icon = p.icon;
          const isCurrent = key === current;
          return (
            <DropdownMenuItem
              key={key}
              disabled={isCurrent}
              onClick={() => navigate(p.route)}
              className="gap-2 cursor-pointer"
              data-testid={`menu-panel-${key}`}
            >
              <Icon className="h-4 w-4" />
              {p.label}
              {isCurrent && (
                <span className="ml-auto text-[10px] text-muted-foreground">atual</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
