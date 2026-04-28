// Edge function: ai-image-attributes
// Extracts visual attributes + a 1536-dim embedding from a customer-sent
// photo so the matching engine can score it against the product catalog.
// Same vision schema as ai-product-autofill — keeps embedding space consistent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_url } = await req.json();
    if (!image_url || typeof image_url !== "string") {
      return new Response(JSON.stringify({ error: "image_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let provider = "openai";
    let model = "gpt-4o-mini";
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: cfg } = await supabase
        .from("platform_ai_config")
        .select("provider, autofill_model")
        .limit(1)
        .maybeSingle();
      if (cfg?.provider) provider = cfg.provider;
      if (cfg?.autofill_model) model = cfg.autofill_model;
    } catch (e) {
      console.warn("platform_ai_config fetch failed:", e);
    }

    const isLovable = provider === "lovable";
    const apiKey = isLovable ? Deno.env.get("LOVABLE_API_KEY") : Deno.env.get("OPENAI_API_KEY");
    const endpoint = isLovable
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI key missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const visionModel = /mini|gpt-3|3\.5/i.test(model) ? "gpt-4o" : model;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: "system",
            content:
              "Extract every visual attribute you can see in this product photo. The store will use these attributes to find similar items in its catalog. Be specific and descriptive. If a field doesn't apply, return null. Always call extract_attributes exactly once.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "What is in this image?" },
              { type: "image_url", image_url: { url: image_url } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_attributes",
              description: "Visual attributes of the product in the photo",
              parameters: {
                type: "object",
                properties: {
                  short_description: { type: "string", description: "ONE short natural-language sentence describing what is in the photo" },
                  type: { type: ["string", "null"] },
                  color: { type: "array", items: { type: "string" } },
                  pattern: { type: ["string", "null"] },
                  style: { type: ["string", "null"] },
                  material: { type: ["string", "null"] },
                  fit: { type: ["string", "null"] },
                  occasion: { type: "array", items: { type: "string" } },
                  sleeve: { type: ["string", "null"] },
                  neckline: { type: ["string", "null"] },
                  length: { type: ["string", "null"] },
                  category: { type: ["string", "null"] },
                  image_quality: { type: "string", enum: ["clear", "blurry", "unclear"], description: "Is the photo clear enough to identify the product?" },
                  is_clothing: { type: "boolean", description: "Is the subject a clothing/fashion/product item (vs a person/landscape/random photo)?" },
                },
                required: ["short_description", "color", "image_quality", "is_clothing"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_attributes" } },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Vision API error:", resp.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error", detail: txt }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments;
    let parsed: any = {};
    try {
      parsed = typeof args === "string" ? JSON.parse(args) : args || {};
    } catch (_) {
      parsed = {};
    }

    const attributes = {
      short_description: parsed.short_description || "",
      type: parsed.type || null,
      color: Array.isArray(parsed.color) ? parsed.color : [],
      pattern: parsed.pattern || null,
      style: parsed.style || null,
      material: parsed.material || null,
      fit: parsed.fit || null,
      occasion: Array.isArray(parsed.occasion) ? parsed.occasion : [],
      sleeve: parsed.sleeve || null,
      neckline: parsed.neckline || null,
      length: parsed.length || null,
      category: parsed.category || null,
      image_quality: parsed.image_quality || "clear",
      is_clothing: parsed.is_clothing !== false,
    };

    // Embedding (same schema as products)
    let embedding: number[] | null = null;
    try {
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (openaiKey) {
        const text = buildEmbeddingText(attributes);
        const embResp = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
        });
        if (embResp.ok) {
          const embData = await embResp.json();
          embedding = embData?.data?.[0]?.embedding || null;
        }
      }
    } catch (e) {
      console.warn("Embedding failed:", e);
    }

    return new Response(JSON.stringify({ attributes, embedding }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-image-attributes error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildEmbeddingText(a: any): string {
  const parts: string[] = [];
  if (a.short_description) parts.push(a.short_description);
  if (a.type) parts.push(`type:${a.type}`);
  if (a.color?.length) parts.push(`color:${a.color.join(",")}`);
  if (a.pattern) parts.push(`pattern:${a.pattern}`);
  if (a.style) parts.push(`style:${a.style}`);
  if (a.material) parts.push(`material:${a.material}`);
  if (a.fit) parts.push(`fit:${a.fit}`);
  if (a.sleeve) parts.push(`sleeve:${a.sleeve}`);
  if (a.neckline) parts.push(`neckline:${a.neckline}`);
  if (a.length) parts.push(`length:${a.length}`);
  if (a.occasion?.length) parts.push(`occasion:${a.occasion.join(",")}`);
  if (a.category) parts.push(`category:${a.category}`);
  return parts.join(" | ") || "product";
}
