import { Facebook, Instagram, MessageCircle, Check, Loader2, Copy, ExternalLink, Link2, Unlink } from "lucide-react";
import { usePlatformConnections } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { platformColors } from "@/data/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

type Platform = "facebook" | "instagram" | "whatsapp";
type PageOption = { id: string; name: string; instagram_business_account?: string | null };

const platformIcons: Record<Platform, typeof Facebook> = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };
const platformLabels: Record<Platform, string> = { facebook: "Facebook Messenger", instagram: "Instagram Direct", whatsapp: "WhatsApp Business" };

export default function PlatformsPage() {
  const { data: connections = [], isLoading } = usePlatformConnections();
  const { store } = useAuth();
  const { t, dir } = useLanguage();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pages, setPages] = useState<PageOption[]>([]);
  const [selectingPage, setSelectingPage] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectPlatform, setSelectPlatform] = useState<Platform | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const webhookBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-webhook`;
  const oauthBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-oauth`;

  // Handle OAuth callback redirect
  useEffect(() => {
    const sid = searchParams.get("session_id");
    const platform = searchParams.get("platform") as Platform | null;
    const error = searchParams.get("error");

    if (error) {
      const errorMessages: Record<string, string> = {
        no_pages_found: "No Facebook pages found. Make sure you have a Facebook Page.",
        token_exchange_failed: "Failed to authenticate with Meta. Please try again.",
        callback_failed: "Connection failed. Please try again.",
      };
      toast.error(errorMessages[error] || `Connection error: ${error}`);
      setSearchParams({}, { replace: true });
      return;
    }

    if (sid && platform) {
      setSessionId(sid);
      setSelectPlatform(platform);
      // Fetch pages from the pending connection
      fetchPendingPages(sid);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const fetchPendingPages = async (sid: string) => {
    const { data } = await supabase
      .from("platform_connections")
      .select("credentials")
      .eq("status", "pending_selection")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const creds = data.credentials as any;
      if (creds?.session_id === sid && creds?.pages) {
        setPages(creds.pages);
        setSelectingPage(true);
      }
    }
  };

  const handleSelectPage = async (pageId: string) => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${oauthBaseUrl}/select-page`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, page_id: pageId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to select page");

      toast.success(`Connected to ${result.page_name}!`);
      qc.invalidateQueries({ queryKey: ["platform_connections"] });
      setSelectingPage(false);
      setPages([]);
      setSessionId(null);
      setSelectPlatform(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to connect page");
    } finally {
      setSubmitting(false);
    }
  };

  const startOAuth = (platform: Platform) => {
    if (!store?.id) {
      toast.error("Store not found. Please set up your store first.");
      return;
    }
    const redirectUrl = window.location.origin + "/platforms";
    const oauthUrl = `${oauthBaseUrl}/start?platform=${platform}&store_id=${store.id}&redirect_url=${encodeURIComponent(redirectUrl)}`;
    window.location.href = oauthUrl;
  };

  const handleDisconnect = async (connectionId: string, name: string) => {
    try {
      const { error } = await supabase
        .from("platform_connections")
        .update({ status: "disconnected" })
        .eq("id", connectionId);
      if (error) throw error;
      toast.success(`${name} disconnected`);
      qc.invalidateQueries({ queryKey: ["platform_connections"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect");
    }
  };

  const copyWebhook = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Webhook URL copied!");
  };

  const allPlatforms: Platform[] = ['facebook', 'instagram', 'whatsapp'];
  const platformData = allPlatforms.map(p => {
    const conn = connections.find(c => c.platform === p && c.status === 'connected');
    return {
      id: p,
      name: platformLabels[p],
      icon: platformIcons[p],
      color: platformColors[p],
      connected: !!conn,
      connectionId: conn?.id,
      pageName: conn?.page_name || '—',
      lastSync: conn?.last_synced_at ? new Date(conn.last_synced_at).toLocaleString() : '—',
      messagesThisWeek: conn?.message_count || 0,
      webhookUrl: `${webhookBaseUrl}?platform=${p}`,
    };
  });

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl" dir={dir}>
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">{t("connected_platforms")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("manage_platforms")}</p>
      </div>

      <div className="grid gap-4">
        {platformData.map(p => (
          <div key={p.id} className="glass rounded-xl p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: p.color + '20' }}>
                  <p.icon className="h-6 w-6" style={{ color: p.color }} />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-foreground">{p.name}</h3>
                  <p className="text-sm text-muted-foreground">{p.pageName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {p.connected ? (
                  <>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-success/20 text-success">
                      <Check className="h-3 w-3" /> {t("connected")}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => handleDisconnect(p.connectionId!, p.name)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => startOAuth(p.id)} className="gap-1.5">
                    <Link2 className="h-4 w-4" /> Connect with Meta
                  </Button>
                )}
              </div>
            </div>

            {/* Webhook URL */}
            <div className="mt-4 pt-4 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-1.5">Webhook URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2 text-foreground/80 truncate font-mono">
                  {p.webhookUrl}
                </code>
                <button onClick={() => copyWebhook(p.webhookUrl)}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            {p.connected && (
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/50">
                <div><p className="text-xs text-muted-foreground">{t("messages")}</p><p className="text-sm font-medium text-foreground">{p.messagesThisWeek}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("last_synced")}</p><p className="text-sm font-medium text-foreground">{p.lastSync}</p></div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="glass rounded-xl p-6">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-primary" /> Setup Guide
        </h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>1. Click <strong>Connect with Meta</strong> — you'll be redirected to Facebook</p>
          <p>2. Grant permissions and select the pages you want to connect</p>
          <p>3. Choose which page to use from the selection dialog</p>
          <p>4. Copy the webhook URL and paste it in your Meta Developer Dashboard</p>
          <p>5. Set verify token to: <code className="bg-muted px-1.5 py-0.5 rounded text-xs text-foreground">aisales_verify_2024</code></p>
          <p>6. Messages will appear in your Inbox automatically</p>
        </div>
      </div>

      {/* Page Selection Dialog */}
      <Dialog open={selectingPage} onOpenChange={(open) => { if (!open) { setSelectingPage(false); setPages([]); setSessionId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectPlatform && (() => { const Icon = platformIcons[selectPlatform]; return <Icon className="h-5 w-5" style={{ color: platformColors[selectPlatform] }} />; })()}
              Select a Page
            </DialogTitle>
            <DialogDescription>
              Choose which page to connect for receiving messages
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2 max-h-80 overflow-y-auto">
            {pages.map(page => (
              <button
                key={page.id}
                onClick={() => handleSelectPage(page.id)}
                disabled={submitting}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-start disabled:opacity-50"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Facebook className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{page.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {page.id}</p>
                </div>
                {submitting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </button>
            ))}
            {pages.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                Loading pages...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
