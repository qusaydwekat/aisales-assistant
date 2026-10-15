type OrderSummary = {
  conversation_id: string | null;
  store_id: string;
  status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
  created_at: string;
};

// Conversation lifecycle and order lifecycle are independent; display the latest
// linked order's status without changing whether the chat is open or resolved.
export function getConversationOrderStatus(
  conversation: { id: string; store_id: string; status: string },
  orders: readonly OrderSummary[],
) {
  if (conversation.status === "resolved") return "resolved";
  const latest = orders
    .filter(order => order.conversation_id === conversation.id && order.store_id === conversation.store_id)
    .reduce<OrderSummary | undefined>((current, order) =>
      !current || order.created_at > current.created_at ? order : current, undefined);
  return latest?.status ?? (conversation.status === "pending_order" ? "pending" : null);
}

export const conversationOrderLabels = {
  en: { pending: "Pending Order", confirmed: "Confirmed", processing: "Processing", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" },
  ar: { pending: "طلب قيد الانتظار", confirmed: "مؤكد", processing: "قيد التجهيز", shipped: "تم الشحن", delivered: "تم التسليم", cancelled: "ملغي" },
};