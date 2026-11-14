export type StoreInfo = Partial<Record<"name" | "description" | "category" | "address" | "phone" | "email" | "logo_url" | "cover_image_url", string>>;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function mapProfile(platform: "facebook" | "instagram", data: Record<string, any>): StoreInfo {
  const result: StoreInfo = {};
  const values: StoreInfo = platform === "instagram" ? {
    name: text(data.name) || text(data.username), description: text(data.biography), logo_url: text(data.profile_picture_url),
  } : {
    name: text(data.name), description: text(data.description) || text(data.about), category: text(data.category),
    phone: text(data.phone), email: Array.isArray(data.emails) ? data.emails.find((v: unknown) => text(v)) : undefined,
    address: data.location ? [data.location.street, data.location.city, data.location.state, data.location.zip, data.location.country].map(text).filter(Boolean).join(", ") : undefined,
    logo_url: data.picture?.data?.is_silhouette ? undefined : text(data.picture?.data?.url), cover_image_url: text(data.cover?.source),
  };
  for (const [key, value] of Object.entries(values)) if (value) result[key as keyof StoreInfo] = value;
  return result;
}

export function canImportConnection(ownerId: string, userId: string, storeId: string, connectionStoreId: string): boolean {
  return ownerId === userId && storeId === connectionStoreId;
}