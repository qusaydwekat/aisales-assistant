import { useEffect, useMemo, useState } from "react";
import { Loader2, Link2, Trash2, Plus, AlertCircle, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore, useProducts } from "@/hooks/useSupabaseData";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";

type PostLink = {
  id: string;
  platform: string;
  page_id: string;
  post_id: string;
  product_id: string;
  created_at: string;
};

export default function CatalogToolsPage() {
  const { dir } = useLanguage();
  const { data: store } = useStore();
  const { data: products = [] } = useProducts();

  const [links, setLinks] = useState<PostLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState("facebook");
  const [pageId, setPageId] = useState("");
  const [postId, setPostId] = useState("");
  const [productId, setProductId] = useState("");

  const loadLinks = async () => {
    if (!store?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from("post_product_links")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });
    setLinks((data as PostLink[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);

  const productsById = useMemo(
    () => Object.fromEntries(products.map((p: any) => [p.id, p])),
    [products]
  );

  const addLink = async () => {
    if (!store?.id || !postId.trim() || !productId) {
      toast.error("Post ID and product are required");
      return;
    }
    const { error } = await supabase.from("post_product_links").insert({
      store_id: store.id,
      platform,
      page_id: pageId.trim(),
      post_id: postId.trim(),
      product_id: productId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setPostId("");
    setProductId("");
    toast.success("Post linked to product");
    loadLinks();
  };

  const removeLink = async (id: string) => {
    await supabase.from("post_product_links").delete().eq("id", id);
    loadLinks();
  };

  // ── Catalog health ──
  const health = useMemo(() => {
    const total = products.length;
    const missingImages = products.filter((p: any) => !p.images || p.images.length === 0).length;
    const missingAutoDesc = products.filter((p: any) => !p.auto_description).length;
    const missingType = products.filter((p: any) => !p.type).length;
    const missingColor = products.filter((p: any) => !p.color || (p.color || []).length === 0).length;
    const missingEmbedding = products.filter((p: any) => !p.image_embedding).length;
    const incomplete = products.filter((p: any) => {
      const fields = [p.auto_description, p.type, (p.color || []).length > 0];
      return fields.some((f) => !f);
    });
    const completionPct =
      total === 0
        ? 0
        : Math.round(
            (products.filter(
              (p: any) =>
                p.auto_description &&
                p.type &&
                (p.color || []).length > 0 &&
                p.image_embedding
            ).length /
              total) *
              100
          );
    return {
      total,
      missingImages,
      missingAutoDesc,
      missingType,
      missingColor,
      missingEmbedding,
      incomplete: incomplete.slice(0, 12),
      completionPct,
    };
  }, [products]);

  return (
    <div className="p-4 md:p-6 space-y-6 pb-20 md:pb-6" dir={dir}>
      <div>
        <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">
          Catalog Tools
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Link social posts to products and monitor visual catalog health.
        </p>
      </div>

      {/* Catalog Health */}
      <section className="glass rounded-2xl p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold text-foreground">
            Visual catalog health
          </h2>
          <div className="flex items-center gap-2">
            {health.completionPct >= 80 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            )}
            <span className="text-sm font-medium">{health.completionPct}% ready</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total products", value: health.total },
            { label: "No image", value: health.missingImages, warn: health.missingImages > 0 },
            { label: "No auto-description", value: health.missingAutoDesc, warn: health.missingAutoDesc > 0 },
            { label: "No type/color", value: Math.max(health.missingType, health.missingColor), warn: true },
            { label: "No image embedding", value: health.missingEmbedding, warn: health.missingEmbedding > 0 },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/40 p-3">
              <div className={`text-xl font-bold ${s.warn && s.value > 0 ? "text-amber-500" : "text-foreground"}`}>
                {s.value}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {health.incomplete.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Incomplete products (missing visual fields the AI needs)
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {health.incomplete.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg bg-muted/30 p-2 text-sm"
                >
                  <div className="h-9 w-9 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[
                        !p.auto_description && "no description",
                        !p.type && "no type",
                        (!p.color || p.color.length === 0) && "no color",
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Post → Product linker */}
      <section className="glass rounded-2xl p-4 md:p-6 space-y-4">
        <div>
          <h2 className="font-heading font-semibold text-foreground">
            Link social posts to products
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            When a customer comments on a Facebook or Instagram post, the AI uses these
            mappings to know exactly which product they're asking about.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Page ID (optional)</label>
            <input
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              placeholder="e.g. 123456789"
              className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Post ID</label>
            <input
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              placeholder="e.g. 17891234..."
              className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Product</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full mt-1 rounded-lg bg-muted px-3 py-2 text-sm outline-none"
            >
              <option value="">Choose…</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.price ? `— ${p.price}` : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={addLink}
            className="rounded-lg px-3 py-2 bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Link
          </button>
        </div>

        <div className="space-y-1.5">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : links.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No post links yet. Add one above.
            </div>
          ) : (
            links.map((l) => {
              const p = productsById[l.product_id];
              return (
                <div
                  key={l.id}
                  className="flex items-center gap-3 rounded-lg bg-muted/30 p-2 text-sm"
                >
                  <Link2 className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground truncate">
                      <span className="capitalize">{l.platform}</span>
                      {l.page_id ? ` • page ${l.page_id}` : ""} • post {l.post_id}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      → {p?.name || "(deleted product)"}
                    </div>
                  </div>
                  <button
                    onClick={() => removeLink(l.id)}
                    className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
