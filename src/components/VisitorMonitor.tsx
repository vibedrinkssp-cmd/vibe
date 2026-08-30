import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Eye, Clock, ChevronDown, ChevronUp, RefreshCw, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client-safe';
import { cn } from '@/lib/utils';

type TimePeriod = 'live' | '1h' | '6h' | '24h';

interface VisitorSession {
  id: string;
  session_id: string;
  started_at: string;
  last_activity_at: string;
  page_views: number;
  current_page: string | null;
  is_active: boolean;
}

const PERIOD_CONFIG: Record<TimePeriod, { label: string; minutes: number }> = {
  live: { label: 'Ao Vivo', minutes: 2 },
  '1h': { label: '1h', minutes: 60 },
  '6h': { label: '6h', minutes: 360 },
  '24h': { label: '24h', minutes: 1440 },
};

export function VisitorMonitor() {
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('visitorMonitor_expanded');
    return saved !== null ? saved === 'true' : true;
  });
  const [activePeriod, setActivePeriod] = useState<TimePeriod>('live');

  // Persist expansion state
  useEffect(() => {
    localStorage.setItem('visitorMonitor_expanded', String(isExpanded));
  }, [isExpanded]);

  // Fetch visitor sessions
  const { data: sessions = [], isLoading, refetch } = useQuery({
    queryKey: ['visitor-sessions'],
    queryFn: async () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('visitor_sessions')
        .select('*')
        .gte('last_activity_at', twentyFourHoursAgo)
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      return (data || []) as VisitorSession[];
    },
    refetchInterval: 60000, // Refresh every 60 seconds (was 10s)
  });

  // Removed realtime subscription to reduce I/O — polling at 60s is sufficient

  // Calculate visitors per period
  const visitorCounts = useMemo(() => {
    const now = Date.now();
    const counts: Record<TimePeriod, number> = {
      live: 0,
      '1h': 0,
      '6h': 0,
      '24h': 0,
    };

    sessions.forEach((session) => {
      const lastActivity = new Date(session.last_activity_at).getTime();
      const minutesAgo = (now - lastActivity) / (1000 * 60);

      if (minutesAgo <= 2) counts.live++;
      if (minutesAgo <= 60) counts['1h']++;
      if (minutesAgo <= 360) counts['6h']++;
      if (minutesAgo <= 1440) counts['24h']++;
    });

    return counts;
  }, [sessions]);

  // Get sessions for active period
  const filteredSessions = useMemo(() => {
    const now = Date.now();
    const maxMinutes = PERIOD_CONFIG[activePeriod].minutes;

    return sessions.filter((session) => {
      const lastActivity = new Date(session.last_activity_at).getTime();
      const minutesAgo = (now - lastActivity) / (1000 * 60);
      return minutesAgo <= maxMinutes;
    });
  }, [sessions, activePeriod]);

  // Get top pages
  const topPages = useMemo(() => {
    const pageCount: Record<string, number> = {};
    filteredSessions.forEach((session) => {
      if (session.current_page) {
        pageCount[session.current_page] = (pageCount[session.current_page] || 0) + 1;
      }
    });

    return Object.entries(pageCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [filteredSessions]);

  const liveCount = visitorCounts.live;

  return (
    <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-2 px-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-1.5 min-w-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0" />
              <span className="truncate">Visitantes</span>
              {liveCount > 0 && (
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Badge variant="outline" className="border-blue-500/50 text-blue-500 font-mono text-[10px] sm:text-xs px-1.5 sm:px-2">
                {liveCount} <span className="hidden sm:inline">ao vivo</span>
              </Badge>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 sm:h-7 sm:w-7" 
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 sm:h-7 sm:w-7">
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0 px-3 sm:px-6">
            {/* Period Selector */}
            <div className="flex gap-0.5 sm:gap-1 p-0.5 sm:p-1 bg-muted/50 rounded-lg overflow-hidden">
              {(Object.keys(PERIOD_CONFIG) as TimePeriod[]).map((period) => (
                <Button
                  key={period}
                  variant={activePeriod === period ? 'default' : 'ghost'}
                  size="sm"
                  className={cn(
                    "flex-1 h-6 sm:h-7 text-[10px] sm:text-xs px-1 sm:px-2 min-w-0",
                    activePeriod === period && "bg-blue-500 hover:bg-blue-600"
                  )}
                  onClick={() => setActivePeriod(period)}
                >
                  <span className="truncate">{PERIOD_CONFIG[period].label}</span>
                  <Badge 
                    variant="secondary" 
                    className={cn(
                      "ml-0.5 sm:ml-1 h-3.5 sm:h-4 min-w-3.5 sm:min-w-4 px-0.5 sm:px-1 text-[9px] sm:text-[10px]",
                      activePeriod === period && "bg-blue-600/50 text-white"
                    )}
                  >
                    {visitorCounts[period]}
                  </Badge>
                </Button>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-muted/30 min-w-0">
                <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Views</p>
                  <p className="font-medium text-xs sm:text-sm truncate">
                    {filteredSessions.reduce((acc, s) => acc + (s.page_views || 0), 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-muted/30 min-w-0">
                <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Sessões</p>
                  <p className="font-medium text-xs sm:text-sm truncate">{filteredSessions.length}</p>
                </div>
              </div>
            </div>

            {/* Top Pages */}
            {topPages.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Páginas mais visitadas
                </p>
                <div className="space-y-1">
                  {topPages.map(([page, count]) => (
                    <div
                      key={page}
                      className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30"
                    >
                      <span className="truncate font-mono text-muted-foreground">
                        {page}
                      </span>
                      <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                        {count}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
