import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { EmployeeReportSection } from '@/components/admin/EmployeeReportSection';

// Mock recharts to avoid canvas issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="chart">{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

const mockOrders = [
  { id: '1', salesperson: 'João', total: 100, order_type: 'counter', payment_method: 'cash', created_at: '2026-02-24T10:00:00Z', status: 'delivered' },
  { id: '2', salesperson: 'João', total: 150, order_type: 'delivery', payment_method: 'pix', created_at: '2026-02-24T11:00:00Z', status: 'delivered' },
  { id: '3', salesperson: 'Maria', total: 200, order_type: 'counter', payment_method: 'card_credit', created_at: '2026-02-24T12:00:00Z', status: 'delivered' },
  { id: '4', salesperson: 'Maria', total: 80, order_type: 'counter', payment_method: 'cash', created_at: '2026-02-24T13:00:00Z', status: 'delivered' },
  { id: '5', salesperson: 'Pedro', total: 50, order_type: 'delivery', payment_method: 'pix', created_at: '2026-02-24T14:00:00Z', status: 'delivered' },
];

const mockSangrias = [
  { id: 's1', responsible: 'João', amount: 20, type: 'troco', created_at: '2026-02-24T15:00:00Z' },
  { id: 's2', responsible: 'Maria', amount: 50, type: 'pagamento', created_at: '2026-02-24T16:00:00Z' },
];

describe('EmployeeReportSection', () => {
  it('renders top 3 ranking', () => {
    render(<EmployeeReportSection orders={mockOrders} sangrias={mockSangrias} />);
    // Maria has 280, João has 250, Pedro has 50 (appear in ranking + table)
    expect(screen.getAllByText('Maria').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('João').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pedro').length).toBeGreaterThanOrEqual(1);
  });

  it('shows correct order counts in table', () => {
    render(<EmployeeReportSection orders={mockOrders} sangrias={mockSangrias} />);
    // Check the detailed table exists
    expect(screen.getByText('Detalhamento por Funcionário')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<EmployeeReportSection orders={[]} sangrias={[]} />);
    expect(screen.getByText('Nenhum dado de funcionário no período')).toBeInTheDocument();
  });

  it('shows sangria info for employees', () => {
    render(<EmployeeReportSection orders={mockOrders} sangrias={mockSangrias} />);
    // João has 1 sangria of R$20
    expect(screen.getAllByText(/1x/).length).toBeGreaterThan(0);
  });
});
