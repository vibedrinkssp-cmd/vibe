// Custom Candlestick Chart Component using Recharts
import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { formatCurrency } from '@/pages/admin/shared';

export interface CandlestickData {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

interface CandlestickChartProps {
  data: CandlestickData[];
  height?: number;
}

// Custom tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null;
  
  // Get original data from the first payload item
  const data = payload[0]?.payload;
  if (!data) return null;
  
  const isUp = data.close >= data.open;
  const change = data.close - data.open;
  const changePercent = data.open > 0 ? ((change / data.open) * 100).toFixed(1) : '0';
  
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="font-medium text-foreground mb-2">{data.date}</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">1º Pedido:</span>
          <span className="font-medium">{formatCurrency(data.open)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Último:</span>
          <span className={`font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
            {formatCurrency(data.close)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Maior:</span>
          <span className="font-medium text-green-500">{formatCurrency(data.high)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Menor:</span>
          <span className="font-medium text-red-500">{formatCurrency(data.low)}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-border">
          <span className="text-muted-foreground">Pedidos:</span>
          <span className="font-medium">{data.volume}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Variação:</span>
          <span className={`font-medium ${isUp ? 'text-green-500' : 'text-red-500'}`}>
            {isUp ? '+' : ''}{changePercent}%
          </span>
        </div>
      </div>
    </div>
  );
};

// Custom bar shape that renders as a candlestick
const CandlestickBar = (props: any) => {
  const { x, y, width, height, fill, payload } = props;
  
  if (!payload) return null;
  
  const { open, close, high, low, isUp, baseY } = payload;
  
  // Skip if no valid data
  if (high === 0 && low === 0) return null;
  
  const strokeColor = isUp ? 'hsl(142, 76%, 46%)' : 'hsl(0, 84%, 70%)';
  const fillColor = isUp ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)';
  
  const centerX = x + width / 2;
  const candleWidth = Math.max(width * 0.7, 16);
  
  // The height represents the body (open-close range)
  // y is the top of the bar, y + height is the bottom
  const bodyTop = y;
  const bodyBottom = y + Math.max(height, 3);
  const bodyHeight = Math.max(Math.abs(height), 3);
  
  // Calculate wick positions relative to the bar
  // This is a simplified version - wicks extend from body
  const wickTop = Math.min(y, bodyTop) - (payload.wickTop || 0);
  const wickBottom = Math.max(y + height, bodyBottom) + (payload.wickBottom || 0);
  
  return (
    <g>
      {/* Upper wick */}
      {payload.wickTop > 0 && (
        <line
          x1={centerX}
          y1={bodyTop - payload.wickTop}
          x2={centerX}
          y2={bodyTop}
          stroke={strokeColor}
          strokeWidth={2}
        />
      )}
      {/* Lower wick */}
      {payload.wickBottom > 0 && (
        <line
          x1={centerX}
          y1={bodyBottom}
          x2={centerX}
          y2={bodyBottom + payload.wickBottom}
          stroke={strokeColor}
          strokeWidth={2}
        />
      )}
      {/* Body */}
      <rect
        x={centerX - candleWidth / 2}
        y={bodyTop}
        width={candleWidth}
        height={bodyHeight}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1}
        rx={2}
      />
    </g>
  );
};

export function CandlestickChart({ data, height = 300 }: CandlestickChartProps) {
  // Transform data for stacked bar representation
  const { chartData, minValue, maxValue } = useMemo(() => {
    if (data.length === 0) {
      return { chartData: [], minValue: 0, maxValue: 100 };
    }
    
    let min = Infinity;
    let max = -Infinity;
    
    data.forEach(d => {
      if (d.low > 0) min = Math.min(min, d.low);
      if (d.high > 0) max = Math.max(max, d.high);
    });
    
    if (min === Infinity) min = 0;
    if (max === -Infinity) max = 100;
    
    const range = max - min;
    const padding = range * 0.15 || 10;
    const paddedMin = Math.max(0, min - padding);
    const paddedMax = max + padding;
    const totalRange = paddedMax - paddedMin;
    
    // Create chart data with calculated positions
    const transformed = data.map(d => {
      const isUp = d.close >= d.open;
      const bodyLow = Math.min(d.open, d.close);
      const bodyHigh = Math.max(d.open, d.close);
      
      // Calculate as percentage of range (for pixel calculation later)
      const pixelPerValue = height / totalRange;
      
      return {
        ...d,
        isUp,
        // For stacked bar: base + body = candle position
        base: bodyLow,
        body: bodyHigh - bodyLow || 0.5, // minimum body size
        // Wick sizes (in value units, will be converted to pixels in the bar)
        wickTop: (d.high - bodyHigh) * pixelPerValue,
        wickBottom: (bodyLow - d.low) * pixelPerValue,
      };
    });
    
    return {
      chartData: transformed,
      minValue: paddedMin,
      maxValue: paddedMax,
    };
  }, [data, height]);

  if (data.length === 0) {
    return (
      <div 
        className="flex flex-col items-center justify-center text-muted-foreground gap-2"
        style={{ height }}
      >
        <span className="text-lg">📊</span>
        <span>Sem dados para o período selecionado</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart 
        data={chartData} 
        margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
        barCategoryGap="20%"
      >
        <XAxis 
          dataKey="date" 
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={{ stroke: 'hsl(var(--border))' }}
        />
        <YAxis 
          domain={[minValue, maxValue]}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          tickLine={{ stroke: 'hsl(var(--border))' }}
          tickFormatter={(value) => `R$${value.toFixed(0)}`}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.3)' }} />
        
        {/* Invisible base bar to position the candlestick */}
        <Bar 
          dataKey="base" 
          stackId="candle" 
          fill="transparent"
          isAnimationActive={false}
        />
        
        {/* Body of the candlestick */}
        <Bar 
          dataKey="body" 
          stackId="candle"
          shape={<CandlestickBar />}
          isAnimationActive={true}
        >
          {chartData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`}
              fill={entry.isUp ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Helper function to generate candlestick data from orders
export function generateCandlestickData(
  orders: Array<{ created_at: string | null; total: number }>,
  dateFormat: (date: Date) => string
): CandlestickData[] {
  const dataByDate: Record<string, { values: number[]; timestamps: number[] }> = {};
  
  orders.forEach(order => {
    if (!order.created_at) return;
    
    const orderDate = new Date(order.created_at);
    const dateKey = dateFormat(orderDate);
    
    if (!dataByDate[dateKey]) {
      dataByDate[dateKey] = { values: [], timestamps: [] };
    }
    
    dataByDate[dateKey].values.push(Number(order.total));
    dataByDate[dateKey].timestamps.push(orderDate.getTime());
  });
  
  return Object.entries(dataByDate)
    .map(([date, { values, timestamps }]) => {
      if (values.length === 0) {
        return { date, open: 0, close: 0, high: 0, low: 0, volume: 0 };
      }
      
      // Sort by timestamp to get correct open/close
      const sorted = values
        .map((v, i) => ({ value: v, time: timestamps[i] }))
        .sort((a, b) => a.time - b.time);
      
      return {
        date,
        open: sorted[0].value,
        close: sorted[sorted.length - 1].value,
        high: Math.max(...values),
        low: Math.min(...values),
        volume: values.length,
      };
    })
    .sort((a, b) => {
      // Parse dd/MM format for sorting
      const [dayA, monthA] = a.date.split('/').map(Number);
      const [dayB, monthB] = b.date.split('/').map(Number);
      if (monthA !== monthB) return monthA - monthB;
      return dayA - dayB;
    });
}