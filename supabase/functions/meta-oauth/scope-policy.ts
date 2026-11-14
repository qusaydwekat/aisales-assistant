// Import-only permissions must not block the existing messaging connection.
// Enable additional permissions only after confirming the app supports them in Meta.
export function getMetaConnectionScopes(platform: string, purpose = "messaging"): string[] {
  if (platform === "whatsapp") {
    return ["business_management", "whatsapp_business_management", "whatsapp_business_messaging"];
  }
  const scopes = ["pages_show_list", "pages_messaging", "pages_manage_metadata"];
  if (platform === "instagram") {
    scopes.push("instagram_manage_messages", "instagram_basic");
  }
  if (platform === "facebook" && purpose === "post-import") {
    scopes.push("pages_read_engagement");
  }
  return scopes;
}