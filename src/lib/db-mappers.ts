// Database mappers - Convert snake_case from DB to camelCase for TypeScript

import type { Product, Category, Order, OrderItem, User, Address, Motoboy, Banner, Settings } from '@/shared/schema';

// Generic snake_case to camelCase converter
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert object keys from snake_case to camelCase
export function mapFromDb<T>(obj: Record<string, unknown>): T {
  if (!obj) return obj as T;
  
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamel(key);
    result[camelKey] = value;
  }
  return result as T;
}

// Convert array of objects
export function mapArrayFromDb<T>(arr: Record<string, unknown>[]): T[] {
  if (!arr) return [];
  return arr.map(item => mapFromDb<T>(item));
}

// Generic camelCase to snake_case converter for sending to DB
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Convert object keys from camelCase to snake_case for DB
export function mapToDb(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj) return obj;
  
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key);
    result[snakeKey] = value;
  }
  return result;
}

// Specific mappers for common entities
export function mapProduct(dbProduct: Record<string, unknown>): Product {
  return {
    id: dbProduct.id as string,
    categoryId: dbProduct.category_id as string | null,
    name: dbProduct.name as string,
    description: dbProduct.description as string | null,
    imageUrl: dbProduct.image_url as string | null,
    costPrice: String(dbProduct.cost_price || 0),
    profitMargin: String(dbProduct.profit_margin || 0),
    salePrice: String(dbProduct.sale_price || 0),
    stock: (dbProduct.stock as number) ?? 0,
    isActive: dbProduct.is_active as boolean,
    isPrepared: dbProduct.is_prepared as boolean,
    comboEligible: dbProduct.combo_eligible as boolean,
    productType: dbProduct.product_type as string | null,
    sortOrder: dbProduct.sort_order as number,
    createdAt: dbProduct.created_at as string | null,
    barcode: dbProduct.barcode as string | null,
    tier: (dbProduct.tier as Product['tier']) ?? null,
    on99food: (dbProduct.on_99food as boolean) ?? false,
    onIfood: (dbProduct.on_ifood as boolean) ?? false,
    price99food: dbProduct.price_99food != null ? String(dbProduct.price_99food) : null,
    priceIfood: dbProduct.price_ifood != null ? String(dbProduct.price_ifood) : null,
  };
}

export function mapCategory(dbCategory: Record<string, unknown>): Category {
  return {
    id: dbCategory.id as string,
    name: dbCategory.name as string,
    iconUrl: dbCategory.icon_url as string | null,
    sortOrder: dbCategory.sort_order as number,
    isActive: dbCategory.is_active as boolean,
    
    createdAt: dbCategory.created_at as string,
  };
}

export function mapOrder(dbOrder: Record<string, unknown>): Order {
  return {
    id: dbOrder.id as string,
    userId: dbOrder.user_id as string,
    addressId: dbOrder.address_id as string | null,
    orderType: dbOrder.order_type as Order['orderType'],
    status: dbOrder.status as Order['status'],
    subtotal: dbOrder.subtotal as string,
    deliveryFee: dbOrder.delivery_fee as string,
    originalDeliveryFee: dbOrder.original_delivery_fee as string | null,
    deliveryFeeAdjusted: dbOrder.delivery_fee_adjusted as boolean,
    deliveryFeeAdjustedAt: dbOrder.delivery_fee_adjusted_at as string | null,
    deliveryDistance: dbOrder.delivery_distance as string | null,
    discount: dbOrder.discount as string,
    total: dbOrder.total as string,
    paymentMethod: dbOrder.payment_method as Order['paymentMethod'],
    changeFor: dbOrder.change_for as string | null,
    notes: dbOrder.notes as string | null,
    customerName: dbOrder.customer_name as string | null,
    salesperson: dbOrder.salesperson as Order['salesperson'],
    motoboyId: dbOrder.motoboy_id as string | null,
    createdAt: dbOrder.created_at as string,
    acceptedAt: dbOrder.accepted_at as string | null,
    preparingAt: dbOrder.preparing_at as string | null,
    readyAt: dbOrder.ready_at as string | null,
    dispatchedAt: dbOrder.dispatched_at as string | null,
    pickedUpAt: dbOrder.picked_up_at as string | null,
    arrivedAt: dbOrder.arrived_at as string | null,
    deliveredAt: dbOrder.delivered_at as string | null,
    paymentConfirmed: dbOrder.payment_confirmed as boolean | undefined,
    paymentConfirmedAt: dbOrder.payment_confirmed_at as string | null,
    paymentConfirmedBy: dbOrder.payment_confirmed_by as string | null,
    externalOrigin: (dbOrder.external_origin as string | null) ?? null,
    externalOrderId: (dbOrder.external_order_id as string | null) ?? null,
    mpPaymentId: (dbOrder.mp_payment_id as string | null) ?? null,
  };
}

export function mapAdminOrder(dbOrder: Record<string, unknown>): Order & { userName?: string; userWhatsapp?: string; address?: Address } {
  const order = mapOrder(dbOrder);
  const addressPayload = dbOrder.address_payload as Record<string, unknown> | null | undefined;
  const resolvedName = dbOrder.customer_resolved_name as string | null | undefined;
  const resolvedPhone = dbOrder.customer_whatsapp as string | null | undefined;

  return {
    ...order,
    customerName: resolvedName || order.customerName,
    userName: resolvedName || order.customerName || undefined,
    userWhatsapp: resolvedPhone || undefined,
    address: addressPayload ? mapAddress(addressPayload) : undefined,
  };
}

export function mapOrderItem(dbItem: Record<string, unknown>): OrderItem {
  return {
    id: dbItem.id as string,
    orderId: dbItem.order_id as string,
    productId: dbItem.product_id as string,
    productName: dbItem.product_name as string,
    quantity: dbItem.quantity as number,
    unitPrice: dbItem.unit_price as string,
    totalPrice: dbItem.total_price as string,
    isWizardItem: (dbItem.is_wizard_item as boolean | undefined) ?? false,
  };
}

export function mapUser(dbUser: Record<string, unknown>): User {
  return {
    id: dbUser.id as string,
    name: dbUser.name as string,
    whatsapp: dbUser.whatsapp as string,
    cpf: (dbUser.cpf as string | null) ?? null,
    role: dbUser.role as string,
    password: dbUser.password as string | null,
    isBlocked: dbUser.is_blocked as boolean,
    requiresPasswordChange: dbUser.requires_password_change as boolean,
    createdAt: dbUser.created_at as string,
  };
}

export function mapMotoboy(dbMotoboy: Record<string, unknown>): Motoboy {
  return {
    id: dbMotoboy.id as string,
    name: dbMotoboy.name as string,
    whatsapp: dbMotoboy.whatsapp as string,
    cpf: dbMotoboy.cpf as string | null,
    photoUrl: dbMotoboy.photo_url as string | null,
    isActive: dbMotoboy.is_active as boolean,
    isOnline: dbMotoboy.is_online as boolean,
    loggedInAt: dbMotoboy.logged_in_at as string | null,
    createdAt: dbMotoboy.created_at as string,
    currentLatitude: dbMotoboy.current_latitude as number | null,
    currentLongitude: dbMotoboy.current_longitude as number | null,
    locationUpdatedAt: dbMotoboy.location_updated_at as string | null,
    slotNumber: dbMotoboy.slot_number as number | null,
  };
}

export function mapBanner(dbBanner: Record<string, unknown>): Banner {
  return {
    id: dbBanner.id as string,
    title: dbBanner.title as string,
    description: dbBanner.description as string | null,
    imageUrl: dbBanner.image_url as string,
    linkUrl: dbBanner.link_url as string | null,
    sortOrder: dbBanner.sort_order as number,
    isActive: dbBanner.is_active as boolean,
    createdAt: dbBanner.created_at as string,
  };
}


export function mapSettings(dbSettings: Record<string, unknown>): Settings {
  return {
    id: dbSettings.id as string,
    storeAddress: dbSettings.store_address as string | null,
    storeLat: dbSettings.store_lat as string | null,
    storeLng: dbSettings.store_lng as string | null,
    deliveryRatePerKm: dbSettings.delivery_rate_per_km as string,
    minDeliveryFee: dbSettings.min_delivery_fee as string,
    maxDeliveryDistance: dbSettings.max_delivery_distance as string,
    pixKey: dbSettings.pix_key as string | null,
    openingHours: dbSettings.opening_hours as Record<string, unknown> | null,
    isOpen: dbSettings.is_open as boolean,
  };
}

export function mapAddress(dbAddress: Record<string, unknown>): Address {
  return {
    id: dbAddress.id as string,
    userId: dbAddress.user_id as string,
    street: dbAddress.street as string,
    number: dbAddress.number as string,
    complement: dbAddress.complement as string | null,
    neighborhood: dbAddress.neighborhood as string,
    city: dbAddress.city as string,
    state: dbAddress.state as string,
    zipCode: dbAddress.zip_code as string,
    notes: dbAddress.notes as string | null,
    isDefault: dbAddress.is_default as boolean,
    latitude: dbAddress.latitude as number | null,
    longitude: dbAddress.longitude as number | null,
  };
}
