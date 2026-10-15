import { LayoutDashboard, MessageSquare, ShoppingCart, Package, Settings, Link2, BarChart3, Bot, Bell, Shield, Sparkles, TrendingUp } from "lucide-react";

export const navigationItems = [
  { key: "dashboard", url: "/dashboard", icon: LayoutDashboard, group: "workspace" },
  { key: "inbox", url: "/inbox", icon: MessageSquare, group: "workspace" },
  { key: "orders", url: "/orders", icon: ShoppingCart, group: "workspace" },
  { key: "products", url: "/products", icon: Package, group: "workspace" },
  { key: "catalog_tools", url: "/catalog-tools", icon: Sparkles, group: "workspace" },
  { key: "reports", url: "/reports", icon: BarChart3, group: "manage" },
  { key: "growth", url: "/growth", icon: TrendingUp, group: "manage" },
  { key: "platforms", url: "/platforms", icon: Link2, group: "manage" },
  { key: "ai_settings", url: "/ai-settings", icon: Bot, group: "manage" },
  { key: "store_settings", url: "/store-settings", icon: Settings, group: "manage" },
  { key: "notifications", url: "/notifications", icon: Bell, group: "manage" },
];

export const adminNavigationItem = { key: "admin", url: "/admin", icon: Shield, group: "manage" };