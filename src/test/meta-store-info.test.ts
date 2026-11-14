import { describe, expect, it } from "vitest";
import { canImportConnection, mapProfile } from "../../supabase/functions/meta-store-info/profile";

describe("connected-page store import", () => {
  it("maps factual Facebook contact and branding fields", () => {
    expect(mapProfile("facebook", { name: "My Shop", about: "Clothes", phone: "0591234567", emails: ["shop@example.com"], location: { street: "Main Street", city: "Nablus" }, picture: { data: { url: "https://example.com/logo.jpg" } } })).toEqual({ name: "My Shop", description: "Clothes", phone: "0591234567", email: "shop@example.com", address: "Main Street, Nablus", logo_url: "https://example.com/logo.jpg" });
  });
  it("imports Instagram biography without inventing unavailable contact or policy information", () => {
    expect(mapProfile("instagram", { username: "shop", biography: "أزياء", phone: "not-an-instagram-field" })).toEqual({ name: "shop", description: "أزياء" });
  });
  it("omits missing Facebook values so existing store information is preserved", () => {
    const preview = mapProfile("facebook", { name: "Shop", about: "", picture: { data: { url: "default.jpg", is_silhouette: true } } });
    expect({ phone: "existing", description: "existing description", ...preview }).toEqual({ name: "Shop", phone: "existing", description: "existing description" });
  });
  it("blocks other owners and connections from other stores", () => {
    expect(canImportConnection("owner", "owner", "store", "store")).toBe(true);
    expect(canImportConnection("owner", "other", "store", "store")).toBe(false);
    expect(canImportConnection("owner", "owner", "store", "other-store")).toBe(false);
  });
});