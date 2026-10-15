import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { startTypingSession } from "../_shared/typing-session.ts";
import { corsHeaders, STORE_CACHE_TTL_MS, IMAGE_PENDING_MARK, AI_SETTINGS_CACHE_TTL_MS, _storeCache, _aiSettingsCache, getCachedStore, getCachedAISettings, verifyMetaSignature, toHex, stableId, fileExtFromContentType, safeStorageId, cleanUrl, uploadToStoreAssets, downloadBytes, fetchWhatsAppMediaUrl, detectPlatform } from "./shared.ts";
import { sendTypingIndicator, splitReplyIntoChunks, sendMetaReply, sendMetaImage, sendMetaReplyWithRetry, fetchMetaDisplayName } from "./meta-client.ts";
import { detectLanguage, isStoreOpenNow, detectEmotion, buildHandoffSummary, computeQualityScore } from "./conversation-intel.ts";
import { ORDER_TOOL, CANCEL_ORDER_TOOL, UPDATE_ORDER_TOOL, ADD_ORDER_NOTE_TOOL, CHECK_ORDER_STATUS_TOOL, SEND_PRODUCT_IMAGES_TOOL, SEARCH_PRODUCTS_TOOL, LIST_CATEGORIES_TOOL, GET_ACTIVE_PROMOTIONS_TOOL, APPLY_DISCOUNT_CODE_TOOL, FLAG_KNOWLEDGE_GAP_TOOL, REGISTER_RESTOCK_INTEREST_TOOL, GET_STORE_CONTEXT_TOOL, ATTR_WEIGHTS, scoreProductAttributes, executeSearchProducts, executeListCategories, fetchActivePromotions, executeGetActivePromotions, executeApplyDiscountCode, executeFlagKnowledgeGap, executeRegisterRestockInterest, executeGetStoreContext } from "./ai-tools.ts";
import { sanitizeAIResponse, parseImageUrlFromMessageContent, parseMessageContext, stripMessageContext, collectPendingCustomerBurst, collectUnansweredCustomerMessages, normalizeForQuestionDetection, hasConcreteCustomerQuestion, isGenericGreetingOnlyResponse, buildStoreInfoQuestionReply, hasLaterMessageInSameConversation, compareIncomingMessages, extractBurstInput, looksLikeCancelOrderRequest, buildCancelOrderReply, isFallbackLikeResponse, logPromptInChunks, serializeAIMessageForLog, looksLikeReferentialFollowUp, collectRecentReferenceImages } from "./burst-collector.ts";
import { generateAIReply, callResponsesAsChat, pruneEmptyOptionalArgs, pickFallbackModel } from "./ai-agent.ts";

export async function findRecentDuplicateOrder(
  supabase: any,
  conversationId: string,
  items: any[],
  windowSeconds: number
): Promise<{ order_number: string; status: string; total: number } | null> {
  if (!conversationId || !Array.isArray(items) || items.length === 0) return null;
  const sinceIso = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { data: recent } = await supabase
    .from("orders")
    .select("order_number, status, total, items, created_at")
    .eq("conversation_id", conversationId)
    .gte("created_at", sinceIso)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(5);
  if (!recent?.length) return null;

  const sig = (arr: any[]) =>
    (arr || [])
      .map((i: any) => `${(i.product_name || i.name || "").toLowerCase().trim()}|${Number(i.quantity || 1)}`)
      .sort()
      .join("::");

  const incomingSig = sig(items);
  if (!incomingSig) return null;

  for (const o of recent) {
    if (sig(o.items || []) === incomingSig) {
      return { order_number: o.order_number, status: o.status, total: o.total };
    }
  }
  return null;
}

export async function executeCreateOrder(
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

  // ─── Fix 5: Duplicate-order prevention ───
  // Look up store's settings + working hours in one go.
  const [aiSettingsRes, storeRes] = await Promise.all([
    supabase
      .from("ai_settings")
      .select("duplicate_order_guard_enabled, duplicate_order_window_seconds, out_of_hours_enabled")
      .eq("store_id", storeId)
      .maybeSingle(),
    supabase
      .from("stores")
      .select("user_id, name, working_hours")
      .eq("id", storeId)
      .single(),
  ]);

  const dupGuardEnabled = aiSettingsRes?.data?.duplicate_order_guard_enabled !== false;
  const dupWindow = Math.max(30, Number(aiSettingsRes?.data?.duplicate_order_window_seconds) || 300);

  if (dupGuardEnabled) {
    const dup = await findRecentDuplicateOrder(supabase, conversationId, args.items || [], dupWindow);
    if (dup) {
      console.log(`Duplicate order skipped — existing ${dup.order_number} (${dup.status})`);
      return JSON.stringify({
        success: true,
        order_number: dup.order_number,
        total: dup.total,
        items_count: (args.items || []).length,
        duplicate_of: dup.order_number,
        message: `An identical order was just created (${dup.order_number}) — confirming that one instead of creating a duplicate.`,
      });
    }
  }

  // ─── Fix 9: Out-of-hours flagging ───
  const ooEnabled = aiSettingsRes?.data?.out_of_hours_enabled !== false;
  const { isOpen, hasSchedule } = isStoreOpenNow(storeRes?.data?.working_hours);
  const outsideHours = ooEnabled && hasSchedule && !isOpen;

  // ─── Item integrity guard: detect AI tool-call mistakes BEFORE writing the order ───
  // Common failure: AI reuses the same product_id for multiple items with different product_names
  // (e.g. customer wanted 2 different products but AI passed the first product's UUID twice).
  {
    const items = Array.isArray(args.items) ? args.items : [];
    const idToNames: Record<string, Set<string>> = {};
    for (const it of items) {
      if (!it?.product_id) continue;
      const name = String(it.product_name || "").trim().toLowerCase();
      if (!name) continue;
      (idToNames[it.product_id] ||= new Set()).add(name);
    }
    const conflicts = Object.entries(idToNames)
      .filter(([, names]) => names.size > 1)
      .map(([pid, names]) => ({ product_id: pid, names: Array.from(names) }));
    if (conflicts.length > 0) {
      console.warn("create_order rejected — same product_id used for different product names:", conflicts);
      return JSON.stringify({
        success: false,
        error:
          "ITEM_MISMATCH: You used the same product_id for items with different product_name values. " +
          "Each distinct product MUST have its own product_id obtained from a search_products result. " +
          "Call search_products again to get the correct UUID for each item, then retry create_order.",
        conflicts,
      });
    }
  }

  // ─── Nameless mode: build product_snapshot to preserve visual identity at order time ───
  let productSnapshot: any = null;
  try {
    const productIds = (args.items || [])
      .map((it: any) => it.product_id)
      .filter((id: any) => typeof id === "string" && id.length > 0);
    if (productIds.length > 0) {
      const { data: snapProducts } = await supabase
        .from("products")
        .select(
          "id,name,price,images,auto_description,type,color,pattern,style,material,fit,occasion,sleeve,neckline,length"
        )
        .in("id", productIds)
        .eq("store_id", storeId);
      if (snapProducts && snapProducts.length > 0) {
        productSnapshot = {
          captured_at: new Date().toISOString(),
          items: snapProducts.map((p: any) => ({
            product_id: p.id,
            name: p.name,
            price: p.price,
            image_url: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null,
            auto_description: p.auto_description || null,
            attributes: {
              type: p.type || null,
              color: p.color || [],
              pattern: p.pattern || null,
              style: p.style || null,
              material: p.material || null,
              fit: p.fit || null,
              occasion: p.occasion || [],
              sleeve: p.sleeve || null,
              neckline: p.neckline || null,
              length: p.length || null,
            },
          })),
        };
      }
    }
  } catch (snapErr) {
    console.warn("product_snapshot build failed (non-fatal):", snapErr);
  }

  // Enrich items with image (from snapshot) so the Orders UI can render the product photo,
  // and keep variant text on the item itself.
  const snapshotById: Record<string, any> = {};
  if (productSnapshot?.items) {
    for (const it of productSnapshot.items) snapshotById[it.product_id] = it;
  }
  const enrichedItems = (args.items || []).map((it: any) => {
    const snap = it.product_id ? snapshotById[it.product_id] : null;
    return {
      ...it,
      variant: it.variant || null,
      image: it.image || snap?.image_url || null,
    };
  });

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      store_id: storeId,
      conversation_id: conversationId,
      customer_name: args.customer_name,
      phone: args.phone || "",
      address: args.address || "",
      items: enrichedItems,
      total,
      notes: args.notes || "",
      platform,
      status: "pending",
      out_of_hours: outsideHours,
      pending_confirmation: outsideHours,
      product_snapshot: productSnapshot,
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

  const store = storeRes?.data;
  if (store?.user_id) {
    await supabase.from("notifications").insert({
      user_id: store.user_id,
      title: `New order ${order.order_number}${outsideHours ? " (after-hours)" : ""}`,
      description: outsideHours
        ? `${args.customer_name} placed an after-hours order — needs your confirmation. Total: ${total}`
        : `${args.customer_name} placed an order for ${args.items.length} item(s) — Total: ${total}`,
      type: "order",
    });
  }

  console.log(`Order created: ${order.order_number}, total: ${total}, outside_hours: ${outsideHours}`);
  return JSON.stringify({
    success: true,
    order_number: order.order_number,
    total,
    items_count: args.items.length,
    pending_confirmation: outsideHours,
  });
}

export async function executeCancelOrder(
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

export async function executeUpdateOrder(
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

  // ─── Auto-spawn behavior ───
  // If the existing order is already shipped/delivered (no longer modifiable)
  // AND the customer is trying to ADD/CHANGE items, create a NEW order instead
  // of refusing. Address/phone/name updates on a shipped order are ignored
  // (they wouldn't help anyway), but item changes become a fresh order.
  if (["delivered", "shipped"].includes(order.status)) {
    const wantsItemChange = Array.isArray(args.items) && args.items.length > 0;
    if (wantsItemChange) {
      console.log(
        `Order ${order.order_number} is ${order.status}; spawning a NEW order for the requested items.`
      );
      // Reuse customer details from the shipped order if not re-provided.
      const newArgs = {
        customer_name: args.customer_name || order.customer_name,
        phone: args.phone || order.phone || "",
        address: args.address || order.address || "",
        items: args.items,
        notes: args.notes || `Follow-up to ${order.order_number} (already ${order.status}).`,
      };
      const created = await executeCreateOrder(
        supabase,
        storeId,
        conversationId,
        order.platform || "facebook",
        newArgs
      );
      // Wrap so the AI knows it was a NEW order, not an update.
      try {
        const parsed = JSON.parse(created);
        return JSON.stringify({
          ...parsed,
          spawned_new_order: true,
          previous_order_number: order.order_number,
          previous_order_status: order.status,
          message: `Previous order ${order.order_number} is already ${order.status} and can't be modified. Created a NEW order ${parsed.order_number} for the customer — tell them their previous order is on its way and confirm the new order separately.`,
        });
      } catch {
        return created;
      }
    }
    return JSON.stringify({
      success: false,
      error: `Order ${order.order_number} is ${order.status} and cannot be updated.`,
    });
  }
  if (order.status === "cancelled") {
    return JSON.stringify({
      success: false,
      error: `Order ${order.order_number} is cancelled and cannot be updated.`,
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

export async function executeAddOrderNote(
  supabase: any,
  storeId: string,
  conversationId: string,
  args: any
) {
  const noteText = (args.note || "").toString().trim();
  if (!noteText) {
    return JSON.stringify({ success: false, error: "Note text is required." });
  }

  let query = supabase
    .from("orders")
    .select("id, order_number, status, notes")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (args.order_number) {
    query = supabase
      .from("orders")
      .select("id, order_number, status, notes")
      .eq("store_id", storeId)
      .eq("order_number", args.order_number)
      .limit(1);
  } else {
    query = query.eq("conversation_id", conversationId);
  }

  const { data: orders, error } = await query;
  if (error || !orders || orders.length === 0) {
    return JSON.stringify({
      success: false,
      error: "No order found to add a note to.",
    });
  }

  const order = orders[0];
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const prefix = `[AI • ${timestamp}]`;
  const newEntry = `${prefix} ${noteText}`;
  const combined = order.notes && order.notes.trim().length > 0
    ? `${order.notes}\n${newEntry}`
    : newEntry;

  const { error: updateErr } = await supabase
    .from("orders")
    .update({ notes: combined })
    .eq("id", order.id);

  if (updateErr) {
    console.error("Add order note error:", updateErr);
    return JSON.stringify({ success: false, error: updateErr.message });
  }

  console.log(`Added note to ${order.order_number}: ${newEntry}`);
  return JSON.stringify({
    success: true,
    order_number: order.order_number,
    note_added: newEntry,
  });
}

export async function executeCheckOrderStatus(
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

// ─── Visual attribute scoring (nameless-product mode) ───
// Weights from the build spec: type 30, color 25, pattern 15, style 10,
// fit 8, material 7, occasion 5  (total = 100)
