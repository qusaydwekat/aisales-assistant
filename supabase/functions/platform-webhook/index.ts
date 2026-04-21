import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function verifyMetaSignature(
  req: Request,
  body: string
): Promise<boolean> {
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature) return false;

  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) {
    console.warn("META_APP_SECRET not set, skipping signature verification");
    return true;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = `sha256=${hex}`;

  return signature === expected;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function stableId(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(digest);
}

function fileExtFromContentType(
  contentType: string | null | undefined
): string {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("image/jpeg")) return "jpg";
  if (ct.includes("image/jpg")) return "jpg";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/gif")) return "gif";
  return "bin";
}

function safeStorageId(id: string): string {
  return (id || "msg").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function cleanUrl(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  // Meta URLs sometimes include stray newlines/spaces when logged/truncated
  const cleaned = url.replace(/\s+/g, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

async function uploadToStoreAssets(
  supabase: any,
  filePath: string,
  bytes: Uint8Array,
  contentType: string | null
): Promise<string | null> {
  // Supabase Storage upload is most reliable with Blob in Deno
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: contentType || "application/octet-stream",
  });

  const { error: uploadErr } = await supabase.storage
    .from("store-assets")
    .upload(filePath, blob, {
      upsert: true,
      contentType: contentType || undefined,
    });

  if (uploadErr) {
    console.error("Storage upload failed:", uploadErr);
    return null;
  }

  const { data } = supabase.storage.from("store-assets").getPublicUrl(filePath);
  return data?.publicUrl || null;
}

async function downloadBytes(
  url: string,
  headers?: Record<string, string>
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn("Failed to download media:", res.status, await res.text());
      return null;
    }
    const ab = await res.arrayBuffer();
    return {
      bytes: new Uint8Array(ab),
      contentType: res.headers.get("content-type"),
    };
  } catch (e) {
    console.warn("Media download error:", e);
    return null;
  }
}

async function fetchWhatsAppMediaUrl(
  mediaId: string,
  pageAccessToken: string
): Promise<{ url: string; mime_type?: string } | null> {
  try {
    const metaUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(
      mediaId
    )}`;
    const res = await fetch(metaUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${pageAccessToken}` },
    });
    if (!res.ok) {
      console.warn(
        "WhatsApp media lookup failed:",
        res.status,
        await res.text()
      );
      return null;
    }
    const data = await res.json();
    if (!data?.url) return null;
    return { url: data.url, mime_type: data.mime_type };
  } catch (e) {
    console.warn("WhatsApp media lookup error:", e);
    return null;
  }
}

// Auto-detect platform from Meta webhook payload
function detectPlatform(body: any, queryPlatform: string | null): string {
  // Always prefer the payload's object field — it is authoritative from Meta
  const obj = body?.object;
  if (obj === "page") return "facebook";
  if (obj === "instagram") return "instagram";
  if (obj === "whatsapp_business_account") return "whatsapp";

  // Fallback: check entry structure
  if (body?.entry?.[0]?.messaging) return "facebook";
  if (body?.entry?.[0]?.changes?.[0]?.value?.messages) return "whatsapp";

  // Last resort: use query param if provided
  if (queryPlatform) return queryPlatform;

  return "facebook"; // default
}

async function sendMetaReply(
  platform: string,
  recipientId: string,
  text: string,
  pageAccessToken: string,
  pageId?: string
) {
  if (platform === "facebook" || platform === "instagram") {
    const url = `https://graph.facebook.com/v21.0/me/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[${platform}] Send API error:`, JSON.stringify(data));
    } else {
      console.log(`[${platform}] Reply sent to ${recipientId}`);
    }
    return data;
  } else if (platform === "whatsapp") {
    const url = `https://graph.facebook.com/v21.0/${pageId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientId,
        type: "text",
        text: { body: text },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[whatsapp] Send API error:`, JSON.stringify(data));
    } else {
      console.log(`[whatsapp] Reply sent to ${recipientId}`);
    }
    return data;
  }
}

async function sendMetaImage(
  platform: string,
  recipientId: string,
  imageUrl: string,
  caption: string,
  pageAccessToken: string,
  pageId?: string
) {
  if (platform === "facebook" || platform === "instagram") {
    const url = `https://graph.facebook.com/v21.0/me/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: "image",
            payload: { url: imageUrl, is_reusable: true },
          },
        },
        messaging_type: "RESPONSE",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[${platform}] Image send error:`, JSON.stringify(data));
    } else {
      console.log(`[${platform}] Image sent to ${recipientId}: ${imageUrl}`);
    }
    return data;
  } else if (platform === "whatsapp") {
    const url = `https://graph.facebook.com/v21.0/${pageId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientId,
        type: "image",
        image: { link: imageUrl, caption },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`[whatsapp] Image send error:`, JSON.stringify(data));
    } else {
      console.log(`[whatsapp] Image sent to ${recipientId}: ${imageUrl}`);
    }
    return data;
  }
}

async function fetchMetaDisplayName(
  platform: string,
  senderId: string,
  pageAccessToken: string | null
): Promise<string | null> {
  if (!pageAccessToken) return null;
  if (!senderId) return null;

  console.log("fetchMetaDisplayName confirm deployed");

  // For Facebook/Instagram, we can often resolve the sender profile name via Graph API.
  // If this fails (permissions/token/etc), we fall back to a short placeholder.
  if (platform !== "facebook" && platform !== "instagram") return null;

  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(
      senderId
    )}?fields=name`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const name = (data?.name || "").toString().trim();
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

const ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "create_order",
    description:
      "Create a new order when the customer has confirmed items and you have collected their full name, phone number, and delivery address (possibly across multiple messages). Parse quantities from natural language (e.g. 'I want 3 of X' means quantity=3, 'give me two Y' means quantity=2, if no quantity mentioned assume 1). Call this ONLY after all required info is collected.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer's full name" },
        phone: { type: "string", description: "Customer's phone number" },
        address: { type: "string", description: "Customer's delivery address" },
        items: {
          type: "array",
          description:
            "List of ordered items. IMPORTANT: Always include product_id from search results for accurate stock tracking.",
          items: {
            type: "object",
            properties: {
              product_id: {
                type: "string",
                description:
                  "The product UUID from search results. MUST be included for stock tracking.",
              },
              product_name: { type: "string" },
              quantity: { type: "number" },
              price: { type: "number" },
            },
            required: ["product_name", "quantity", "price"],
          },
        },
        notes: {
          type: "string",
          description: "Any special notes or requests from the customer",
        },
      },
      required: ["customer_name", "phone", "address", "items"],
    },
  },
};

const CANCEL_ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "cancel_order",
    description:
      "Cancel an existing order when the customer explicitly requests to cancel. Use the order number if provided, otherwise look up the most recent pending order for this conversation.",
    parameters: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description:
            "The order number (e.g. ORD-00001). Optional — if not provided, the most recent pending order for this conversation will be cancelled.",
        },
        reason: {
          type: "string",
          description: "Reason for cancellation if the customer provides one",
        },
      },
      required: [],
    },
  },
};

const UPDATE_ORDER_TOOL = {
  type: "function" as const,
  function: {
    name: "update_order",
    description:
      "Update an existing order. Use this to modify items, address, phone, name, or notes on an order that is still pending, confirmed, or processing. Always prefer updating an existing order over creating a new one when the customer wants to change something. Parse quantities from natural language.",
    parameters: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description:
            "The order number to update (e.g. ORD-00001). If not provided, the most recent active order for this conversation will be updated.",
        },
        customer_name: {
          type: "string",
          description: "Updated customer name (only if changed)",
        },
        phone: {
          type: "string",
          description: "Updated phone number (only if changed)",
        },
        address: {
          type: "string",
          description: "Updated delivery address (only if changed)",
        },
        items: {
          type: "array",
          description:
            "Updated full list of items (replaces existing items). Only provide if items changed. Parse quantities from natural language.",
          items: {
            type: "object",
            properties: {
              product_id: {
                type: "string",
                description:
                  "The product UUID from search results. MUST be included for stock tracking.",
              },
              product_name: { type: "string" },
              quantity: {
                type: "number",
                description:
                  "Quantity parsed from customer message. Default to 1 if not specified.",
              },
              price: { type: "number" },
            },
            required: ["product_name", "quantity", "price"],
          },
        },
        notes: { type: "string", description: "Updated notes" },
      },
      required: [],
    },
  },
};

const CHECK_ORDER_STATUS_TOOL = {
  type: "function" as const,
  function: {
    name: "check_order_status",
    description:
      "Look up the current status and details of an order from the database. Use this whenever the customer asks about their order status, delivery progress, or order details. You can search by order number or get the most recent order for this conversation.",
    parameters: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description:
            "The order number to look up (e.g. ORD-00001). If not provided, returns the most recent order for this conversation.",
        },
      },
      required: [],
    },
  },
};

const SEND_PRODUCT_IMAGES_TOOL = {
  type: "function" as const,
  function: {
    name: "send_product_images",
    description:
      "Send product images to the customer. Use this when the customer asks to see a product, asks what it looks like, or when recommending/discussing products. Always send images alongside your text description.",
    parameters: {
      type: "object",
      properties: {
        products: {
          type: "array",
          description: "List of products to send images for",
          items: {
            type: "object",
            properties: {
              product_name: {
                type: "string",
                description: "Name of the product",
              },
              image_url: {
                type: "string",
                description: "The image URL from the product catalog",
              },
              caption: {
                type: "string",
                description:
                  "Short caption for the image (e.g. product name and price)",
              },
            },
            required: ["product_name", "image_url"],
          },
        },
      },
      required: ["products"],
    },
  },
};

const SEARCH_PRODUCTS_TOOL = {
  type: "function" as const,
  function: {
    name: "search_products",
    description:
      "Search the product catalog by keyword, category, or price range. Use this whenever the customer asks about specific products, searches for something, or you need product details. Returns up to 10 matching products with full details including images and prices. ALWAYS use this tool before answering product-related questions.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search keyword to match against product name or description (e.g. 'shoes', 'red dress', 'laptop')",
        },
        category: {
          type: "string",
          description:
            "Filter by product category (use exact category names from the catalog summary)",
        },
        min_price: { type: "number", description: "Minimum price filter" },
        max_price: { type: "number", description: "Maximum price filter" },
      },
      required: [],
    },
  },
};

const LIST_CATEGORIES_TOOL = {
  type: "function" as const,
  function: {
    name: "list_categories",
    description:
      "List all product categories with their product counts and price ranges. Use this when the customer asks a vague question like 'what do you sell?', 'show me your products', or 'what categories do you have?'. This gives an overview without loading all products.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

async function executeCreateOrder(
  supabase: any,
  storeId: string,
  conversationId: string,
  platform: string,
  args: any
): Promise<string> {
  const total = (args.items || []).reduce(
    (sum: number, item: any) => sum + (item.price || 0) * (item.quantity || 1),
    0
  );

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      store_id: storeId,
      conversation_id: conversationId,
      customer_name: args.customer_name,
      phone: args.phone || "",
      address: args.address || "",
      items: args.items || [],
      total,
      notes: args.notes || "",
      platform,
      status: "pending",
    })
    .select("order_number")
    .single();

  if (error) {
    console.error("Order creation error:", error);
    return JSON.stringify({ success: false, error: error.message });
  }

  // Update conversation with customer details and status
  await supabase
    .from("conversations")
    .update({
      customer_name: args.customer_name,
      customer_phone: args.phone || null,
      customer_address: args.address || null,
      status: "pending_order",
    })
    .eq("id", conversationId);

  // Create notification for store owner
  const { data: store } = await supabase
    .from("stores")
    .select("user_id, name")
    .eq("id", storeId)
    .single();

  if (store) {
    await supabase.from("notifications").insert({
      user_id: store.user_id,
      title: `New order ${order.order_number}`,
      description: `${args.customer_name} placed an order for ${args.items.length} item(s) — Total: ${total}`,
      type: "order",
    });
  }

  console.log(`Order created: ${order.order_number}, total: ${total}`);
  return JSON.stringify({
    success: true,
    order_number: order.order_number,
    total,
    items_count: args.items.length,
  });
}

async function executeCancelOrder(
  supabase: any,
  storeId: string,
  conversationId: string,
  args: any
): Promise<string> {
  let query = supabase.from("orders").select("*").eq("store_id", storeId);

  if (args.order_number) {
    query = query.eq("order_number", args.order_number);
  } else {
    query = query
      .eq("conversation_id", conversationId)
      .in("status", ["pending", "confirmed", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);
  }

  const { data: orders, error: fetchErr } = await query;
  if (fetchErr || !orders?.length) {
    console.error("Cancel order lookup error:", fetchErr);
    return JSON.stringify({
      success: false,
      error: "No active order found to cancel.",
    });
  }

  const order = orders[0];
  if (order.status === "cancelled") {
    return JSON.stringify({
      success: false,
      error: `Order ${order.order_number} is already cancelled.`,
    });
  }
  if (order.status === "delivered" || order.status === "shipped") {
    return JSON.stringify({
      success: false,
      error: `Order ${order.order_number} has already been ${order.status} and cannot be cancelled.`,
    });
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", order.id);

  if (updateErr) {
    console.error("Cancel order update error:", updateErr);
    return JSON.stringify({ success: false, error: updateErr.message });
  }

  // Update conversation status back to open
  await supabase
    .from("conversations")
    .update({ status: "open" })
    .eq("id", conversationId);

  // Notify store owner
  const { data: store } = await supabase
    .from("stores")
    .select("user_id")
    .eq("id", storeId)
    .single();

  if (store) {
    await supabase.from("notifications").insert({
      user_id: store.user_id,
      title: `Order ${order.order_number} cancelled`,
      description: `${order.customer_name} cancelled their order.${
        args.reason ? ` Reason: ${args.reason}` : ""
      }`,
      type: "order",
    });
  }

  console.log(`Order cancelled: ${order.order_number}`);
  return JSON.stringify({ success: true, order_number: order.order_number });
}

async function executeUpdateOrder(
  supabase: any,
  storeId: string,
  conversationId: string,
  args: any
): Promise<string> {
  let query = supabase.from("orders").select("*").eq("store_id", storeId);

  if (args.order_number) {
    query = query.eq("order_number", args.order_number);
  } else {
    query = query
      .eq("conversation_id", conversationId)
      .in("status", ["pending", "confirmed", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);
  }

  const { data: orders, error: fetchErr } = await query;
  if (fetchErr || !orders?.length) {
    console.error("Update order lookup error:", fetchErr);
    return JSON.stringify({
      success: false,
      error: "No active order found to update.",
    });
  }

  const order = orders[0];
  if (["cancelled", "delivered", "shipped"].includes(order.status)) {
    return JSON.stringify({
      success: false,
      error: `Order ${order.order_number} is ${order.status} and cannot be updated.`,
    });
  }

  const updateData: any = {};
  if (args.customer_name) updateData.customer_name = args.customer_name;
  if (args.phone) updateData.phone = args.phone;
  if (args.address) updateData.address = args.address;
  if (args.notes !== undefined) updateData.notes = args.notes;
  if (args.items && args.items.length > 0) {
    updateData.items = args.items;
    updateData.total = args.items.reduce(
      (sum: number, item: any) =>
        sum + (item.price || 0) * (item.quantity || 1),
      0
    );
  }

  if (Object.keys(updateData).length === 0) {
    return JSON.stringify({ success: false, error: "No fields to update." });
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", order.id);

  if (updateErr) {
    console.error("Update order error:", updateErr);
    return JSON.stringify({ success: false, error: updateErr.message });
  }

  // Update conversation customer details if changed
  const convoUpdate: any = {};
  if (args.customer_name) convoUpdate.customer_name = args.customer_name;
  if (args.phone) convoUpdate.customer_phone = args.phone;
  if (args.address) convoUpdate.customer_address = args.address;
  if (Object.keys(convoUpdate).length > 0) {
    await supabase
      .from("conversations")
      .update(convoUpdate)
      .eq("id", conversationId);
  }

  // Notify store owner
  const { data: store } = await supabase
    .from("stores")
    .select("user_id")
    .eq("id", storeId)
    .single();
  if (store) {
    const changes = Object.keys(updateData).join(", ");
    await supabase.from("notifications").insert({
      user_id: store.user_id,
      title: `Order ${order.order_number} updated`,
      description: `${order.customer_name} updated their order. Changed: ${changes}`,
      type: "order",
    });
  }

  console.log(
    `Order updated: ${order.order_number}, fields: ${Object.keys(
      updateData
    ).join(", ")}`
  );
  return JSON.stringify({
    success: true,
    order_number: order.order_number,
    updated_fields: Object.keys(updateData),
    new_total: updateData.total ?? order.total,
  });
}

async function executeCheckOrderStatus(
  supabase: any,
  storeId: string,
  conversationId: string,
  args: any
): Promise<string> {
  let query = supabase.from("orders").select("*").eq("store_id", storeId);

  if (args.order_number) {
    query = query.eq("order_number", args.order_number);
  } else {
    query = query
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(5);
  }

  const { data: orders, error } = await query;
  if (error || !orders?.length) {
    console.error("Check order status error:", error);
    return JSON.stringify({ success: false, error: "No orders found." });
  }

  const result = orders.map((o: any) => ({
    order_number: o.order_number,
    status: o.status,
    customer_name: o.customer_name,
    phone: o.phone,
    address: o.address,
    items: o.items,
    total: o.total,
    notes: o.notes,
    created_at: o.created_at,
    updated_at: o.updated_at,
  }));

  console.log(
    `Order status checked: ${result.map((o: any) => o.order_number).join(", ")}`
  );
  return JSON.stringify({ success: true, orders: result });
}

async function executeSearchProducts(
  supabase: any,
  storeId: string,
  args: any
): Promise<string> {
  let query = supabase
    .from("products")
    .select(
      "id, name, description, price, compare_price, stock, category, images, variants, sku"
    )
    .eq("store_id", storeId)
    .eq("active", true);

  if (args.category) {
    query = query.ilike("category", `%${args.category}%`);
  }
  if (args.min_price !== undefined) {
    query = query.gte("price", args.min_price);
  }
  if (args.max_price !== undefined) {
    query = query.lte("price", args.max_price);
  }

  // If there's a text query, we fetch more and filter client-side (Supabase doesn't support OR ilike easily)
  const limit = args.query ? 100 : 10;
  query = query.limit(limit);

  const { data: products, error } = await query;
  if (error) {
    console.error("Search products error:", error);
    return JSON.stringify({
      success: false,
      error: "Failed to search products.",
    });
  }

  let results = products || [];

  // Client-side keyword filter on name + description
  if (args.query) {
    const q = args.query.toLowerCase();
    results = results.filter(
      (p: any) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
    );
  }

  // Limit final results to 10
  results = results.slice(0, 10);

  const formatted = results.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description || "",
    price: p.price,
    compare_price: p.compare_price,
    stock: p.stock,
    category: p.category || "General",
    images: p.images || [],
    variants: p.variants || [],
    sku: p.sku || "",
  }));

  console.log(
    `Search products: query="${args.query || ""}", category="${
      args.category || ""
    }", found ${formatted.length} results`
  );
  return JSON.stringify({
    success: true,
    products: formatted,
    total_results: formatted.length,
  });
}

async function executeListCategories(
  supabase: any,
  storeId: string
): Promise<string> {
  const { data: products, error } = await supabase
    .from("products")
    .select("category, price")
    .eq("store_id", storeId)
    .eq("active", true);

  if (error) {
    console.error("List categories error:", error);
    return JSON.stringify({
      success: false,
      error: "Failed to list categories.",
    });
  }

  const categoryMap: Record<
    string,
    { count: number; min_price: number; max_price: number }
  > = {};
  for (const p of products || []) {
    const cat = p.category || "General";
    if (!categoryMap[cat]) {
      categoryMap[cat] = { count: 0, min_price: p.price, max_price: p.price };
    }
    categoryMap[cat].count++;
    categoryMap[cat].min_price = Math.min(categoryMap[cat].min_price, p.price);
    categoryMap[cat].max_price = Math.max(categoryMap[cat].max_price, p.price);
  }

  const categories = Object.entries(categoryMap).map(([name, info]) => ({
    category: name,
    product_count: info.count,
    price_range: `${info.min_price} - ${info.max_price}`,
  }));

  const totalProducts = (products || []).length;
  console.log(
    `List categories: ${categories.length} categories, ${totalProducts} total products`
  );
  return JSON.stringify({
    success: true,
    categories,
    total_products: totalProducts,
  });
}

// Sanitize AI output: strip code blocks, excessive emojis, and technical artifacts
function sanitizeAIResponse(text: string): string {
  console.log("sanitizeAIResponse confirm deployed");

  // Remove markdown code blocks
  let clean = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
  // Remove HTML tags
  clean = clean.replace(/<[^>]+>/g, "");
  // Collapse repeated emojis (more than 2 of the same emoji in a row)
  clean = clean.replace(/([\u{1F000}-\u{1FFFF}])\1{2,}/gu, "$1");
  // Remove lines that look like code (starting with //, #!, import, const, let, var, function, return, etc.)
  clean = clean
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("#!") &&
        !trimmed.startsWith("import ") &&
        !trimmed.startsWith("export ") &&
        !/^(const |let |var |function |return |if |for |while |class )/.test(
          trimmed
        )
      );
    })
    .join("\n");
  // Collapse excessive whitespace
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();
  // If after cleaning the response is empty or too short, return a fallback
  if (clean.length < 3) {
    return "مرحباً! كيف أقدر أساعدك؟ 😊";
  }
  // Truncate to Meta's 2000 char limit
  if (clean.length > 1900) {
    clean = clean.substring(0, 1900) + "...";
  }
  return clean;
}

interface AIReplyResult {
  text: string;
  images: { url: string; caption: string }[];
}

function parseImageUrlFromMessageContent(content: string): string | null {
  if (!content) return null;
  const main = content.split("\n\n[CTX]")[0];
  if (!main.startsWith("📷 ")) return null;
  const url = main.replace("📷 ", "").trim();
  return url.length > 0 ? url : null;
}

// Parse the [CTX] block appended by the webhook with ad/reply context.
function parseMessageContext(content: string): {
  contextImageUrl: string | null;
  adTitle: string | null;
  adId: string | null;
  adUrl: string | null;
  textWithoutCtx: string;
} {
  const result = {
    contextImageUrl: null as string | null,
    adTitle: null as string | null,
    adId: null as string | null,
    adUrl: null as string | null,
    textWithoutCtx: content || "",
  };
  if (!content) return result;
  const idx = content.indexOf("\n\n[CTX] ");
  if (idx === -1) return result;
  result.textWithoutCtx = content.slice(0, idx);
  const ctxLine = content.slice(idx + "\n\n[CTX] ".length);
  for (const part of ctxLine.split(" | ")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === "context_image") result.contextImageUrl = val;
    else if (key === "ad_title") result.adTitle = val;
    else if (key === "ad_id") result.adId = val;
    else if (key === "ad_url") result.adUrl = val;
  }
  return result;
}

function stripMessageContext(content: string): string {
  return typeof content === "string" ? content.split("\n\n[CTX]")[0] : "";
}

function collectPendingCustomerBurst(conversationHistory: any[]): any[] {
  const burst: any[] = [];

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const entry = conversationHistory[i];
    if (entry?.sender !== "customer") break;
    burst.unshift(entry);
  }

  return burst;
}

function hasLaterMessageInSameConversation(
  parsedMessages: any[],
  currentIndex: number
): boolean {
  const current = parsedMessages[currentIndex];
  if (!current) return false;

  for (let i = currentIndex + 1; i < parsedMessages.length; i++) {
    const candidate = parsedMessages[i];
    if (!candidate) continue;

    if (
      candidate.platform === current.platform &&
      candidate.platformId === current.platformId &&
      (candidate.pageId || "") === (current.pageId || "")
    ) {
      return true;
    }
  }

  return false;
}

function extractBurstInput(burstMessages: any[]): {
  combinedText: string;
  imageUrls: string[];
  latestContext: ReturnType<typeof parseMessageContext>;
} {
  const seen = new Set<string>();
  const textParts: string[] = [];
  let latestContext = parseMessageContext("");

  for (const msg of burstMessages) {
    const rawContent = typeof msg?.content === "string" ? msg.content : "";
    if (!rawContent) continue;

    const ctx = parseMessageContext(rawContent);
    latestContext = ctx;

    const visibleText = ctx.textWithoutCtx.trim();
    if (
      visibleText &&
      visibleText !== "[Image]" &&
      !visibleText.startsWith("📷 ")
    ) {
      textParts.push(visibleText);
    }
  }

  const imageUrls = burstMessages.flatMap((msg) => {
    const rawContent = typeof msg?.content === "string" ? msg.content : "";
    if (!rawContent) return [] as string[];

    const ctx = parseMessageContext(rawContent);
    const directImage = parseImageUrlFromMessageContent(ctx.textWithoutCtx);
    return [directImage, ctx.contextImageUrl].filter((url): url is string => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  });

  return {
    combinedText: textParts.join("\n"),
    imageUrls,
    latestContext,
  };
}

function isFallbackLikeResponse(text: string, fallbackMessage?: string | null): boolean {
  const normalized = (text || "").trim().toLowerCase();
  if (!normalized) return true;

  const knownFallbacks = [
    fallbackMessage,
    "i'm not sure about that. let me connect you with our team!",
    "i’m not sure about that. let me connect you with our team!",
    "thanks for your message! our team will get back to you shortly.",
    "thanks for your message! we'll get back to you shortly.",
  ]
    .filter(Boolean)
    .map((entry) => entry!.trim().toLowerCase());

  return knownFallbacks.includes(normalized);
}

function looksLikeReferentialFollowUp(text: string): boolean {
  const normalized = (text || "").trim().toLowerCase();
  if (!normalized) return false;

  return /^(this|that|it|these|those|price\??|how much\??|details\??|same one\??|which one\??|what about this\??|كم|بكم|سعرها|سعره|هاي|هاد|هذا|هذه|هذي|هاذي|شو سعرها|شو سعره|بدّي هاي|بدي هاي|يعني هاي|هاي قديش|هاي بكم|تفاصيلها|تفاصيله|أبغى هذا|ابي هذا|أبي هذا)/i.test(
    normalized
  );
}

function collectRecentReferenceImages(conversationHistory: any[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const rawContent = typeof conversationHistory[i]?.content === "string"
      ? conversationHistory[i].content
      : "";
    if (!rawContent) continue;

    const ctx = parseMessageContext(rawContent);
    const mainImage = parseImageUrlFromMessageContent(ctx.textWithoutCtx);
    const candidates = [mainImage, ctx.contextImageUrl].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      urls.push(candidate);
      if (urls.length >= 3) return urls;
    }
  }

  return urls;
}

async function generateAIReply(
  customerMessage: string,
  storeInfo: any,
  catalogSummary: string,
  aiSettings: any,
  conversationHistory: any[],
  supabase: any,
  storeId: string,
  conversationId: string,
  platform: string,
  existingOrders: any[]
): Promise<AIReplyResult> {
  const emptyResult = (text: string): AIReplyResult => ({
    text: sanitizeAIResponse(text),
    images: [],
  });
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY not set, using fallback message");
    return emptyResult(
      aiSettings?.fallback_message ||
        "Thanks for your message! Our team will get back to you shortly."
    );
  }

  const toneMap: Record<string, string> = {
    friendly: "warm, friendly, and conversational",
    professional: "professional and polished",
    casual: "casual and relaxed",
    formal: "formal and respectful",
  };

  const toneDesc = toneMap[aiSettings?.tone || "friendly"] || "friendly";
  const personaName = aiSettings?.persona_name || "Sara";
  const language = aiSettings?.language || "both";

  let languageInstruction = "";
  if (language === "ar") languageInstruction = "Always respond in Arabic.";
  else if (language === "en")
    languageInstruction = "Always respond in English.";
  else
    languageInstruction =
      "Detect the customer's language and respond in the same language (Arabic or English).";

  const ordersContext =
    existingOrders.length > 0
      ? `\n\nExisting Orders for this conversation:\n${existingOrders
          .map(
            (o) =>
              `- ${o.order_number} | Status: ${o.status} | Customer: ${
                o.customer_name
              } | Items: ${JSON.stringify(o.items)} | Total: ${
                o.total
              } | Phone: ${o.phone || "N/A"} | Address: ${
                o.address || "N/A"
              } | Notes: ${o.notes || "N/A"}`
          )
          .join("\n")}`
      : "\n\nNo existing orders for this conversation.";

  const customInstructions = aiSettings?.ai_instructions || "";

  const systemPrompt = `You are ${personaName}, an AI sales assistant for "${
    storeInfo.name
  }".
Your tone is ${toneDesc}. ${languageInstruction}
${
  customInstructions
    ? `\nCustom Store Instructions:\n${customInstructions}\n`
    : ""
}
Store Information:
- Name: ${storeInfo.name}
- Category: ${storeInfo.category || "General"}
- Description: ${storeInfo.description || "N/A"}
- Address: ${storeInfo.address || "N/A"}
- Phone: ${storeInfo.phone || "N/A"}
- Delivery Info: ${storeInfo.delivery_info || "N/A"}
- Return Policy: ${storeInfo.return_policy || "N/A"}
- Payment Methods: ${storeInfo.payment_methods?.join(", ") || "N/A"}
- Working Hours: ${JSON.stringify(storeInfo.working_hours || {})}

Product Catalog Summary:
${catalogSummary}
${ordersContext}

PRODUCT SEARCH RULES — CRITICAL:
- You do NOT have the full product catalog in this prompt. You MUST use the search_products tool to find specific products.
- When a customer asks about products (e.g. "do you have shoes?", "show me something under 50"), ALWAYS call search_products with relevant keywords, category, or price filters.
- When a customer asks a vague question like "what do you sell?" or "show me your products", call list_categories first to give them an overview, then let them pick a category.
- After getting search results, use send_product_images to show products that have images.
- NEVER make up product names, prices, or details. Only use data returned by the tools.

CRITICAL ORDER RULES — READ CAREFULLY:
**MOST IMPORTANT**: You MUST call the create_order / update_order / cancel_order tool to perform any order action. NEVER just say "your order has been created" without actually calling the tool. If you do not call the tool, the order DOES NOT EXIST in our system and the store owner will never see it.

**ORDER STATUS QUERIES**: When a customer asks about their order status, delivery progress, or any order details, you MUST call the check_order_status tool to get the real-time status from the database. NEVER guess or assume the order status from conversation history alone. Always use the tool to get the latest information.

**QUANTITY DETECTION — CRITICAL**:
- Parse product quantities from natural language. Examples:
  - "I want 3 shirts" → quantity: 3
  - "give me two of those" → quantity: 2  
  - "I'll take a dozen eggs" → quantity: 12
  - "أبي 5 قطع" → quantity: 5
  - If the customer says just "I want this" or "أبي هذا" with no number → quantity: 1
- Always confirm the detected quantity with the customer before creating the order.
- Include the correct quantity in the order items — do NOT default everything to 1.

**PROGRESSIVE DATA COLLECTION — CRITICAL**:
- Customers may provide their information (name, phone, address) across MULTIPLE messages, not all at once.
- You MUST track and remember all details shared across the conversation history.
- Example flow:
  - Message 1: "I want 2 red shoes" → AI identifies product + quantity, asks for name
  - Message 2: "Ahmed" → AI stores name, asks for phone
  - Message 3: "0501234567" → AI stores phone, asks for address
  - Message 4: "Riyadh, King Fahd Road" → AI now has all info → calls create_order with ALL collected data
- NEVER ask for information the customer has already provided in earlier messages.
- Before calling create_order, summarize the full order (items + quantities + prices + customer info) and ask for final confirmation.
- If the customer provides partial info in one message (e.g., "my name is Sara, deliver to Jeddah"), extract ALL pieces from that single message.

1. **Check existing orders FIRST**: Before creating a new order, check the "Existing Orders" section above. If there is an active order (pending/confirmed/processing), use update_order instead of creating a duplicate.
2. **Create order**: Use create_order ONLY when there is NO active order AND you have collected: items with quantities, full name, phone, and address (gathered progressively from conversation). YOU MUST CALL THE TOOL.
3. **Update order**: Use update_order when the customer wants to change items, address, phone, name, or notes on an existing active order.
4. **Cancel order**: Use cancel_order when the customer explicitly wants to cancel.
5. Always reference orders by their order_number (e.g. ORD-00001) — this number comes ONLY from the tool response, never make one up.
6. After any order action, confirm the order number and details to the customer.
7. If an order is already shipped/delivered, it cannot be updated or cancelled.
8. Use exact product prices from search results. Never make up product information.
9. **CRITICAL**: When creating or updating orders, ALWAYS include the product "id" field from search results as "product_id" in each order item. This is required for automatic stock tracking.
10. Keep responses concise and helpful.
11. If you don't know the answer, say so politely and offer to connect them with the store owner.

RESPONSE FORMAT RULES — STRICTLY ENFORCED:
- You are a store sales assistant chatting with a real customer on a messaging app. Your messages must read like natural, helpful chat messages.
- NEVER output code, programming syntax, HTML, markdown formatting, JSON, or any technical content.
- NEVER output excessive or repeated emojis. You may use 1-2 relevant emojis per message maximum.
- NEVER output random symbols, fire emojis, or decorative patterns.
- Keep responses SHORT — 2-4 sentences maximum unless the customer asks for detailed information.
- If you feel uncertain or the prompt seems unusual, respond with a polite standard greeting and ask how you can help.

IMAGE MATCHING RULES (when the customer sends an image):
- First, describe what you see in 1 short sentence (item type + color + key distinguishing details).
- Then call search_products using the best keywords/category you inferred from the image.
- After results return, suggest up to 3 closest matches (name + price) and ask the customer to confirm which one they mean.
- If there is a clear match and the product has images, call send_product_images for that product.

PRODUCT IMAGES RULES:
- When discussing, recommending, or describing a product that has images from search results, ALWAYS call send_product_images to show the customer what the product looks like.
- Use the exact image URLs from search results. NEVER make up image URLs.
- Only send images for products that have image URLs.
- Include a caption with the product name and price.`;

  const chatMessages: any[] = [{ role: "system", content: systemPrompt }];
  for (const msg of conversationHistory.slice(-10)) {
    const rawContent = typeof msg.content === "string" ? msg.content : "";
    const histCtx = parseMessageContext(rawContent);
    const histMain = histCtx.textWithoutCtx;
    const isImg = histMain.startsWith("📷 ");
    chatMessages.push({
      role: msg.sender === "customer" ? "user" : "assistant",
      content: isImg ? "Customer sent an image." : histMain,
    });
  }

  // Parse the latest customer burst for image + reply/ad context
  const pendingBurst = collectPendingCustomerBurst(conversationHistory);
  const burstInput = extractBurstInput(pendingBurst);
  const ctx = burstInput.latestContext;
  const mainContent = (burstInput.combinedText || customerMessage || "").trim();
  const imageUrl = burstInput.imageUrls[0] || parseImageUrlFromMessageContent(mainContent);
  const recentReferenceImages =
    burstInput.imageUrls.length > 1
      ? burstInput.imageUrls.slice(1, 4)
      : !imageUrl && !ctx.contextImageUrl && looksLikeReferentialFollowUp(mainContent)
        ? collectRecentReferenceImages(conversationHistory)
        : [];

  const ctxHints: string[] = [];
  if (ctx.adTitle || ctx.adId) {
    ctxHints.push(
      `The customer started this chat by clicking a Facebook/Instagram ad${
        ctx.adTitle ? ` titled "${ctx.adTitle}"` : ""
      }${ctx.adId ? ` (ad_id=${ctx.adId})` : ""}. Treat the ad creative image as the product they are interested in.`
    );
  } else if (ctx.contextImageUrl) {
    ctxHints.push(
      "The customer is replying to an image they were sent (a product photo, ad creative, or story). Treat that image as the product they are asking about."
    );
  }

  if (recentReferenceImages.length > 0) {
    ctxHints.push(
      "The customer's message is a short follow-up like 'this' or 'how much'. Use the referenced product image(s) below as the primary context for identifying which product they mean."
    );
  }

  if (imageUrl || ctx.contextImageUrl || recentReferenceImages.length > 0) {
    const userParts: any[] = [];
    const textHint =
      (imageUrl
        ? "The customer sent an image. "
        : "The customer is asking about the image below (replied-to, ad creative, or recent referenced product image). ") +
      (ctxHints.length > 0 ? ctxHints.join(" ") + " " : "") +
      "Identify the product: describe the visible item briefly (type, brand if visible, color, material, category). " +
      "Then call search_products with the best keywords and/or category. " +
      "After results return, suggest up to 3 closest matches and ask the customer to confirm." +
      (mainContent && mainContent !== "[Image]" && !mainContent.startsWith("📷 ")
        ? `\n\nThe customer also wrote: "${mainContent}"`
        : "");
    userParts.push({ type: "text", text: textHint });
    if (imageUrl) {
      userParts.push({
        type: "image_url",
        image_url: { url: imageUrl, detail: "auto" },
      });
    }
    if (ctx.contextImageUrl) {
      userParts.push({
        type: "image_url",
        image_url: { url: ctx.contextImageUrl, detail: "auto" },
      });
    }
    for (const refUrl of recentReferenceImages) {
      userParts.push({
        type: "image_url",
        image_url: { url: refUrl, detail: "auto" },
      });
    }
    chatMessages.push({ role: "user", content: userParts });
  } else {
      const finalText =
      ctxHints.length > 0
          ? `${ctxHints.join(" ")}\n\nCustomer message: ${mainContent || customerMessage}`
          : mainContent || customerMessage;
    chatMessages.push({ role: "user", content: finalText });
  }

  const allTools = [
    ORDER_TOOL,
    CANCEL_ORDER_TOOL,
    UPDATE_ORDER_TOOL,
    CHECK_ORDER_STATUS_TOOL,
    SEND_PRODUCT_IMAGES_TOOL,
    SEARCH_PRODUCTS_TOOL,
    LIST_CATEGORIES_TOOL,
  ];

  // Support multiple rounds of tool calls (e.g. search_products -> send_product_images)
  let currentMessages = [...chatMessages];
  const maxRounds = 5;
  const allImageesToSend: { url: string; caption: string }[] = [];

  try {
    for (let round = 0; round < maxRounds; round++) {
      const isFinalRound = round === maxRounds - 1;
      // On the final round, force a text-only response (no more tool calls)
      const requestBody: any = {
        model: "google/gemini-3-flash-preview",
        messages: isFinalRound
          ? [
              ...currentMessages,
              {
                role: "system",
                content:
                  "You have gathered enough information. Now respond to the customer in natural language. Do NOT call any more tools.",
              },
            ]
          : currentMessages,
      };
      if (!isFinalRound) requestBody.tools = allTools;

      const response = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );


      if (response.status === 429 || response.status === 402) {
        console.warn("AI rate limited or credits exhausted, using fallback");
        return emptyResult(
          aiSettings?.fallback_message ||
            "Thanks for your message! We'll get back to you shortly."
        );
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI gateway error:", response.status, errText);
        return emptyResult(
          aiSettings?.fallback_message ||
            "Thanks for your message! We'll get back to you shortly."
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      console.log(
        `AI response round ${round + 1} - finish_reason: ${
          choice?.finish_reason
        }, tool_calls: ${choice?.message?.tool_calls?.length || 0}`
      );

      // If no tool calls, return the text response
      if (!choice?.message?.tool_calls?.length) {
        const text = sanitizeAIResponse(
          choice?.message?.content ||
            aiSettings?.fallback_message ||
            "Thanks for your message!"
        );
        if (isFallbackLikeResponse(text, aiSettings?.fallback_message)) {
          const retryPrompt =
            "Reply naturally as a store assistant in the customer's language. Do not say you are unsure, do not escalate to the team, and do not use fallback wording. If the customer asked for product photos, answer briefly and use send_product_images when you already have products from previous tool results.";

          currentMessages = [
            ...currentMessages,
            choice.message,
            { role: "system", content: retryPrompt },
          ];
          continue;
        }
        return { text, images: allImageesToSend };
      }

      // Process tool calls
      const toolCalls = choice.message.tool_calls;
      const toolResults: any[] = [];

      for (const tc of toolCalls) {
        const args =
          typeof tc.function.arguments === "string"
            ? JSON.parse(tc.function.arguments)
            : tc.function.arguments;

        let result: string;
        if (tc.function?.name === "create_order") {
          console.log("AI triggered create_order:", JSON.stringify(args));
          result = await executeCreateOrder(
            supabase,
            storeId,
            conversationId,
            platform,
            args
          );
        } else if (tc.function?.name === "cancel_order") {
          console.log("AI triggered cancel_order:", JSON.stringify(args));
          result = await executeCancelOrder(
            supabase,
            storeId,
            conversationId,
            args
          );
        } else if (tc.function?.name === "update_order") {
          console.log("AI triggered update_order:", JSON.stringify(args));
          result = await executeUpdateOrder(
            supabase,
            storeId,
            conversationId,
            args
          );
        } else if (tc.function?.name === "check_order_status") {
          console.log("AI triggered check_order_status:", JSON.stringify(args));
          result = await executeCheckOrderStatus(
            supabase,
            storeId,
            conversationId,
            args
          );
        } else if (tc.function?.name === "send_product_images") {
          console.log(
            "AI triggered send_product_images:",
            JSON.stringify(args)
          );
          for (const p of args.products || []) {
            if (p.image_url) {
              allImageesToSend.push({
                url: p.image_url,
                caption: p.caption || p.product_name || "",
              });
            }
          }
          result = JSON.stringify({
            success: true,
            images_queued: allImageesToSend.length,
          });
        } else if (tc.function?.name === "search_products") {
          console.log("AI triggered search_products:", JSON.stringify(args));
          result = await executeSearchProducts(supabase, storeId, args);
        } else if (tc.function?.name === "list_categories") {
          console.log("AI triggered list_categories");
          result = await executeListCategories(supabase, storeId);
        } else {
          result = JSON.stringify({ error: "Unknown tool" });
        }

        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Add assistant message + tool results for the next round
      currentMessages = [...currentMessages, choice.message, ...toolResults];

      // Images are accumulated in allImageesToSend across rounds
      // Continue to next round to let AI compose a text response
    }

    // If we exhausted all rounds, return last content
    return {
      text: sanitizeAIResponse("Thanks for your message! How can I help you?"),
      images: allImageesToSend,
    };
  } catch (err) {
    console.error("AI generation error:", err);
    return emptyResult(
      aiSettings?.fallback_message ||
        "Thanks for your message! We'll get back to you shortly."
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const queryPlatform = url.searchParams.get("platform");

  // Facebook/Instagram/WhatsApp webhook verification (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN =
      Deno.env.get("WEBHOOK_VERIFY_TOKEN") || "aisales_verify_2024";

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified for platform:", queryPlatform);
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // POST: incoming message webhook
  try {
    const bodyText = await req.text();

    // Verify Meta signature
    const isValid = await verifyMetaSignature(req, bodyText);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response("Invalid signature", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const body = JSON.parse(bodyText);

    // Auto-detect platform from payload
    const platform = detectPlatform(body, queryPlatform);
    console.log(
      `[${platform}] Webhook received (object: ${body?.object}):`,
      JSON.stringify(body).slice(0, 500)
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const messages: {
      platform: string;
      sender: string;
      text: string;
      platformId: string;
      timestamp: string;
      pageId?: string;
      platformMessageId?: string;
      displayName?: string;
      kind: "text" | "image";
      imageUrl?: string;
      mediaId?: string;
      // Context: image the customer is replying to (e.g. an ad creative or a previous message image)
      contextImageUrl?: string;
      // Context: Facebook ad referral info (when message originates from clicking an ad)
      adContext?: {
        adId?: string;
        adTitle?: string;
        adSourceUrl?: string;
        adImageUrl?: string;
        ref?: string;
      };
    }[] = [];

    if (platform === "facebook") {
      for (const entry of body.entry || []) {
        const pageId = entry.id;
        for (const messaging of entry.messaging || []) {
          if (messaging.message?.is_echo) continue;

          // Facebook Ad referral context (CTM ads / m.me ad clicks)
          // Can appear at messaging.referral OR messaging.message.referral
          const ref = messaging.referral || messaging.message?.referral;
          let adContext: any = undefined;
          if (ref && (ref.ad_id || ref.source === "ADS" || ref.ref || ref.source_url)) {
            adContext = {
              adId: ref.ad_id,
              adTitle: ref.ads_context_data?.ad_title,
              adSourceUrl: ref.source_url,
              adImageUrl: cleanUrl(ref.ads_context_data?.photo_url),
              ref: ref.ref,
            };
          }

          // Reply-to context: customer replying to a specific message (could be an image)
          let contextImageUrl: string | undefined;
          const replyTo = messaging.message?.reply_to;
          if (replyTo) {
            const replyImg = (replyTo.attachments || []).find(
              (a: any) => a?.type === "image"
            );
            if (replyImg) contextImageUrl = cleanUrl(replyImg?.payload?.url);
          }

          if (messaging.message?.text) {
            messages.push({
              platform: "facebook",
              sender: messaging.sender?.id || "unknown",
              text: messaging.message.text,
              platformId: messaging.sender?.id || "",
              timestamp: new Date(
                messaging.timestamp || Date.now()
              ).toISOString(),
              pageId,
              platformMessageId: messaging.message?.mid || undefined,
              kind: "text",
              contextImageUrl,
              adContext,
            });
          } else if (messaging.message?.attachments?.length > 0) {
            const imgAtt = (messaging.message.attachments || []).find(
              (a: any) => a?.type === "image"
            );
            if (imgAtt) {
              messages.push({
                platform: "facebook",
                sender: messaging.sender?.id || "unknown",
                text: "[Image]",
                platformId: messaging.sender?.id || "",
                timestamp: new Date(
                  messaging.timestamp || Date.now()
                ).toISOString(),
                pageId,
                platformMessageId: messaging.message?.mid || undefined,
                kind: "image",
                imageUrl: cleanUrl(imgAtt?.payload?.url),
                contextImageUrl,
                adContext,
              });
            }
          } else if (adContext || contextImageUrl) {
            // Pure referral / reply with no text — still create an entry so AI can react
            messages.push({
              platform: "facebook",
              sender: messaging.sender?.id || "unknown",
              text: adContext ? "[Started chat from ad]" : "[Reply]",
              platformId: messaging.sender?.id || "",
              timestamp: new Date(
                messaging.timestamp || Date.now()
              ).toISOString(),
              pageId,
              platformMessageId: messaging.message?.mid || `ref-${Date.now()}`,
              kind: "text",
              contextImageUrl,
              adContext,
            });
          }
        }
      }
    } else if (platform === "instagram") {
      // Instagram DMs: entry.id is the Instagram Business Account ID (IGBA)
      // Messages arrive via entry.messaging[] similar to Facebook
      for (const entry of body.entry || []) {
        const igbaId = entry.id; // Instagram Business Account ID — matches stored page_id
        for (const messaging of entry.messaging || []) {
          if (messaging.message?.is_echo) continue;

          let text: string = messaging.message?.text || "";
          let kind: "text" | "image" = "text";
          let imageUrl: string | undefined;
          let contextImageUrl: string | undefined;
          let adContext: any = undefined;

          // Instagram Ad referral (CTM Instagram ads)
          const ref = messaging.referral || messaging.message?.referral;
          if (ref && (ref.ad_id || ref.source === "ADS" || ref.ref || ref.source_url)) {
            adContext = {
              adId: ref.ad_id,
              adTitle: ref.ads_context_data?.ad_title,
              adSourceUrl: ref.source_url,
              adImageUrl: cleanUrl(ref.ads_context_data?.photo_url),
              ref: ref.ref,
            };
          }

          // Reply-to context (customer replying to a story / image / post)
          const replyTo = messaging.message?.reply_to;
          if (replyTo) {
            const replyImg = (replyTo.attachments || []).find(
              (a: any) => a?.type === "image"
            );
            if (replyImg) contextImageUrl = cleanUrl(replyImg?.payload?.url);
            if (!contextImageUrl && replyTo.story?.url) {
              contextImageUrl = cleanUrl(replyTo.story.url);
            }
          }

          // Handle non-text message types
          if (!text && messaging.message?.attachments?.length > 0) {
            const att = messaging.message.attachments[0];
            if (att.type === "image") {
              text = "[Image]";
              kind = "image";
              imageUrl = cleanUrl(att?.payload?.url);
            } else if (att.type === "video") text = "[Video]";
            else if (att.type === "audio") text = "[Audio]";
            else if (att.type === "file") text = "[File]";
            else if (att.type === "sticker") text = "[Sticker]";
            else text = `[${att.type || "Attachment"}]`;
          }

          if (!text && replyTo) text = "[Story Reply]";
          if (!text && adContext) text = "[Started chat from ad]";

          if (!text) continue;

          messages.push({
            platform: "instagram",
            sender: messaging.sender?.id || "unknown",
            text,
            platformId: messaging.sender?.id || "",
            timestamp: new Date(
              messaging.timestamp || Date.now()
            ).toISOString(),
            pageId: igbaId,
            platformMessageId: messaging.message?.mid || undefined,
            kind,
            imageUrl,
            contextImageUrl,
            adContext,
          });
        }
        // Also handle Instagram changes-based format (some API versions)
        for (const change of entry.changes || []) {
          if (change.field === "messages" && change.value?.message) {
            const val = change.value;
            let text: string = val.message?.text || "";
            let kind: "text" | "image" = "text";
            let imageUrl: string | undefined;

            if (!text && val.message?.attachments?.length > 0) {
              const att = val.message.attachments[0];
              if (att.type === "image") {
                text = "[Image]";
                kind = "image";
                imageUrl = cleanUrl(att?.payload?.url);
              } else {
                text = att.type
                  ? `[${att.type.charAt(0).toUpperCase() + att.type.slice(1)}]`
                  : "[Attachment]";
              }
            }

            if (!text) continue;

            messages.push({
              platform: "instagram",
              sender: val.sender?.id || "unknown",
              text,
              platformId: val.sender?.id || "",
              timestamp: new Date(val.timestamp || Date.now()).toISOString(),
              pageId: igbaId,
              platformMessageId: val.message?.mid || undefined,
              kind,
              imageUrl,
            });
          }
        }
      }
    } else if (platform === "whatsapp") {
      for (const entry of body.entry || []) {
        const phoneNumberId =
          entry.changes?.[0]?.value?.metadata?.phone_number_id;
        for (const change of entry.changes || []) {
          const waDisplayName =
            change.value?.contacts?.[0]?.profile?.name ||
            change.value?.contacts?.[0]?.wa_id ||
            null;
          if (change.value?.messages) {
            for (const msg of change.value.messages) {
              if (msg.type === "text") {
                messages.push({
                  platform: "whatsapp",
                  sender: msg.from || "unknown",
                  text: msg.text?.body || "",
                  platformId: msg.from || "",
                  timestamp: new Date(
                    parseInt(msg.timestamp || "0") * 1000
                  ).toISOString(),
                  pageId: phoneNumberId,
                  platformMessageId: msg.id || undefined,
                  displayName: waDisplayName || undefined,
                  kind: "text",
                });
              } else if (msg.type === "image") {
                messages.push({
                  platform: "whatsapp",
                  sender: msg.from || "unknown",
                  text: "[Image]",
                  platformId: msg.from || "",
                  timestamp: new Date(
                    parseInt(msg.timestamp || "0") * 1000
                  ).toISOString(),
                  pageId: phoneNumberId,
                  platformMessageId: msg.id || undefined,
                  displayName: waDisplayName || undefined,
                  kind: "image",
                  mediaId: msg.image?.id || undefined,
                });
              }
            }
          }
        }
      }
    }

    console.log(`[${platform}] Parsed ${messages.length} message(s)`);

    // Process each incoming message
    for (const [msgIndex, msg] of messages.entries()) {
      // Find store + connection by page_id
      let storeId: string | null = null;
      let pageAccessToken: string | null = null;
      let connectionPageId: string | null = null;
      let connectionId: string | null = null;

      if (msg.pageId) {
        const { data: directConns, error: directConnError } = await supabase
          .from("platform_connections")
          .select("id, store_id, credentials, page_id, platform")
          .eq("platform", msg.platform as any)
          .eq("page_id", msg.pageId)
          .eq("status", "connected")
          .limit(2);

        if (directConnError) {
          console.error(
            `[${platform}] Failed to look up connection for page ${msg.pageId}:`,
            directConnError
          );
          continue;
        }

        if ((directConns?.length || 0) === 1) {
          const conn = directConns![0];
          connectionId = conn.id;
          storeId = conn.store_id;
          pageAccessToken =
            (conn.credentials as any)?.page_access_token || null;
          connectionPageId = conn.page_id;
          console.log(
            `[${platform}] Found connection for page ${msg.pageId} (platform: ${conn.platform}), store: ${storeId}`
          );
        } else if ((directConns?.length || 0) > 1) {
          console.error(
            `[${platform}] Multiple connected stores found for page ${msg.pageId}. Ignoring message to prevent cross-store routing.`
          );
          continue;
        } else if (platform === "instagram") {
          // Instagram webhooks may use either IG business account ID or the linked Facebook page ID.
          const { data: igConns, error: igConnError } = await supabase
            .from("platform_connections")
            .select("id, store_id, credentials, page_id, platform")
            .eq("platform", "instagram")
            .eq("status", "connected");

          if (igConnError) {
            console.error(
              `[${platform}] Failed Instagram fallback lookup for page ${msg.pageId}:`,
              igConnError
            );
            continue;
          }

          const matchingIgConns = (igConns || []).filter((c) => {
            const creds = c.credentials as any;
            return (
              creds?.facebook_page_id === msg.pageId ||
              creds?.instagram_business_account_id === msg.pageId ||
              c.page_id === msg.pageId
            );
          });

          if (matchingIgConns.length === 1) {
            const igConn = matchingIgConns[0];
            connectionId = igConn.id;
            storeId = igConn.store_id;
            pageAccessToken =
              (igConn.credentials as any)?.page_access_token || null;
            connectionPageId = igConn.page_id;
            console.log(
              `[${platform}] Found Instagram connection via fallback lookup, store: ${storeId}`
            );
          } else if (matchingIgConns.length > 1) {
            console.error(
              `[${platform}] Multiple Instagram stores matched page ${msg.pageId}. Ignoring message to prevent cross-store routing.`
            );
            continue;
          } else {
            console.warn(
              `[${platform}] No connected page found for page_id: ${msg.pageId}`
            );
          }
        } else {
          console.warn(
            `[${platform}] No connected page found for page_id: ${msg.pageId}`
          );
        }
      }

      if (!storeId) {
        console.warn(
          `[${platform}] Ignoring incoming message for unconnected page ${
            msg.pageId || "unknown"
          }`
        );
        continue;
      }

      // Find or create conversation within the resolved store only
      const { data: existingConversations, error: conversationLookupError } =
        await supabase
          .from("conversations")
          .select("*")
          .eq("store_id", storeId)
          .eq("platform_conversation_id", msg.platformId)
          .eq("platform", msg.platform)
          .order("created_at", { ascending: false })
          .limit(5);

      if (conversationLookupError) {
        console.error(
          `[${platform}] Error looking up conversation for store ${storeId}:`,
          conversationLookupError
        );
        continue;
      }

      let conversation =
        (existingConversations || []).find(
          (c: any) => msg.pageId && c.page_id === msg.pageId
        ) ||
        (existingConversations || []).find((c: any) => !c.page_id) ||
        (existingConversations || [])[0];

      if (!conversation) {
        const displayName =
          msg.displayName ||
          (msg.platform === "whatsapp" && msg.sender && msg.sender !== "unknown"
            ? msg.sender
            : null) ||
          (await fetchMetaDisplayName(
            msg.platform,
            msg.sender,
            pageAccessToken
          )) ||
          `Customer ${msg.platformId.slice(-4)}`;

        const { data: newConvo, error: convoErr } = await supabase
          .from("conversations")
          .insert({
            store_id: storeId,
            platform: msg.platform as any,
            platform_conversation_id: msg.platformId,
            customer_name: displayName,
            customer_phone: msg.platform === "whatsapp" ? msg.sender : null,
            last_message: msg.text,
            last_message_time: msg.timestamp,
            status: "open",
            unread: true,
            page_id: msg.pageId || "",
          })
          .select()
          .single();
        if (convoErr) {
          console.error("Error creating conversation:", convoErr);
          continue;
        }
        conversation = newConvo;
      } else {
        // Update page_id if missing, and improve placeholder customer_name if we can
        const updateData: any = {
          last_message: msg.text,
          last_message_time: msg.timestamp,
          unread: true,
        };
        if (msg.pageId && !conversation.page_id) {
          updateData.page_id = msg.pageId;
        }

        const currentName = (conversation.customer_name || "")
          .toString()
          .trim();
        const looksLikePlaceholder =
          currentName.length === 0 ||
          /^Customer\s+\w{1,10}$/i.test(currentName) ||
          currentName.toLowerCase() === "unknown";

        if (looksLikePlaceholder) {
          const betterName =
            msg.displayName ||
            (msg.platform === "whatsapp" &&
            msg.sender &&
            msg.sender !== "unknown"
              ? msg.sender
              : null) ||
            (await fetchMetaDisplayName(
              msg.platform,
              msg.sender,
              pageAccessToken
            ));
          if (betterName) updateData.customer_name = betterName;
        }

        await supabase
          .from("conversations")
          .update(updateData)
          .eq("id", conversation.id);
      }

      if (!conversation) continue;

      // Store customer message (idempotent) — compute ID early (used for storage path too)
      const inferredPlatformMessageId = msg.platformMessageId
        ? `${msg.platform}:${msg.platformMessageId}`
        : `${msg.platform}:fallback:${await stableId(
            JSON.stringify({
              platform: msg.platform,
              sender: msg.sender,
              platformId: msg.platformId,
              pageId: msg.pageId || "",
              timestamp: msg.timestamp,
              kind: msg.kind || "text",
              text: msg.text,
              mediaId: msg.mediaId || "",
              imageUrl: msg.imageUrl || "",
            })
          )}`;

      const { data: alreadySeen, error: seenErr } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("platform_message_id", inferredPlatformMessageId)
        .maybeSingle();

      if (seenErr) {
        console.error(`[${platform}] Failed dedupe lookup:`, seenErr);
        continue;
      }

      if (alreadySeen?.id) {
        console.log(
          `[${platform}] Duplicate webhook delivery ignored: ${inferredPlatformMessageId}`
        );
        continue;
      }

      // Prepare content to store + use for AI
      let storedContent = msg.text;
      if (msg.kind === "image") {
        let publicUrl: string | null = null;
        const safeId = safeStorageId(inferredPlatformMessageId);

        // Prefer re-hosting to Supabase Storage for reliable AI access
        if (msg.imageUrl) {
          const downloaded = await downloadBytes(msg.imageUrl);
          if (downloaded) {
            const ext = fileExtFromContentType(downloaded.contentType);
            const filePath = `chat/${conversation.id}/${safeId}.${ext}`;
            publicUrl = await uploadToStoreAssets(
              supabase,
              filePath,
              downloaded.bytes,
              downloaded.contentType
            );
          }
        } else if (msg.mediaId && pageAccessToken) {
          const wa = await fetchWhatsAppMediaUrl(msg.mediaId, pageAccessToken);
          if (wa?.url) {
            const downloaded = await downloadBytes(wa.url, {
              Authorization: `Bearer ${pageAccessToken}`,
            });
            if (downloaded) {
              const ext = fileExtFromContentType(
                wa.mime_type || downloaded.contentType
              );
              const filePath = `chat/${conversation.id}/${safeId}.${ext}`;
              publicUrl = await uploadToStoreAssets(
                supabase,
                filePath,
                downloaded.bytes,
                wa.mime_type || downloaded.contentType
              );
            }
          }
        }

        if (publicUrl) {
          storedContent = `📷 ${publicUrl}`;
        } else {
          storedContent = "[Image]";
        }
      }

      // ─── Extra context: replied-to image OR Facebook/Instagram ad referral ───
      // Re-host so the AI vision pipeline can fetch them reliably.
      let contextImagePublicUrl: string | null = null;
      const candidateContextUrl =
        msg.contextImageUrl || msg.adContext?.adImageUrl;
      if (candidateContextUrl) {
        try {
          const safeId = safeStorageId(inferredPlatformMessageId) + "-ctx";
          const downloaded = await downloadBytes(candidateContextUrl);
          if (downloaded) {
            const ext = fileExtFromContentType(downloaded.contentType);
            const filePath = `chat/${conversation.id}/${safeId}.${ext}`;
            contextImagePublicUrl = await uploadToStoreAssets(
              supabase,
              filePath,
              downloaded.bytes,
              downloaded.contentType
            );
          }
        } catch (e) {
          console.error(`[${platform}] Failed to rehost context image:`, e);
        }
      }

      // Append a hidden context block parsed by generateAIReply().
      const ctxParts: string[] = [];
      if (contextImagePublicUrl)
        ctxParts.push(`context_image=${contextImagePublicUrl}`);
      if (msg.adContext?.adTitle)
        ctxParts.push(`ad_title=${msg.adContext.adTitle}`);
      if (msg.adContext?.adId) ctxParts.push(`ad_id=${msg.adContext.adId}`);
      if (msg.adContext?.adSourceUrl)
        ctxParts.push(`ad_url=${msg.adContext.adSourceUrl}`);
      if (ctxParts.length > 0) {
        storedContent = `${storedContent}\n\n[CTX] ${ctxParts.join(" | ")}`;
      }

      const { data: insertedMsg, error: insertCustomerErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          sender: "customer",
          content: storedContent,
          platform_message_id: inferredPlatformMessageId,
        })
        .select("id, created_at")
        .single();

      if (insertCustomerErr) {
        console.error(
          `[${platform}] Failed to insert customer message:`,
          insertCustomerErr
        );
        continue;
      }

      if (hasLaterMessageInSameConversation(messages, msgIndex)) {
        console.log(
          `[${platform}] Deferring AI reply for ${msg.sender}; a later message in the same burst is still being processed.`
        );
        continue;
      }

      // Ensure conversation list reflects images (not just "[Image]")
      await supabase
        .from("conversations")
        .update({
          last_message: msg.kind === "image" ? storedContent : msg.text,
          last_message_time: msg.timestamp,
          unread: true,
        })
        .eq("id", conversation.id);

      // ─── AI Auto-Reply ───
      const [storeRes, catalogRes, aiSettingsRes, historyRes, ordersRes] =
        await Promise.all([
          supabase.from("stores").select("*").eq("id", storeId).single(),
          supabase
            .from("products")
            .select("category, price")
            .eq("store_id", storeId)
            .eq("active", true),
          supabase
            .from("ai_settings")
            .select("*")
            .eq("store_id", storeId)
            .maybeSingle(),
          supabase
            .from("messages")
            .select("sender, content, created_at")
            .eq("conversation_id", conversation.id)
            .order("created_at", { ascending: true })
            .limit(20),
          supabase
            .from("orders")
            .select(
              "order_number, status, customer_name, items, total, phone, address, notes"
            )
            .eq("conversation_id", conversation.id)
            .in("status", ["pending", "confirmed", "processing"])
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      const storeInfo = storeRes.data;
      const aiSettings = aiSettingsRes.data;
      const history = historyRes.data || [];
      const existingOrders = ordersRes.data || [];

      // Build lightweight catalog summary (categories + counts) instead of full product list
      const catalogProducts = catalogRes.data || [];
      const catMap: Record<
        string,
        { count: number; min: number; max: number }
      > = {};
      for (const p of catalogProducts) {
        const cat = p.category || "General";
        if (!catMap[cat])
          catMap[cat] = { count: 0, min: p.price, max: p.price };
        catMap[cat].count++;
        catMap[cat].min = Math.min(catMap[cat].min, p.price);
        catMap[cat].max = Math.max(catMap[cat].max, p.price);
      }
      const catalogSummary =
        catalogProducts.length === 0
          ? "No products available yet."
          : `Total products: ${
              catalogProducts.length
            }\nCategories:\n${Object.entries(catMap)
              .map(
                ([cat, info]) =>
                  `- ${cat}: ${info.count} products (${info.min} - ${info.max})`
              )
              .join(
                "\n"
              )}\n\nIMPORTANT: Use search_products tool to get specific product details. Do NOT guess product names or prices.`;

      if (aiSettings?.auto_reply === false) {
        console.log("Auto-reply disabled for store:", storeId);
        continue;
      }

      // Check per-conversation AI auto-reply toggle
      if (conversation.ai_auto_reply === false) {
        console.log(
          "AI auto-reply disabled for conversation:",
          conversation.id
        );
        continue;
      }

      // ─── Per-customer quiet-window batching ───
      // Keep waiting until THIS conversation has been quiet for 5s, then only the
      // worker owning the latest customer message may answer.
      const QUIET_MS = 5000;
      const MAX_TOTAL_WAIT_MS = 30000;
      const POLL_MS = 500;
      const myMsgId = insertedMsg?.id;
      const myCreatedAt = msg.timestamp;

      let shouldProceed = true;
      let quietForMs = 0;
      const startedAt = Date.now();

      while (Date.now() - startedAt < MAX_TOTAL_WAIT_MS) {
        const [{ data: latestCustomer }, { data: latestAi }] = await Promise.all([
          supabase
            .from("messages")
            .select("id, created_at")
            .eq("conversation_id", conversation.id)
            .eq("sender", "customer")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("messages")
            .select("id, created_at")
            .eq("conversation_id", conversation.id)
            .eq("sender", "ai")
            .gte("created_at", myCreatedAt)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (latestAi?.id) {
          shouldProceed = false;
          console.log(
            `[${platform}] AI reply already sent for this burst; skipping duplicate response.`
          );
          break;
        }

        if (!latestCustomer?.id) {
          shouldProceed = false;
          break;
        }

        if (latestCustomer.id !== myMsgId) {
          shouldProceed = false;
          console.log(
            `[${platform}] Newer customer message detected (latest=${latestCustomer.id}, mine=${myMsgId}) — yielding to newer worker.`
          );
          break;
        }

        quietForMs = Date.now() - new Date(latestCustomer.created_at).getTime();
        if (quietForMs >= QUIET_MS) break;

        await new Promise((r) => setTimeout(r, POLL_MS));
      }

      if (!shouldProceed) continue;

      if (quietForMs < QUIET_MS) {
        console.log(
          `[${platform}] Quiet window not reached (${quietForMs}ms); skipping reply.`
        );
        continue;
      }


      // Re-fetch conversation history after debounce to include all batched messages
      const { data: freshHistory } = await supabase
        .from("messages")
        .select("sender, content, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .limit(20);

      // Combine the latest consecutive customer messages into one prompt.
      const allHistory = freshHistory || history;
      const pendingBurst = collectPendingCustomerBurst(allHistory);
      const burstInput = extractBurstInput(pendingBurst);
      const combinedCustomerMessage =
        burstInput.combinedText ||
        pendingBurst
          .map((entry) => stripMessageContext(entry.content))
          .filter((entry) => entry && entry.trim().length > 0)
          .join("\n");

      const aiResult = await generateAIReply(
        combinedCustomerMessage,
        storeInfo,
        catalogSummary,
        aiSettings,
        allHistory,
        supabase,
        storeId,
        conversation.id,
        msg.platform,
        existingOrders
      );

      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender: "ai",
        content: aiResult.text,
        platform_message_id: null,
      });

      await supabase
        .from("conversations")
        .update({
          last_message: aiResult.text,
          last_message_time: new Date().toISOString(),
        })
        .eq("id", conversation.id);

      // Send reply back to customer — only use token from DB (platform_connections)
      if (pageAccessToken) {
        console.log(
          `[${platform}] Sending reply to ${msg.sender} using stored page token`
        );
        await sendMetaReply(
          msg.platform,
          msg.sender,
          aiResult.text,
          pageAccessToken,
          connectionPageId || msg.pageId || ""
        );

        // Send product images if any
        for (const img of aiResult.images) {
          try {
            await sendMetaImage(
              msg.platform,
              msg.sender,
              img.url,
              img.caption,
              pageAccessToken,
              connectionPageId || msg.pageId || ""
            );
          } catch (imgErr) {
            console.error(`[${platform}] Failed to send image:`, imgErr);
          }
        }
      } else {
        console.warn(
          `[${platform}] No page access token found in platform_connections for page ${msg.pageId}, cannot send reply`
        );
      }

      // Update message count and last_synced_at
      if (connectionId || connectionPageId || msg.pageId) {
        try {
          let currentCount = 0;

          if (connectionId) {
            currentCount = await supabase
              .from("platform_connections")
              .select("message_count")
              .eq("id", connectionId)
              .eq("status", "connected")
              .single()
              .then((r) => r.data?.message_count || 0);

            await supabase
              .from("platform_connections")
              .update({
                message_count: currentCount + 1,
                last_synced_at: new Date().toISOString(),
              })
              .eq("id", connectionId)
              .eq("status", "connected");
          } else {
            const lookupPageId = connectionPageId || msg.pageId;
            currentCount = await supabase
              .from("platform_connections")
              .select("message_count")
              .eq("store_id", storeId)
              .eq("platform", msg.platform as any)
              .eq("page_id", lookupPageId)
              .eq("status", "connected")
              .single()
              .then((r) => r.data?.message_count || 0);

            await supabase
              .from("platform_connections")
              .update({
                message_count: currentCount + 1,
                last_synced_at: new Date().toISOString(),
              })
              .eq("store_id", storeId)
              .eq("platform", msg.platform as any)
              .eq("page_id", lookupPageId)
              .eq("status", "connected");
          }
        } catch (countErr) {
          console.warn(
            `[${platform}] Failed to update platform_connections stats:`,
            countErr
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: messages.length }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
