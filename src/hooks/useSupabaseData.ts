import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ============ PRODUCTS ============
export function useProducts() {
  const { store } = useAuth();
  return useQuery({
    queryKey: ["products", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  const { store } = useAuth();
  return useMutation({
    mutationFn: async (product: {
      name: string; description?: string; category?: string; price: number;
      compare_price?: number; stock: number; sku?: string; images?: string[];
      variants?: any; active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("products")
        .insert({ ...product, store_id: store!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("products").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ============ ORDERS ============
export function useOrders() {
  const { store } = useAuth();
  return useQuery({
    queryKey: ["orders", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  const { store } = useAuth();
  return useMutation({
    mutationFn: async (order: {
      customer_name: string; phone?: string; address?: string;
      items: any; total: number; platform?: string; notes?: string;
      conversation_id?: string;
    }) => {
      const { data, error } = await supabase
        .from("orders")
        .insert({ ...order, store_id: store!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order created");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ============ CONVERSATIONS & MESSAGES ============
export function useConversations() {
  const { store } = useAuth();
  return useQuery({
    queryKey: ["conversations", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("store_id", store!.id)
        .order("last_message_time", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (msg: { conversation_id: string; sender: string; content: string }) => {
      const { error } = await supabase.from("messages").insert(msg);
      if (error) throw error;
      // Also update conversation's last_message
      await supabase.from("conversations").update({
        last_message: msg.content,
        last_message_time: new Date().toISOString(),
        unread: false,
      }).eq("id", msg.conversation_id);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["messages", vars.conversation_id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateConversationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("conversations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ============ STORE SETTINGS ============
export function useStore() {
  const { store } = useAuth();
  return useQuery({
    queryKey: ["store", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("id", store!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("stores").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store"] });
      toast.success("Store settings saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ============ AI SETTINGS ============
export function useAISettings() {
  const { store } = useAuth();
  return useQuery({
    queryKey: ["ai_settings", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_settings")
        .select("*")
        .eq("store_id", store!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertAISettings() {
  const qc = useQueryClient();
  const { store } = useAuth();
  return useMutation({
    mutationFn: async (settings: any) => {
      // Try update first, then insert
      const { data: existing } = await supabase
        .from("ai_settings")
        .select("id")
        .eq("store_id", store!.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("ai_settings")
          .update(settings)
          .eq("store_id", store!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ai_settings")
          .insert({ ...settings, store_id: store!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai_settings"] });
      toast.success("AI settings saved");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ============ PLATFORM CONNECTIONS ============
export function usePlatformConnections() {
  const { store } = useAuth();
  return useQuery({
    queryKey: ["platform_connections", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_connections")
        .select("*")
        .eq("store_id", store!.id);
      if (error) throw error;
      return data;
    },
  });
}

// ============ NOTIFICATIONS ============
export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// ============ DASHBOARD AGGREGATES ============
export function useDashboardStats() {
  const { store } = useAuth();
  return useQuery({
    queryKey: ["dashboard_stats", store?.id],
    enabled: !!store?.id,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      const [convRes, ordersRes, revenueRes, platformRes] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact" })
          .eq("store_id", store!.id).gte("last_message_time", today.toISOString()),
        supabase.from("orders").select("id, status, total, created_at")
          .eq("store_id", store!.id),
        supabase.from("orders").select("total")
          .eq("store_id", store!.id).gte("created_at", monthStart.toISOString()),
        supabase.from("platform_connections").select("*")
          .eq("store_id", store!.id),
      ]);

      const allOrders = ordersRes.data || [];
      const pendingOrders = allOrders.filter(o => o.status === "pending").length;
      const newOrders = allOrders.filter(o => {
        const d = new Date(o.created_at);
        return d >= today;
      }).length;
      const monthRevenue = (revenueRes.data || []).reduce((s, o) => s + Number(o.total), 0);

      return {
        messagesToday: convRes.count || 0,
        newOrders,
        pendingOrders,
        monthRevenue,
        platforms: platformRes.data || [],
        recentOrders: allOrders.slice(0, 5),
      };
    },
  });
}

// ============ ADMIN: ALL USERS ============
export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, user_roles(role)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminStores() {
  return useQuery({
    queryKey: ["admin_stores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("*");
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminUpdateUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      const { error } = await supabase.from("profiles").update({ status }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_users"] });
      toast.success("User status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin_stats"],
    queryFn: async () => {
      const [users, orders, conversations, products] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact" }),
        supabase.from("orders").select("id, total", { count: "exact" }),
        supabase.from("conversations").select("id", { count: "exact" }),
        supabase.from("products").select("id", { count: "exact" }),
      ]);
      const totalRevenue = (orders.data || []).reduce((s, o) => s + Number(o.total), 0);
      return {
        totalUsers: users.count || 0,
        totalOrders: orders.count || 0,
        totalConversations: conversations.count || 0,
        totalProducts: products.count || 0,
        totalRevenue,
      };
    },
  });
}
