import { notifications } from "@/data/mock-data";
import { Bell, ShoppingCart, MessageSquare, AlertTriangle, Link2, UserCheck } from "lucide-react";

const iconMap = {
  message: MessageSquare,
  order: ShoppingCart,
  escalation: AlertTriangle,
  platform: Link2,
  approval: UserCheck,
};

const colorMap = {
  message: 'text-primary',
  order: 'text-success',
  escalation: 'text-warning',
  platform: 'text-accent',
  approval: 'text-info',
};

export default function NotificationsPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">{notifications.filter(n => !n.read).length} unread</p>
      </div>

      <div className="space-y-2">
        {notifications.map(n => {
          const Icon = iconMap[n.type];
          return (
            <div key={n.id} className={`glass rounded-xl p-4 flex items-start gap-3 ${!n.read ? 'border-l-2 border-l-primary' : ''}`}>
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${colorMap[n.type]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.description}</p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {new Date(n.createdAt).toLocaleDateString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
