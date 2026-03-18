// ============ TYPES ============
export type Platform = 'facebook' | 'instagram' | 'whatsapp';
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type ConversationStatus = 'open' | 'resolved' | 'pending_order';
export type UserStatus = 'pending' | 'active' | 'suspended';

export interface Product {
  id: string;
  storeId: string;
  name: string;
  description: string;
  category: string;
  price: number;
  comparePrice?: number;
  images: string[];
  stock: number;
  sku: string;
  variants: { type: string; value: string }[];
  active: boolean;
}

export interface Order {
  id: string;
  storeId: string;
  conversationId?: string;
  customerName: string;
  phone: string;
  address: string;
  items: { productId: string; name: string; quantity: number; price: number; image: string }[];
  total: number;
  status: OrderStatus;
  platform: Platform;
  createdAt: string;
  notes?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: 'customer' | 'ai' | 'owner';
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  storeId: string;
  platform: Platform;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  status: ConversationStatus;
  lastMessage: string;
  lastMessageTime: string;
  unread: boolean;
  messages: Message[];
}

export interface StoreOwner {
  id: string;
  name: string;
  email: string;
  storeName: string;
  status: UserStatus;
  signupDate: string;
  platforms: Platform[];
  orderCount: number;
  productCount: number;
}

export interface Notification {
  id: string;
  type: 'message' | 'order' | 'escalation' | 'platform' | 'approval';
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
}

// ============ PRODUCTS ============
export const products: Product[] = [
  { id: 'p1', storeId: 's1', name: 'Classic White Sneakers', description: 'Premium leather sneakers with cushioned sole', category: 'Footwear', price: 89.99, comparePrice: 129.99, images: ['/placeholder.svg'], stock: 45, sku: 'SNK-001', variants: [{ type: 'size', value: '40' }, { type: 'size', value: '42' }, { type: 'color', value: 'White' }], active: true },
  { id: 'p2', storeId: 's1', name: 'Midnight Bomber Jacket', description: 'Water-resistant bomber with satin lining', category: 'Outerwear', price: 149.99, images: ['/placeholder.svg'], stock: 12, sku: 'JKT-002', variants: [{ type: 'size', value: 'M' }, { type: 'size', value: 'L' }, { type: 'color', value: 'Black' }], active: true },
  { id: 'p3', storeId: 's1', name: 'Organic Cotton Tee', description: 'Soft organic cotton crew neck', category: 'Tops', price: 34.99, images: ['/placeholder.svg'], stock: 120, sku: 'TEE-003', variants: [{ type: 'size', value: 'S' }, { type: 'size', value: 'M' }, { type: 'size', value: 'L' }], active: true },
  { id: 'p4', storeId: 's1', name: 'Slim Fit Chinos', description: 'Stretch cotton chinos with tapered leg', category: 'Bottoms', price: 59.99, images: ['/placeholder.svg'], stock: 3, sku: 'CHN-004', variants: [{ type: 'size', value: '30' }, { type: 'size', value: '32' }, { type: 'color', value: 'Khaki' }], active: true },
  { id: 'p5', storeId: 's1', name: 'Leather Crossbody Bag', description: 'Genuine leather with adjustable strap', category: 'Accessories', price: 79.99, images: ['/placeholder.svg'], stock: 28, sku: 'BAG-005', variants: [{ type: 'color', value: 'Brown' }, { type: 'color', value: 'Black' }], active: true },
  { id: 'p6', storeId: 's1', name: 'Aviator Sunglasses', description: 'Polarized UV400 metal frame', category: 'Accessories', price: 45.99, comparePrice: 69.99, images: ['/placeholder.svg'], stock: 67, sku: 'SNG-006', variants: [{ type: 'color', value: 'Gold' }, { type: 'color', value: 'Silver' }], active: true },
  { id: 'p7', storeId: 's1', name: 'Wool Blend Scarf', description: 'Soft wool blend with fringe detail', category: 'Accessories', price: 29.99, images: ['/placeholder.svg'], stock: 0, sku: 'SCF-007', variants: [{ type: 'color', value: 'Gray' }], active: false },
  { id: 'p8', storeId: 's1', name: 'Denim Trucker Jacket', description: 'Washed denim with sherpa collar', category: 'Outerwear', price: 119.99, images: ['/placeholder.svg'], stock: 18, sku: 'JKT-008', variants: [{ type: 'size', value: 'M' }, { type: 'size', value: 'L' }, { type: 'size', value: 'XL' }], active: true },
  { id: 'p9', storeId: 's1', name: 'Canvas Belt', description: 'Military style canvas belt', category: 'Accessories', price: 19.99, images: ['/placeholder.svg'], stock: 89, sku: 'BLT-009', variants: [{ type: 'color', value: 'Olive' }, { type: 'color', value: 'Navy' }], active: true },
  { id: 'p10', storeId: 's1', name: 'Performance Running Shoes', description: 'Lightweight mesh with foam cushioning', category: 'Footwear', price: 109.99, comparePrice: 149.99, images: ['/placeholder.svg'], stock: 7, sku: 'SNK-010', variants: [{ type: 'size', value: '41' }, { type: 'size', value: '43' }, { type: 'color', value: 'Blue' }], active: true },
];

// ============ ORDERS ============
export const orders: Order[] = [
  { id: 'ORD-001', storeId: 's1', conversationId: 'c1', customerName: 'Ahmed Hassan', phone: '+201012345678', address: '15 Nile St, Cairo, Egypt', items: [{ productId: 'p1', name: 'Classic White Sneakers', quantity: 1, price: 89.99, image: '/placeholder.svg' }], total: 89.99, status: 'delivered', platform: 'whatsapp', createdAt: '2026-03-15T10:30:00Z' },
  { id: 'ORD-002', storeId: 's1', conversationId: 'c2', customerName: 'Sara Ali', phone: '+201098765432', address: '8 Garden City, Cairo', items: [{ productId: 'p2', name: 'Midnight Bomber Jacket', quantity: 1, price: 149.99, image: '/placeholder.svg' }, { productId: 'p3', name: 'Organic Cotton Tee', quantity: 2, price: 34.99, image: '/placeholder.svg' }], total: 219.97, status: 'shipped', platform: 'instagram', createdAt: '2026-03-16T14:20:00Z' },
  { id: 'ORD-003', storeId: 's1', customerName: 'Mohamed Khaled', phone: '+201155566677', address: '22 Maadi, Cairo', items: [{ productId: 'p5', name: 'Leather Crossbody Bag', quantity: 1, price: 79.99, image: '/placeholder.svg' }], total: 79.99, status: 'pending', platform: 'facebook', createdAt: '2026-03-17T09:15:00Z' },
  { id: 'ORD-004', storeId: 's1', customerName: 'Nour Ibrahim', phone: '+201234567890', address: '5 Zamalek, Cairo', items: [{ productId: 'p6', name: 'Aviator Sunglasses', quantity: 1, price: 45.99, image: '/placeholder.svg' }, { productId: 'p9', name: 'Canvas Belt', quantity: 1, price: 19.99, image: '/placeholder.svg' }], total: 65.98, status: 'confirmed', platform: 'whatsapp', createdAt: '2026-03-17T11:45:00Z' },
  { id: 'ORD-005', storeId: 's1', customerName: 'Layla Mansour', phone: '+201187654321', address: '10 Heliopolis, Cairo', items: [{ productId: 'p10', name: 'Performance Running Shoes', quantity: 1, price: 109.99, image: '/placeholder.svg' }], total: 109.99, status: 'processing', platform: 'instagram', createdAt: '2026-03-17T16:00:00Z' },
  { id: 'ORD-006', storeId: 's1', customerName: 'Omar Farouk', phone: '+201099887766', address: '3 Mohandessin, Giza', items: [{ productId: 'p4', name: 'Slim Fit Chinos', quantity: 2, price: 59.99, image: '/placeholder.svg' }], total: 119.98, status: 'pending', platform: 'facebook', createdAt: '2026-03-18T08:00:00Z' },
  { id: 'ORD-007', storeId: 's1', conversationId: 'c5', customerName: 'Yasmin Tawfik', phone: '+201177788899', address: '7 Dokki, Giza', items: [{ productId: 'p8', name: 'Denim Trucker Jacket', quantity: 1, price: 119.99, image: '/placeholder.svg' }], total: 119.99, status: 'cancelled', platform: 'whatsapp', createdAt: '2026-03-14T13:30:00Z' },
  { id: 'ORD-008', storeId: 's1', customerName: 'Karim Nabil', phone: '+201066655544', address: '18 Nasr City, Cairo', items: [{ productId: 'p3', name: 'Organic Cotton Tee', quantity: 3, price: 34.99, image: '/placeholder.svg' }], total: 104.97, status: 'delivered', platform: 'whatsapp', createdAt: '2026-03-12T10:00:00Z' },
  { id: 'ORD-009', storeId: 's1', customerName: 'Dina Samir', phone: '+201144433322', address: '12 October City', items: [{ productId: 'p1', name: 'Classic White Sneakers', quantity: 1, price: 89.99, image: '/placeholder.svg' }, { productId: 'p6', name: 'Aviator Sunglasses', quantity: 1, price: 45.99, image: '/placeholder.svg' }], total: 135.98, status: 'shipped', platform: 'instagram', createdAt: '2026-03-13T15:20:00Z' },
  { id: 'ORD-010', storeId: 's1', customerName: 'Tarek Adel', phone: '+201033322211', address: '9 New Cairo', items: [{ productId: 'p2', name: 'Midnight Bomber Jacket', quantity: 1, price: 149.99, image: '/placeholder.svg' }], total: 149.99, status: 'confirmed', platform: 'facebook', createdAt: '2026-03-18T07:30:00Z' },
];

// ============ CONVERSATIONS ============
export const conversations: Conversation[] = [
  {
    id: 'c1', storeId: 's1', platform: 'whatsapp', customerName: 'Ahmed Hassan', customerPhone: '+201012345678', customerAddress: '15 Nile St, Cairo', status: 'resolved', lastMessage: 'Thank you! Order received 🎉', lastMessageTime: '2026-03-18T09:30:00Z', unread: false,
    messages: [
      { id: 'm1', conversationId: 'c1', sender: 'customer', content: 'Hi, do you have white sneakers in size 42?', timestamp: '2026-03-15T10:00:00Z' },
      { id: 'm2', conversationId: 'c1', sender: 'ai', content: 'Hello Ahmed! Yes, we have the Classic White Sneakers available in size 42. They\'re priced at $89.99 (was $129.99). Would you like to place an order?', timestamp: '2026-03-15T10:00:05Z' },
      { id: 'm3', conversationId: 'c1', sender: 'customer', content: 'Yes please! I want to order one pair', timestamp: '2026-03-15T10:05:00Z' },
      { id: 'm4', conversationId: 'c1', sender: 'ai', content: 'Great choice! I\'ll need your delivery address to complete the order. Could you share it?', timestamp: '2026-03-15T10:05:04Z' },
      { id: 'm5', conversationId: 'c1', sender: 'customer', content: '15 Nile St, Cairo, Egypt', timestamp: '2026-03-15T10:08:00Z' },
      { id: 'm6', conversationId: 'c1', sender: 'ai', content: '✅ Order confirmed!\n\n📦 Classic White Sneakers (Size 42) × 1\n💰 Total: $89.99\n📍 Delivery: 15 Nile St, Cairo\n\nYou\'ll receive updates on your order status. Thank you for shopping with us!', timestamp: '2026-03-15T10:08:06Z' },
      { id: 'm7', conversationId: 'c1', sender: 'customer', content: 'Thank you! Order received 🎉', timestamp: '2026-03-18T09:30:00Z' },
    ]
  },
  {
    id: 'c2', storeId: 's1', platform: 'instagram', customerName: 'Sara Ali', customerPhone: '+201098765432', status: 'open', lastMessage: 'When will my order arrive?', lastMessageTime: '2026-03-18T10:15:00Z', unread: true,
    messages: [
      { id: 'm8', conversationId: 'c2', sender: 'customer', content: 'Hi! I love the bomber jacket. Is it available in medium?', timestamp: '2026-03-16T14:00:00Z' },
      { id: 'm9', conversationId: 'c2', sender: 'ai', content: 'Hey Sara! 🖤 Yes, our Midnight Bomber Jacket is available in Medium. It\'s $149.99 and features water-resistant material with a satin lining. Want me to add it to your order?', timestamp: '2026-03-16T14:00:06Z' },
      { id: 'm10', conversationId: 'c2', sender: 'customer', content: 'Yes! Also add 2 organic cotton tees in size M', timestamp: '2026-03-16T14:05:00Z' },
      { id: 'm11', conversationId: 'c2', sender: 'ai', content: 'Added! Here\'s your order summary:\n\n🧥 Midnight Bomber Jacket (M) × 1 — $149.99\n👕 Organic Cotton Tee (M) × 2 — $69.98\n💰 Total: $219.97\n\nShall I confirm this order?', timestamp: '2026-03-16T14:05:05Z' },
      { id: 'm12', conversationId: 'c2', sender: 'customer', content: 'When will my order arrive?', timestamp: '2026-03-18T10:15:00Z' },
    ]
  },
  {
    id: 'c3', storeId: 's1', platform: 'facebook', customerName: 'Mohamed Khaled', customerPhone: '+201155566677', status: 'pending_order', lastMessage: 'I\'d like to order the crossbody bag', lastMessageTime: '2026-03-17T09:10:00Z', unread: true,
    messages: [
      { id: 'm13', conversationId: 'c3', sender: 'customer', content: 'Hello, what bags do you have?', timestamp: '2026-03-17T09:00:00Z' },
      { id: 'm14', conversationId: 'c3', sender: 'ai', content: 'Hi Mohamed! We have our beautiful Leather Crossbody Bag available in Brown and Black. It\'s genuine leather with an adjustable strap, priced at $79.99. Which color interests you?', timestamp: '2026-03-17T09:00:05Z' },
      { id: 'm15', conversationId: 'c3', sender: 'customer', content: 'I\'d like to order the crossbody bag', timestamp: '2026-03-17T09:10:00Z' },
    ]
  },
  {
    id: 'c4', storeId: 's1', platform: 'whatsapp', customerName: 'Nour Ibrahim', customerPhone: '+201234567890', status: 'open', lastMessage: 'Can I return the sunglasses if they don\'t fit?', lastMessageTime: '2026-03-18T11:00:00Z', unread: true,
    messages: [
      { id: 'm16', conversationId: 'c4', sender: 'customer', content: 'What\'s your return policy?', timestamp: '2026-03-17T11:30:00Z' },
      { id: 'm17', conversationId: 'c4', sender: 'ai', content: 'Hi Nour! We offer a 14-day return policy on all unused items with original tags. Simply reach out and we\'ll arrange the return. Is there anything specific you\'d like to know?', timestamp: '2026-03-17T11:30:04Z' },
      { id: 'm18', conversationId: 'c4', sender: 'customer', content: 'Can I return the sunglasses if they don\'t fit?', timestamp: '2026-03-18T11:00:00Z' },
    ]
  },
  {
    id: 'c5', storeId: 's1', platform: 'whatsapp', customerName: 'Yasmin Tawfik', customerPhone: '+201177788899', status: 'resolved', lastMessage: 'OK, cancel the order then', lastMessageTime: '2026-03-14T14:00:00Z', unread: false,
    messages: [
      { id: 'm19', conversationId: 'c5', sender: 'customer', content: 'I want to cancel my jacket order', timestamp: '2026-03-14T13:30:00Z' },
      { id: 'm20', conversationId: 'c5', sender: 'ai', content: 'I\'m sorry to hear that, Yasmin. I can help with the cancellation. May I ask the reason? We might be able to help.', timestamp: '2026-03-14T13:30:05Z' },
      { id: 'm21', conversationId: 'c5', sender: 'customer', content: 'Found it cheaper elsewhere', timestamp: '2026-03-14T13:35:00Z' },
      { id: 'm22', conversationId: 'c5', sender: 'owner', content: 'Hi Yasmin, I understand. We\'ve cancelled your order and you\'ll receive a full refund. We\'d love to have you back!', timestamp: '2026-03-14T13:40:00Z' },
      { id: 'm23', conversationId: 'c5', sender: 'customer', content: 'OK, cancel the order then', timestamp: '2026-03-14T14:00:00Z' },
    ]
  },
  {
    id: 'c6', storeId: 's1', platform: 'instagram', customerName: 'Layla Mansour', customerPhone: '+201187654321', status: 'open', lastMessage: 'Do you have these in blue?', lastMessageTime: '2026-03-18T08:45:00Z', unread: false,
    messages: [
      { id: 'm24', conversationId: 'c6', sender: 'customer', content: 'Hi! Those running shoes look amazing 😍', timestamp: '2026-03-17T15:30:00Z' },
      { id: 'm25', conversationId: 'c6', sender: 'ai', content: 'Thank you Layla! Our Performance Running Shoes are one of our bestsellers! They\'re lightweight with foam cushioning, currently on sale at $109.99 (was $149.99). Available in sizes 41 and 43 in Blue. 💙', timestamp: '2026-03-17T15:30:06Z' },
      { id: 'm26', conversationId: 'c6', sender: 'customer', content: 'Do you have these in blue?', timestamp: '2026-03-18T08:45:00Z' },
    ]
  },
  {
    id: 'c7', storeId: 's1', platform: 'facebook', customerName: 'Omar Farouk', customerPhone: '+201099887766', status: 'pending_order', lastMessage: 'I\'ll take 2 pairs of chinos in khaki', lastMessageTime: '2026-03-18T08:05:00Z', unread: true,
    messages: [
      { id: 'm27', conversationId: 'c7', sender: 'customer', content: 'Do you have chinos?', timestamp: '2026-03-18T07:50:00Z' },
      { id: 'm28', conversationId: 'c7', sender: 'ai', content: 'Yes Omar! We have Slim Fit Chinos in Khaki color, available in sizes 30 and 32. They\'re $59.99 each. Would you like to order?', timestamp: '2026-03-18T07:50:05Z' },
      { id: 'm29', conversationId: 'c7', sender: 'customer', content: 'I\'ll take 2 pairs of chinos in khaki', timestamp: '2026-03-18T08:05:00Z' },
    ]
  },
];

// ============ NOTIFICATIONS ============
export const notifications: Notification[] = [
  { id: 'n1', type: 'order', title: 'New Order', description: 'Ahmed Hassan placed order ORD-001 via WhatsApp', read: true, createdAt: '2026-03-15T10:30:00Z' },
  { id: 'n2', type: 'message', title: 'New Message', description: 'Sara Ali sent a message on Instagram', read: false, createdAt: '2026-03-18T10:15:00Z' },
  { id: 'n3', type: 'escalation', title: 'AI Escalation', description: 'Conversation with Mohamed Khaled needs attention', read: false, createdAt: '2026-03-17T09:15:00Z' },
  { id: 'n4', type: 'order', title: 'New Order', description: 'Tarek Adel placed order ORD-010 via Facebook', read: false, createdAt: '2026-03-18T07:30:00Z' },
  { id: 'n5', type: 'platform', title: 'Platform Update', description: 'WhatsApp connection verified successfully', read: true, createdAt: '2026-03-14T08:00:00Z' },
  { id: 'n6', type: 'order', title: 'Order Shipped', description: 'Order ORD-009 has been shipped to Dina Samir', read: true, createdAt: '2026-03-16T12:00:00Z' },
];

// ============ STORE OWNERS (Admin view) ============
export const storeOwners: StoreOwner[] = [
  { id: 's1', name: 'Youssef Mahmoud', email: 'youssef@urbanstyle.com', storeName: 'Urban Style Co.', status: 'active', signupDate: '2026-02-01', platforms: ['facebook', 'instagram', 'whatsapp'], orderCount: 156, productCount: 10 },
  { id: 's2', name: 'Fatma El-Sayed', email: 'fatma@luxebeauty.com', storeName: 'Luxe Beauty', status: 'pending', signupDate: '2026-03-17', platforms: [], orderCount: 0, productCount: 5 },
];

// ============ CHART DATA ============
export const messagesOverTime = [
  { date: 'Mar 12', facebook: 8, instagram: 12, whatsapp: 25 },
  { date: 'Mar 13', facebook: 10, instagram: 15, whatsapp: 30 },
  { date: 'Mar 14', facebook: 6, instagram: 18, whatsapp: 22 },
  { date: 'Mar 15', facebook: 12, instagram: 20, whatsapp: 35 },
  { date: 'Mar 16', facebook: 9, instagram: 14, whatsapp: 28 },
  { date: 'Mar 17', facebook: 15, instagram: 22, whatsapp: 40 },
  { date: 'Mar 18', facebook: 11, instagram: 16, whatsapp: 32 },
];

export const ordersPerDay = [
  { date: 'Mar 12', orders: 3 },
  { date: 'Mar 13', orders: 5 },
  { date: 'Mar 14', orders: 2 },
  { date: 'Mar 15', orders: 7 },
  { date: 'Mar 16', orders: 4 },
  { date: 'Mar 17', orders: 6 },
  { date: 'Mar 18', orders: 8 },
];

// ============ HELPERS ============
export const platformColors: Record<Platform, string> = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  whatsapp: '#25D366',
};

export const platformLabels: Record<Platform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
};

export const orderStatusColors: Record<OrderStatus, string> = {
  pending: 'bg-warning/20 text-warning',
  confirmed: 'bg-primary/20 text-primary',
  processing: 'bg-info/20 text-info',
  shipped: 'bg-accent/20 text-accent',
  delivered: 'bg-success/20 text-success',
  cancelled: 'bg-destructive/20 text-destructive',
};
