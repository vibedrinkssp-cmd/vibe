// Types derived from Supabase database schema

export interface User {
  id: string;
  name: string;
  whatsapp: string;
  cpf?: string | null;
  role: string;
  password?: string | null;
  isBlocked?: boolean;
  requiresPasswordChange?: boolean;
  createdAt?: string | Date;
}

export interface Address {
  id: string;
  userId: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  notes?: string | null;
  isDefault?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Category {
  id: string;
  name: string;
  iconUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: string;
}

export type ProductTier = 'essencial' | 'premium' | 'luxo';

export interface Product {
  id: string;
  categoryId: string | null;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  costPrice: string;
  profitMargin: string;
  salePrice: string;
  stock: number;
  isActive?: boolean;
  isPrepared?: boolean;
  comboEligible?: boolean;
  productType?: string | null;
  sortOrder?: number;
  createdAt?: string | null;
  barcode?: string | null;
  tier?: ProductTier | null;
  on99food?: boolean;
  onIfood?: boolean;
  price99food?: string | null;
  priceIfood?: string | null;
}

export interface Order {
  id: string;
  userId: string;
  addressId?: string | null;
  orderType: OrderType;
  status: OrderStatus;
  subtotal: string;
  deliveryFee: string;
  originalDeliveryFee?: string | null;
  deliveryFeeAdjusted?: boolean;
  deliveryFeeAdjustedAt?: string | null;
  deliveryDistance?: string | null;
  discount: string;
  total: string;
  paymentMethod: PaymentMethod;
  changeFor?: string | null;
  notes?: string | null;
  customerName?: string | null;
  salesperson?: Salesperson | null;
  motoboyId?: string | null;
  createdAt?: string | Date;
  acceptedAt?: string | null;
  preparingAt?: string | null;
  readyAt?: string | null;
  dispatchedAt?: string | null;
  pickedUpAt?: string | null;
  arrivedAt?: string | null;
  deliveredAt?: string | null;
  paymentConfirmed?: boolean;
  paymentConfirmedAt?: string | null;
  paymentConfirmedBy?: string | null;
  externalOrigin?: string | null;
  externalOrderId?: string | null;
  mpPaymentId?: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  isWizardItem?: boolean;
}

export interface Banner {
  id: string;
  title: string;
  description?: string | null;
  imageUrl: string;
  linkUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  createdAt?: string;
}

export interface Motoboy {
  id: string;
  name: string;
  whatsapp: string;
  cpf?: string | null;
  photoUrl?: string | null;
  isActive?: boolean;
  isOnline?: boolean;
  loggedInAt?: string | null;
  createdAt?: string;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  locationUpdatedAt?: string | null;
  slotNumber?: number | null;
}

export interface Settings {
  id: string;
  storeAddress?: string | null;
  storeLat?: string | null;
  storeLng?: string | null;
  deliveryRatePerKm: string;
  minDeliveryFee: string;
  maxDeliveryDistance: string;
  pixKey?: string | null;
  openingHours?: Record<string, unknown> | null;
  isOpen?: boolean;
}

export interface ShoppingList {
  id: string;
  name: string;
  status?: 'active' | 'completed';
  createdAt?: string;
  completedAt?: string | null;
  purchasedItems?: number;
  totalItems?: number;
  totalCost?: string;
  purchasedCost?: string;
}

export interface ShoppingListItem {
  id: string;
  shoppingListId: string;
  productId: string;
  productName: string;
  quantity: number;
  checked?: boolean;
  isPurchased?: boolean;
  suggestedQuantity?: number;
  actualQuantity?: number;
  categoryName?: string;
  unitCost?: string;
  totalCost?: string;
}

export interface ShoppingListWithItems extends ShoppingList {
  items?: ShoppingListItem[];
}

// Cart types for frontend
export interface CartItem {
  productId: string;
  product: Product;
  quantity: number;
  isComboItem?: boolean;
  comboId?: string;
}

export interface ComboGelo {
  product: Product;
  quantity: number;
}

export interface ComboData {
  id: string;
  destilado: Product;
  energetico: Product;
  energeticoQuantity: number;
  gelos: ComboGelo[];
  originalTotal: number;
  discountedTotal: number;
  discount: number;
  discountPercent?: number;
  items?: CartItem[];
}

// Custom drink types for self-service drink builder
export interface CustomDrinkDose {
  bottleId: string;
  bottleName: string;
  productId: string;
  doseCount: number;
  pricePerDose: number;
}

export interface CustomDrinkEnergetico {
  type: 'garrafa' | 'lata';
  productId: string;
  productName: string;
  price: number;
}

export interface CustomDrinkFruit {
  id: string;
  name: string;
  price: number;
}

export interface CustomDrinkGelo {
  id: string;
  name: string;
  price: number;
}

export interface CustomDrink {
  id: string;
  type: 'custom_drink';
  name: string;
  description: string;
  doses: CustomDrinkDose[];
  energetico: CustomDrinkEnergetico | null;
  fruits: CustomDrinkFruit[];
  gelo: CustomDrinkGelo | null;
  totalPrice: number;
  quantity: number;
}

// Order status types
export type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'dispatched' | 'arrived' | 'delivered' | 'cancelled';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendente',
  accepted: 'Aceito',
  preparing: 'Preparando',
  ready: 'Pronto',
  dispatched: 'Saiu para Entrega',
  arrived: 'Chegou',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

// Payment method types
export type PaymentMethod = 'pix' | 'pix_pos' | 'cash' | 'card_pos' | 'card_credit' | 'card_debit' | 'mixed';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  pix_pos: 'PIX POS',
  cash: 'Dinheiro',
  card_pos: 'Cartão (Maquininha)',
  card_credit: 'Cartão Crédito',
  card_debit: 'Cartão Débito',
  mixed: 'Pagamento Composto',
};

// Order type
export type OrderType = 'delivery' | 'pickup' | 'local' | 'counter';

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  delivery: 'Delivery',
  pickup: 'Retirada',
  local: 'Local',
  counter: 'Caixa',
};

// Salesperson - now uses dynamic employee names from the database
export type Salesperson = string;

// Legacy labels kept for backward compatibility with existing orders
export const SALESPERSON_LABELS: Record<string, string> = {
  func_1: 'Funcionário 1',
  func_2: 'Funcionário 2',
  func_3: 'Funcionário 3',
  func_4: 'Funcionário 4',
  func_5: 'Funcionário 5',
  func_6: 'Funcionário 6',
  func_7: 'Funcionário 7',
  func_8: 'Funcionário 8',
  func_9: 'Funcionário 9',
  func_10: 'Funcionário 10',
};

// Resolve salesperson display name - handles both legacy keys and new employee names
export function getSalespersonLabel(salesperson: string | null | undefined): string {
  if (!salesperson) return '';
  return SALESPERSON_LABELS[salesperson] || salesperson;
}

// Prepared/Produced categories - products that don't depend on stock
export const PREPARED_CATEGORIES = [
  'Drinks Prontos', 'Drinks', 'Combos', 'Porções', 'Comidinhas',
  'COPAO', 'CAIPIRINHAS', 'BATIDAS', 'DOSES', 'DRINKS ESPECIAIS'
];

export function isPreparedCategoryName(categoryName: string): boolean {
  const normalizedName = categoryName.toUpperCase().trim();
  return PREPARED_CATEGORIES.some(
    cat => normalizedName.includes(cat.toUpperCase())
  );
}

// Physical prepared types: made/warmed but consume real stock (salgados, lanches).
// These MUST be hidden when out of stock, unlike made-to-order drinks (infinite).
const PHYSICAL_PREPARED_TYPES = ['salgado', 'salgadinho', 'lanche'];

// True infinite-stock products: made-to-order drinks that never depend on unit stock.
// Salgados/lanches are is_prepared but physical, so they are NOT infinite.
export function isInfiniteStockProduct(
  product: { isPrepared?: boolean; productType?: string | null; categoryId?: string | null },
  categoryName?: string | null
): boolean {
  const type = (product.productType || '').toLowerCase().trim();
  if (PHYSICAL_PREPARED_TYPES.includes(type)) return false;
  if (product.isPrepared === true) return true;
  if (categoryName && isPreparedCategoryName(categoryName)) return true;
  return false;
}

// For compatibility with existing imports
export const orderItems = {
  $inferSelect: {} as OrderItem,
};
