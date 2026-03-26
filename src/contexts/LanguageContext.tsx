import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Language = "en" | "ar";
type Dir = "ltr" | "rtl";

interface LanguageContextType {
  language: Language;
  dir: Dir;
  t: (key: string) => string;
  setLanguage: (lang: Language) => void;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    dashboard: "Dashboard",
    inbox: "Inbox",
    orders: "Orders",
    products: "Products",
    store_settings: "Store Settings",
    platforms: "Platforms",
    reports: "Reports",
    ai_settings: "AI Settings",
    notifications: "Notifications",
    menu: "Menu",
    search: "Search...",
    sign_out: "Sign out",
    store: "Store",
    active: "Active",
    pending: "Pending",
    suspended: "Suspended",
    no_store: "No store",
    add_product: "Add Product",
    edit_product: "Edit Product",
    save_changes: "Save Changes",
    cancel: "Cancel",
    delete: "Delete",
    create: "Create",
    update: "Update",
    saving: "Saving...",
    loading: "Loading...",
    select_conversation: "Select a conversation",
    no_conversations: "No conversations yet",
    no_messages: "No messages yet",
    type_reply: "Type a reply...",
    mark_resolved: "Mark Resolved",
    all: "All",
    connected: "Connected",
    not_connected: "Not Connected",
    messages: "Messages",
    last_synced: "Last Synced",
    connected_platforms: "Connected Platforms",
    manage_platforms: "Manage your messaging platform connections",
    store_information: "Store Information",
    business_hours: "Business Hours",
    delivery_information: "Delivery Information",
    return_policy: "Return Policy",
    no_products: "No products yet. Add your first product to get started.",
    low_stock: "Low Stock",
    out_of_stock: "Out of Stock",
    inactive: "Inactive",
  },
  ar: {
    dashboard: "لوحة التحكم",
    inbox: "صندوق الوارد",
    orders: "الطلبات",
    products: "المنتجات",
    store_settings: "إعدادات المتجر",
    platforms: "المنصات",
    reports: "التقارير",
    ai_settings: "إعدادات الذكاء الاصطناعي",
    notifications: "الإشعارات",
    menu: "القائمة",
    search: "بحث...",
    sign_out: "تسجيل الخروج",
    store: "المتجر",
    active: "نشط",
    pending: "قيد الانتظار",
    suspended: "معلق",
    no_store: "لا يوجد متجر",
    add_product: "إضافة منتج",
    edit_product: "تعديل المنتج",
    save_changes: "حفظ التغييرات",
    cancel: "إلغاء",
    delete: "حذف",
    create: "إنشاء",
    update: "تحديث",
    saving: "جاري الحفظ...",
    loading: "جاري التحميل...",
    select_conversation: "اختر محادثة",
    no_conversations: "لا توجد محادثات بعد",
    no_messages: "لا توجد رسائل بعد",
    type_reply: "اكتب ردك...",
    mark_resolved: "تم الحل",
    all: "الكل",
    connected: "متصل",
    not_connected: "غير متصل",
    messages: "الرسائل",
    last_synced: "آخر مزامنة",
    connected_platforms: "المنصات المتصلة",
    manage_platforms: "إدارة اتصالات منصات المراسلة",
    store_information: "معلومات المتجر",
    business_hours: "ساعات العمل",
    delivery_information: "معلومات التوصيل",
    return_policy: "سياسة الإرجاع",
    no_products: "لا توجد منتجات بعد. أضف أول منتج للبدء.",
    low_stock: "مخزون منخفض",
    out_of_stock: "نفذ المخزون",
    inactive: "غير نشط",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem("app-language") as Language) || "en";
  });

  const dir: Dir = language === "ar" ? "rtl" : "ltr";

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app-language", lang);
  };

  const t = (key: string) => translations[language][key] || key;

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [language, dir]);

  return (
    <LanguageContext.Provider value={{ language, dir, t, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
