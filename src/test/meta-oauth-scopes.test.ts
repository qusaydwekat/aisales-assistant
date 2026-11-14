import { describe, expect, it } from "vitest";
import { getMetaConnectionScopes } from "../../supabase/functions/meta-oauth/scope-policy";

describe("Meta connection permissions", () => {
  it.each(["facebook", "instagram", "whatsapp"])("does not request app-rejected import permissions for %s", (platform) => {
    const scopes = getMetaConnectionScopes(platform);
    expect(scopes).not.toContain("pages_read_engagement");
    expect(scopes).not.toContain("catalog_management");
  });
  it("preserves Facebook messaging and subscription permissions", () => {
    expect(getMetaConnectionScopes("facebook")).toEqual(["pages_show_list", "pages_messaging", "pages_manage_metadata"]);
  });
  it("preserves Instagram messaging and identity permissions", () => {
    expect(getMetaConnectionScopes("instagram")).toEqual(["pages_show_list", "pages_messaging", "pages_manage_metadata", "instagram_manage_messages", "instagram_basic"]);
  });
  it("preserves WhatsApp business permissions", () => {
    expect(getMetaConnectionScopes("whatsapp")).toEqual(["business_management", "whatsapp_business_management", "whatsapp_business_messaging"]);
  });
});