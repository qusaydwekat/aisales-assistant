import { Facebook, Instagram, MessageCircle, Check, Loader2, Copy, ExternalLink, Link2, Unlink, CheckSquare, Square } from "lucide-react";
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
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [selectingPage, setSelectingPage] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectPlatform, setSelectPlatform] = useState<Platform | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const webhookBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-webhook`;
  const oauthBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-oauth`;

  // Handle OAuth callback redirect — wait for store to be ready so RLS works
  useEffect(() => {
    const sid = searchParams.get("session_id");
    const platform = searchParams.get("platform") as Platform | null;
    const error = searchParams.get("error");

    if (error) {
      const errorMessages: Record<string, string> = {
        no_pages_found: "No Facebook pages found. Make sure you have a Facebook Page.",
        no_whatsapp_numbers_found: "No WhatsApp Business phone numbers found. Make sure you have a WhatsApp Business Account with a registered phone number.",
        token_exchange_failed: "Failed to authenticate with Meta. Please try again.",
        callback_failed: "Connection failed. Please try again.",
      };
      toast.error(errorMessages[error] || `Connection error: ${error}`);
      setSearchParams({}, { replace: true });
      return;
    }

    if (sid && platform && store?.id) {
      setSessionId(sid);
      setSelectPlatform(platform);
      fetchPendingPages(sid, store.id);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, store?.id]);

  const fetchPendingPages = async (sid: string, storeId: string) => {
    const { data } = await supabase
      .from("platform_connections")
      .select("credentials")
      .eq("store_id", storeId)
      .eq("status", "pending_selection")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const creds = data.credentials as any;
      if (creds?.session_id === sid && creds?.pages) {
        setPages(creds.pages);
        setSelectedPageIds(new Set(creds.pages.map((p: PageOption) => p.id)));
        setSelectingPage(true);
      }
    }
  };

  const togglePage = (pageId: string) => {
    setSelectedPageIds(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPageIds.size === pages.length) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(pages.map(p => p.id)));
    }
  };

  const handleConnectSelected = async () => {
    if (!sessionId || selectedPageIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${oauthBaseUrl}/select-pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, page_ids: Array.from(selectedPageIds) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to connect pages");

      const count = result.connected?.length || 0;
      const conflictCount = result.conflicts?.length || 0;
      const failedCount = result.failed?.length || 0;

      if (count > 0) {
        toast.success(`Connected ${count} page${count !== 1 ? "s" : ""} successfully!`);
      }

      if (conflictCount > 0) {
        const preview = result.conflicts.slice(0, 2).join(", ");
        toast.error(`${conflictCount} page${conflictCount !== 1 ? "s are" : " is"} already linked to another store${preview ? `: ${preview}` : ""}`);
      }

      if (!count && !conflictCount && failedCount > 0) {
        throw new Error("Failed to connect the selected pages");
      }

      qc.invalidateQueries({ queryKey: ["platform_connections"] });
      setSelectingPage(false);
      setPages([]);
      setSessionId(null);
      setSelectPlatform(null);
      setSelectedPageIds(new Set());
    } catch (err: any) {
      toast.error(err.message || "Failed to connect pages");
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
        .delete()
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

  const allPlatforms: Platform[] = ["facebook", "instagram", "whatsapp"];

  // Group connected pages by platform
  const connectedByPlatform = allPlatforms.map(p => {
    const conns = connections.filter(c => c.platform === p && c.status === "connected");
    return { platform: p, connections: conns };
  });

  if (isLoading) return <div className="p-6 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-4xl pb-20 md:pb-6" dir={dir}>
      <div>
        <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">{t("connected_platforms")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">{t("manage_platforms")}</p>
      </div>

      {/* Platform cards with connect button */}
      <div className="grid gap-4">
        {allPlatforms.map(p => {
          const Icon = platformIcons[p];
          const color = platformColors[p];
          const conns = connectedByPlatform.find(x => x.platform === p)?.connections || [];
          const webhookUrl = webhookBaseUrl;

          return (
            <div key={p} className="glass rounded-xl p-4 md:p-6 space-y-3 md:space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color + "20" }}>
                    <Icon className="h-5 w-5 md:h-6 md:w-6" style={{ color }} />
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold text-foreground">{platformLabels[p]}</h3>
                    <p className="text-sm text-muted-foreground">
                      {conns.length > 0 ? `${conns.length} ${t("pages_connected")}` : t("not_connected_msg")}
                    </p>
                  </div>
                </div>
                <Button size="sm" onClick={() => startOAuth(p)} className="gap-1.5" variant={conns.length > 0 ? "outline" : "default"}>
                  <Link2 className="h-4 w-4" /> {conns.length > 0 ? t("add_pages") : t("connect")}
                </Button>
              </div>

              {/* Connected pages list */}
              {conns.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  {conns.map(conn => (
                    <div key={conn.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success/20 text-success shrink-0">
                          <Check className="h-3 w-3" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{conn.page_name || "Unknown Page"}</p>
                          <p className="text-xs text-muted-foreground">
                            {conn.message_count || 0} messages • Last sync: {conn.last_synced_at ? new Date(conn.last_synced_at).toLocaleDateString() : "—"}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDisconnect(conn.id, conn.page_name || "Page")}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0">
                        <Unlink className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Webhook URL */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-1.5">{t("webhook_url")}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2 text-foreground/80 truncate font-mono">
                    {webhookUrl}
                  </code>
                  <button onClick={() => copyWebhook(webhookUrl)}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Setup Guide */}
      <div className="glass rounded-xl p-6 space-y-4">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-primary" /> {t("setup_guide")}
        </h3>

        {/* Facebook Messenger */}
        <div>
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
            <Facebook className="h-4 w-4" style={{ color: platformColors.facebook }} /> Facebook Messenger
          </h4>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>1. Click <strong>Connect</strong> → grant Facebook permissions</p>
            <p>2. Select pages → they're automatically subscribed to receive messages</p>
            <p>3. AI replies to Messenger conversations instantly ✅</p>
          </div>
        </div>

        {/* Instagram */}
        <div>
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
            <Instagram className="h-4 w-4" style={{ color: platformColors.instagram }} /> Instagram Direct
          </h4>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>1. Click <strong>Connect</strong> → grant Instagram messaging permissions</p>
            <p>2. Select the Facebook Page linked to your Instagram Business account</p>
            <p>3. <strong>Important:</strong> In Meta Developer Portal → Webhooks, subscribe to <code className="bg-muted px-1 rounded">instagram</code> object → <code className="bg-muted px-1 rounded">messages</code> field</p>
            <p>4. Use the Webhook URL shown above and Verify Token: <code className="bg-muted px-1 rounded">aisales_verify_2024</code></p>
          </div>
        </div>

        {/* WhatsApp */}
        <div>
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
            <MessageCircle className="h-4 w-4" style={{ color: platformColors.whatsapp }} /> WhatsApp Business
          </h4>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>1. Click <strong>Connect</strong> → grant WhatsApp Business permissions</p>
            <p>2. Select phone numbers to manage from your WhatsApp Business Account</p>
            <p>3. <strong>Important:</strong> In Meta Developer Portal → WhatsApp → Configuration, set the Webhook URL and Verify Token: <code className="bg-muted px-1 rounded">aisales_verify_2024</code></p>
            <p>4. Subscribe to <code className="bg-muted px-1 rounded">messages</code> webhook field</p>
          </div>
        </div>

        <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
          <p>💡 All conversations from all platforms appear in your <strong>Inbox</strong> with filters by platform and page.</p>
          <p>💡 You can connect multiple pages/numbers from each platform.</p>
        </div>
      </div>

      {/* Multi-Page Selection Dialog */}
      <Dialog open={selectingPage} onOpenChange={(open) => { if (!open) { setSelectingPage(false); setPages([]); setSessionId(null); setSelectedPageIds(new Set()); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectPlatform && (() => { const Icon = platformIcons[selectPlatform]; return <Icon className="h-5 w-5" style={{ color: platformColors[selectPlatform] }} />; })()}
              {t("select_pages_title")}
            </DialogTitle>
            <DialogDescription>
              {t("select_pages_desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 pt-2 max-h-80 overflow-y-auto">
            {pages.length > 1 && (
              <button onClick={toggleAll} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors text-start">
                {selectedPageIds.size === pages.length
                  ? <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                  : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="text-sm font-medium text-foreground">{t("select_all")} ({pages.length})</span>
              </button>
            )}
            {pages.map(page => (
              <button
                key={page.id}
                onClick={() => togglePage(page.id)}
                disabled={submitting}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors text-start disabled:opacity-50"
              >
                {selectedPageIds.has(page.id)
                  ? <CheckSquare className="h-5 w-5 text-primary shrink-0" />
                  : <Square className="h-5 w-5 text-muted-foreground shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{page.name}</p>
                  <p className="text-xs text-muted-foreground">ID: {page.id}</p>
                </div>
              </button>
            ))}
            {pages.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                {t("loading_pages")}
              </div>
            )}
          </div>

          {pages.length > 0 && (
            <div className="pt-3 border-t border-border/50">
              <Button onClick={handleConnectSelected} disabled={submitting || selectedPageIds.size === 0} className="w-full gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {t("connect")} {selectedPageIds.size} {t("pages_connected")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
