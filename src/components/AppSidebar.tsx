import { Button } from "@/components/ui/button";
import { navigationItems, adminNavigationItem } from "./navigation-items";
import { 
  LayoutDashboard, MessageSquare, ShoppingCart, Package, Settings, 
  Link2, BarChart3, Bot, Bell, Zap, Globe, Shield, Sparkles, TrendingUp
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUnreadConversationCount, useUnreadNotificationCount } from "@/hooks/useSupabaseData";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { store, profile, role } = useAuth();
  const { t, language, setLanguage, dir } = useLanguage();
  const { data: unreadInbox = 0 } = useUnreadConversationCount();
  const { data: unreadNotifs = 0 } = useUnreadNotificationCount();

  const badgeMap: Record<string, number> = {
    inbox: unreadInbox,
    notifications: unreadNotifs,
  };

  const allNavKeys = [
    ...navigationItems,
    ...(role === 'admin' ? [adminNavigationItem] : []),
  ];

  return (
    <Sidebar side={dir === "rtl" ? "right" : "left"} collapsible="icon" className="border-e border-border bg-sidebar">
      <SidebarHeader className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-heading text-lg font-bold text-foreground">
              AISales
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/60 text-xs uppercase tracking-wider">
            {!collapsed && t("menu")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {allNavKeys.map((item) => {
                const isActive = location.pathname === item.url;
                const badge = badgeMap[item.key] || 0;
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={t(item.key)} className="h-11">
                      <NavLink
                        to={item.url}
                        end
                        className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                          isActive
                            ? "bg-primary/15 text-foreground font-medium before:absolute before:start-0 before:top-3 before:bottom-3 before:w-0.5 before:rounded-full before:bg-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        activeClassName=""
                      >
                        <div className="relative shrink-0">
                          <item.icon className="h-4 w-4" />
                          {badge > 0 && (
                            <span className="absolute -top-1.5 -end-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </div>
                        {!collapsed && <span>{t(item.key)}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        {!collapsed && (
          <Button variant="ghost"
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Globe className="h-4 w-4" />
            <span>{language === "en" ? "العربية" : "English"}</span>
          </Button>
        )}
        {collapsed && (
          <Button variant="ghost"
            onClick={() => setLanguage(language === "en" ? "ar" : "en")}
            className="flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={language === "en" ? "العربية" : "English"}
          >
            <Globe className="h-4 w-4" />
          </Button>
        )}

        {!collapsed && (
          <div className="border-t border-sidebar-border pt-4 px-1">
            <p className="text-xs text-muted-foreground">{t("store")}</p>
            <p className="text-sm font-medium text-foreground truncate">{store?.name || t('no_store')}</p>
            <p className={`text-xs mt-1 ${profile?.status === 'active' ? 'text-success' : 'text-warning'}`}>
              ● {t(profile?.status || 'pending')}
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
