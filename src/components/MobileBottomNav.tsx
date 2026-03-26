import { LayoutDashboard, MessageSquare, ShoppingCart, Package, Settings, MoreHorizontal } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";

const mobileNavItems = [
  { key: "dashboard", url: "/dashboard", icon: LayoutDashboard },
  { key: "inbox", url: "/inbox", icon: MessageSquare },
  { key: "orders", url: "/orders", icon: ShoppingCart },
  { key: "products", url: "/products", icon: Package },
  { key: "store_settings", url: "/store-settings", icon: MoreHorizontal },
];

export function MobileBottomNav() {
  const location = useLocation();
  const { t } = useLanguage();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-background/90 backdrop-blur-md border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {mobileNavItems.map(item => {
          const isActive = location.pathname === item.url || 
            (item.key === "store_settings" && ["/store-settings", "/platforms", "/reports", "/ai-settings", "/notifications"].includes(location.pathname));
          return (
            <NavLink key={item.key} to={item.url} className="flex flex-col items-center gap-0.5 py-1 px-3 min-w-[56px] relative">
              {isActive && (
                <motion.div
                  layoutId="mobile-nav-indicator"
                  className="absolute -top-0.5 w-8 h-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-[10px] ${isActive ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {t(item.key)}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
