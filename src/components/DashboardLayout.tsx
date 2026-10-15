import { Outlet, useLocation, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BrandLogo } from "@/components/BrandLogo";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Bell, LogOut, Globe, Zap } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useUnreadNotificationCount, useNotifications } from "@/hooks/useSupabaseData";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { NavigationSearch } from "@/components/NavigationSearch";
import { navigationItems, adminNavigationItem } from "@/components/navigation-items";

export default function DashboardLayout() {
  const [showNotifications, setShowNotifications] = useState(false);
  const { profile, store, signOut } = useAuth();
  const { t, dir, language, setLanguage } = useLanguage();
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { data: notifications = [] } = useNotifications();
  const currentPage = [...navigationItems, adminNavigationItem].find(item => item.url === location.pathname);
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <SidebarProvider>
      <div className="min-h-dvh flex w-full" dir={dir}>
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 shrink-0 flex items-center justify-between gap-2 border-b border-border px-4 md:px-6 bg-background/95 backdrop-blur-xl sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground hidden md:flex" />
              <Link to="/dashboard" className="flex items-center md:hidden"><BrandLogo /></Link>
              <span className="hidden lg:block text-sm text-muted-foreground">{store?.name || (currentPage ? t(currentPage.key) : "AISales")}</span>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <NavigationSearch />
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={language === "en" ? "العربية" : "English"} onClick={() => setLanguage(language === "en" ? "ar" : "en")} className="text-muted-foreground"><Globe className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>{language === "en" ? "العربية" : "English"}</TooltipContent></Tooltip>
              <Popover open={showNotifications} onOpenChange={setShowNotifications}>
                <PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label={t("notifications")} className="relative text-muted-foreground">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Button></PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-4" dir={dir}>
                  <p className="font-heading font-semibold mb-3">{t("notifications")}</p>
                  <p className="text-sm text-muted-foreground mb-4">{unreadCount > 0 ? `${unreadCount} ${t("notifications")}` : t("no_notifications")}</p>
                  <div className="max-h-64 overflow-y-auto mb-3 space-y-1">
                    {notifications.slice(0, 5).map(n => <div key={n.id} className={`p-2 rounded-md ${n.read ? "text-muted-foreground" : "bg-muted/50 text-foreground"}`}><p className="text-sm font-medium">{n.title}</p><p className="text-xs text-muted-foreground mt-1">{n.description}</p></div>)}
                  </div>
                  <Button asChild variant="outline" className="w-full"><Link to="/notifications" onClick={() => setShowNotifications(false)}>{t("notifications")}</Link></Button>
                </PopoverContent>
              </Popover>
              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={signOut} className="hidden sm:flex text-muted-foreground" aria-label={t("sign_out")}>
                <LogOut className="h-4 w-4" />
              </Button></TooltipTrigger><TooltipContent>{t("sign_out")}</TooltipContent></Tooltip>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
                  {initials}
                </div>
              </div>
            </div>
          </header>

          <main className="workspace-main flex-1 min-w-0 pb-20 md:pb-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.16 }}
                className="page-transition h-full min-w-0"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>

          <MobileBottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
}
