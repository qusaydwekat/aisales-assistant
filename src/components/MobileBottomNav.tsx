import { LayoutDashboard, MessageSquare, ShoppingCart, Package, MoreHorizontal } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUnreadConversationCount } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { Globe, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { navigationItems, adminNavigationItem } from "./navigation-items";

const mobileNavItems = [
  { key: "dashboard", url: "/dashboard", icon: LayoutDashboard },
  { key: "inbox", url: "/inbox", icon: MessageSquare },
  { key: "orders", url: "/orders", icon: ShoppingCart },
  { key: "products", url: "/products", icon: Package },
];

export function MobileBottomNav() {
  const location = useLocation();
  const { t, dir, language, setLanguage } = useLanguage();
  const { role, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const moreItems = role === "admin" ? [...navigationItems.slice(4), adminNavigationItem] : navigationItems.slice(4);
  const { data: unreadInbox = 0 } = useUnreadConversationCount();

  return (
    <><nav aria-label={t("menu")} className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-background/95 backdrop-blur-xl border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {mobileNavItems.map(item => {
          const isActive = location.pathname === item.url || 
            (item.key === "store_settings" && ["/store-settings", "/platforms", "/reports", "/ai-settings", "/notifications"].includes(location.pathname));
          const badge = item.key === "inbox" ? unreadInbox : 0;
          return (
            <NavLink key={item.key} to={item.url} className="flex flex-col items-center gap-0.5 py-1 px-3 min-w-[56px] relative">
              {isActive && (
                <motion.div
                  layoutId="mobile-nav-indicator"
                  className="absolute -top-0.5 w-8 h-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <div className="relative">
                <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -end-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] ${isActive ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {t(item.key)}
              </span>
            </NavLink>
          );
        })}
        <Button variant="ghost" onClick={() => setOpen(true)} aria-label={t("menu")} className={`h-14 min-w-[56px] px-2 flex flex-col gap-0.5 ${moreItems.some(item => item.url === location.pathname) ? "text-primary" : "text-muted-foreground"}`}>
          <MoreHorizontal className="h-5 w-5" /><span className="text-[10px]">{t("menu")}</span>
        </Button>
      </div>
    </nav>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="rounded-t-lg max-h-[85dvh] overflow-y-auto pb-8" dir={dir} aria-describedby={undefined}>
        <SheetHeader><SheetTitle>{t("menu")}</SheetTitle></SheetHeader>
        <div className="grid grid-cols-2 gap-2 mt-5">
          {moreItems.map(item => <Button key={item.key} asChild variant="ghost" className={`h-auto min-h-14 justify-start whitespace-normal text-start gap-3 ${location.pathname === item.url ? "bg-primary/10 text-primary" : "text-foreground"}`}><NavLink to={item.url} onClick={() => setOpen(false)}><item.icon className="h-5 w-5 shrink-0" /><span>{t(item.key)}</span></NavLink></Button>)}
        </div>
        <div className="border-t border-border mt-5 pt-4 flex justify-between gap-2">
          <Button variant="ghost" onClick={() => setLanguage(language === "en" ? "ar" : "en")}><Globe />{language === "en" ? "العربية" : "English"}</Button>
          <Button variant="ghost" onClick={() => { setOpen(false); void signOut(); }}><LogOut />{t("sign_out")}</Button>
        </div>
      </SheetContent>
    </Sheet></>
  );
}
