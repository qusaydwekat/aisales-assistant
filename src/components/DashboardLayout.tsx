import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Bell, Search, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function DashboardLayout() {
  const [showNotifications, setShowNotifications] = useState(false);
  const { profile, signOut } = useAuth();
  const { t, dir } = useLanguage();
  const location = useLocation();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  const unreadCount = notifications.filter((n: any) => !n.read).length;
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full" dir={dir}>
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-background/80 backdrop-blur-md sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground hidden md:flex" />
              <span className="font-heading font-bold text-foreground md:hidden">AISales</span>
              <div className="hidden md:flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input type="text" placeholder={t("search")} className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-48" />
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {unreadCount}
                    </span>
                  )}
                </button>
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute end-0 mt-2 w-80 glass rounded-xl p-2 z-50"
                    >
                      <p className="px-3 py-2 text-sm font-heading font-semibold text-foreground">{t("notifications")}</p>
                      <div className="max-h-64 overflow-y-auto space-y-1">
                        {notifications.length === 0 && (
                          <p className="px-3 py-4 text-sm text-muted-foreground text-center">No notifications yet</p>
                        )}
                        {notifications.slice(0, 5).map((n: any) => (
                          <div key={n.id} className={`px-3 py-2 rounded-lg text-sm ${n.read ? 'text-muted-foreground' : 'text-foreground bg-muted/50'}`}>
                            <p className="font-medium">{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{n.description}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button
                onClick={signOut}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={t("sign_out")}
              >
                <LogOut className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
                  {initials}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto pb-16 md:pb-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="h-full"
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
