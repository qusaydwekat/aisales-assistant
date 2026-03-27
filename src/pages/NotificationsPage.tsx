import { ShoppingCart, MessageSquare, AlertTriangle, Link2, UserCheck, Loader2, CheckCheck } from "lucide-react";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/useSupabaseData";

const iconMap: Record<string, typeof MessageSquare> = {
  message: MessageSquare, order: ShoppingCart, escalation: AlertTriangle, platform: Link2, approval: UserCheck,
};
const colorMap: Record<string, string> = {
  message: 'text-primary', order: 'text-success', escalation: 'text-warning', platform: 'text-accent', approval: 'text-info',
};

export default function NotificationsPage() {
  const { data: notifications = [], isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const unreadCount = notifications.filter(n => !n.read).length;

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-muted-foreground">No notifications yet.</div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const Icon = iconMap[n.type] || MessageSquare;
            return (
              <div key={n.id}
                onClick={() => !n.read && markRead.mutate(n.id)}
                className={`glass rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:bg-muted/30 transition-colors ${!n.read ? 'border-l-2 border-l-primary' : ''}`}>
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${colorMap[n.type] || 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.description}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(n.created_at).toLocaleDateString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
