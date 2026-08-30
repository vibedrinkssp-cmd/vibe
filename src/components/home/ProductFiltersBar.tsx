import { ArrowDownAZ, ArrowUpZA, LayoutList, Grid2X2, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';

type GridColumns = 1 | 2 | 3;
type SortOrder = 'az' | 'za' | null;

interface ProductFiltersBarProps {
  gridColumns: GridColumns;
  onGridChange: (columns: GridColumns) => void;
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
}

export function ProductFiltersBar({ 
  gridColumns, 
  onGridChange, 
  sortOrder, 
  onSortChange 
}: ProductFiltersBarProps) {
  return (
    <div className="px-3 py-2 relative">
      <div className="flex items-center gap-2">
        {/* Divider line (soft) */}
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent blur-[0.3px]" />

        {/* Filter controls - glass style */}
        <div className="flex items-center gap-1 bg-primary/20 backdrop-blur-xl rounded-lg p-1 border border-primary/15 shadow-sm">
          {/* Sort A-Z */}
          <Button
            size="icon"
            variant={sortOrder === 'az' ? 'default' : 'ghost'}
            onClick={() => onSortChange(sortOrder === 'az' ? null : 'az')}
            className="h-7 w-7"
            title="Ordenar A-Z"
            data-testid="button-sort-az"
          >
            <ArrowDownAZ className="h-3.5 w-3.5" />
          </Button>

          {/* Sort Z-A */}
          <Button
            size="icon"
            variant={sortOrder === 'za' ? 'default' : 'ghost'}
            onClick={() => onSortChange(sortOrder === 'za' ? null : 'za')}
            className="h-7 w-7"
            title="Ordenar Z-A"
            data-testid="button-sort-za"
          >
            <ArrowUpZA className="h-3.5 w-3.5" />
          </Button>

          {/* Separator */}
          <div className="w-px h-5 bg-primary/20 mx-0.5" />

          {/* Grid 1 column */}
          <Button
            size="icon"
            variant={gridColumns === 1 ? 'default' : 'ghost'}
            onClick={() => onGridChange(1)}
            className="h-7 w-7"
            title="1 por linha"
            data-testid="button-grid-1"
          >
            <LayoutList className="h-3.5 w-3.5" />
          </Button>

          {/* Grid 2 columns */}
          <Button
            size="icon"
            variant={gridColumns === 2 ? 'default' : 'ghost'}
            onClick={() => onGridChange(2)}
            className="h-7 w-7"
            title="2 por linha"
            data-testid="button-grid-2"
          >
            <Grid2X2 className="h-3.5 w-3.5" />
          </Button>

          {/* Grid 3 columns */}
          <Button
            size="icon"
            variant={gridColumns === 3 ? 'default' : 'ghost'}
            onClick={() => onGridChange(3)}
            className="h-7 w-7"
            title="3 por linha"
            data-testid="button-grid-3"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Bottom fade to hide the “cut” line when cards start */}
    </div>
  );
}
