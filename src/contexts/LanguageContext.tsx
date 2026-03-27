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
    privacy_policy: "Privacy Policy",
    terms_of_use: "Terms of Use",
    disclaimer: "Disclaimer",
    last_updated: "Last updated: March 27, 2026",
    pp_s1_title: "1. Information We Collect",
    pp_s1_text: "We collect information you provide directly, such as your name, email address, phone number, and store details when you create an account. We also collect usage data, device information, and cookies automatically.",
    pp_s2_title: "2. How We Use Your Information",
    pp_s2_text: "We use your information to provide and improve our services, process orders, send notifications, respond to inquiries, and ensure platform security. We may also use aggregated data for analytics.",
    pp_s3_title: "3. Data Sharing",
    pp_s3_text: "We do not sell your personal data. We may share information with service providers who assist in operating our platform, or when required by law. Third-party integrations (Facebook, Instagram, WhatsApp) are governed by their own privacy policies.",
    pp_s4_title: "4. Data Security",
    pp_s4_text: "We implement industry-standard security measures to protect your data, including encryption, secure servers, and access controls. However, no method of transmission over the internet is 100% secure.",
    pp_s5_title: "5. Your Rights",
    pp_s5_text: "You have the right to access, update, or delete your personal information at any time. You may also opt out of marketing communications. Contact us to exercise these rights.",
    pp_s6_title: "6. Contact Us",
    pp_s6_text: "If you have questions about this Privacy Policy, please contact us through the platform's support channels.",
    tou_s1_title: "1. Acceptance of Terms",
    tou_s1_text: "By accessing or using our platform, you agree to be bound by these Terms of Use. If you do not agree, you may not use the service.",
    tou_s2_title: "2. Account Responsibilities",
    tou_s2_text: "You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized access. You must provide accurate and complete information when creating an account.",
    tou_s3_title: "3. Acceptable Use",
    tou_s3_text: "You agree not to use the platform for any unlawful purpose, to transmit harmful content, to interfere with the platform's operation, or to violate any applicable laws or regulations.",
    tou_s4_title: "4. Intellectual Property",
    tou_s4_text: "All content, features, and functionality of the platform are owned by us and are protected by copyright, trademark, and other intellectual property laws. You retain ownership of content you upload.",
    tou_s5_title: "5. Limitation of Liability",
    tou_s5_text: "To the fullest extent permitted by law, we shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform.",
    tou_s6_title: "6. Termination",
    tou_s6_text: "We reserve the right to suspend or terminate your access to the platform at our discretion, with or without notice, for conduct that violates these terms or is harmful to other users.",
    tou_s7_title: "7. Changes to Terms",
    tou_s7_text: "We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance of the updated terms.",
    disc_s1_title: "1. General Information",
    disc_s1_text: "The information provided on this platform is for general informational purposes only. While we strive to keep the information accurate and up to date, we make no representations or warranties of any kind about the completeness, accuracy, or reliability of the information.",
    disc_s2_title: "2. AI-Generated Content",
    disc_s2_text: "Our platform uses artificial intelligence to assist with customer conversations, order processing, and recommendations. AI-generated responses may not always be accurate. Store owners are responsible for reviewing and confirming AI-assisted actions, including orders and customer communications.",
    disc_s3_title: "3. Third-Party Integrations",
    disc_s3_text: "Our platform integrates with third-party services such as Facebook, Instagram, and WhatsApp. We are not responsible for the content, privacy practices, or availability of these external services. Use of third-party services is subject to their respective terms and conditions.",
    disc_s4_title: "4. No Professional Advice",
    disc_s4_text: "Nothing on this platform constitutes professional, legal, financial, or business advice. You should consult with appropriate professionals before making business decisions based on information provided through our platform.",
    disc_s5_title: "5. Limitation of Responsibility",
    disc_s5_text: "We shall not be held responsible for any losses, damages, or issues arising from the use of our platform, including but not limited to order errors, miscommunications, or service interruptions.",
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
    privacy_policy: "سياسة الخصوصية",
    terms_of_use: "شروط الاستخدام",
    disclaimer: "إخلاء المسؤولية",
    last_updated: "آخر تحديث: 27 مارس 2026",
    pp_s1_title: "1. المعلومات التي نجمعها",
    pp_s1_text: "نجمع المعلومات التي تقدمها مباشرة، مثل اسمك وعنوان بريدك الإلكتروني ورقم هاتفك وتفاصيل متجرك عند إنشاء حساب. كما نجمع بيانات الاستخدام ومعلومات الجهاز وملفات تعريف الارتباط تلقائياً.",
    pp_s2_title: "2. كيف نستخدم معلوماتك",
    pp_s2_text: "نستخدم معلوماتك لتقديم خدماتنا وتحسينها، ومعالجة الطلبات، وإرسال الإشعارات، والرد على الاستفسارات، وضمان أمان المنصة. قد نستخدم أيضاً بيانات مجمعة للتحليلات.",
    pp_s3_title: "3. مشاركة البيانات",
    pp_s3_text: "نحن لا نبيع بياناتك الشخصية. قد نشارك المعلومات مع مزودي الخدمات الذين يساعدون في تشغيل منصتنا، أو عندما يتطلب القانون ذلك. تخضع عمليات التكامل مع الأطراف الثالثة (فيسبوك، إنستغرام، واتساب) لسياسات الخصوصية الخاصة بها.",
    pp_s4_title: "4. أمان البيانات",
    pp_s4_text: "نطبق إجراءات أمان وفقاً لمعايير الصناعة لحماية بياناتك، بما في ذلك التشفير والخوادم الآمنة وضوابط الوصول. ومع ذلك، لا توجد طريقة نقل عبر الإنترنت آمنة بنسبة 100%.",
    pp_s5_title: "5. حقوقك",
    pp_s5_text: "لديك الحق في الوصول إلى معلوماتك الشخصية أو تحديثها أو حذفها في أي وقت. يمكنك أيضاً إلغاء الاشتراك في الاتصالات التسويقية. تواصل معنا لممارسة هذه الحقوق.",
    pp_s6_title: "6. اتصل بنا",
    pp_s6_text: "إذا كانت لديك أسئلة حول سياسة الخصوصية هذه، يرجى التواصل معنا عبر قنوات دعم المنصة.",
    tou_s1_title: "1. قبول الشروط",
    tou_s1_text: "من خلال الوصول إلى منصتنا أو استخدامها، فإنك توافق على الالتزام بشروط الاستخدام هذه. إذا كنت لا توافق، فلا يجوز لك استخدام الخدمة.",
    tou_s2_title: "2. مسؤوليات الحساب",
    tou_s2_text: "أنت مسؤول عن الحفاظ على سرية بيانات اعتماد حسابك. توافق على إخطارنا فوراً بأي وصول غير مصرح به. يجب عليك تقديم معلومات دقيقة وكاملة عند إنشاء حساب.",
    tou_s3_title: "3. الاستخدام المقبول",
    tou_s3_text: "توافق على عدم استخدام المنصة لأي غرض غير قانوني، أو نقل محتوى ضار، أو التدخل في تشغيل المنصة، أو انتهاك أي قوانين أو لوائح سارية.",
    tou_s4_title: "4. الملكية الفكرية",
    tou_s4_text: "جميع المحتويات والميزات والوظائف الخاصة بالمنصة مملوكة لنا ومحمية بموجب قوانين حقوق النشر والعلامات التجارية وغيرها من قوانين الملكية الفكرية. تحتفظ بملكية المحتوى الذي تقوم بتحميله.",
    tou_s5_title: "5. تحديد المسؤولية",
    tou_s5_text: "إلى أقصى حد يسمح به القانون، لن نكون مسؤولين عن أي أضرار غير مباشرة أو عرضية أو خاصة أو تبعية ناشئة عن استخدامك للمنصة.",
    tou_s6_title: "6. الإنهاء",
    tou_s6_text: "نحتفظ بالحق في تعليق أو إنهاء وصولك إلى المنصة وفقاً لتقديرنا، مع أو بدون إشعار، بسبب سلوك ينتهك هذه الشروط أو يضر بالمستخدمين الآخرين.",
    tou_s7_title: "7. تغييرات على الشروط",
    tou_s7_text: "قد نقوم بتحديث هذه الشروط من وقت لآخر. يشكل استمرار استخدام المنصة بعد التغييرات قبولاً للشروط المحدثة.",
    disc_s1_title: "1. معلومات عامة",
    disc_s1_text: "المعلومات المقدمة على هذه المنصة هي لأغراض إعلامية عامة فقط. بينما نسعى للحفاظ على دقة المعلومات وتحديثها، لا نقدم أي تمثيلات أو ضمانات من أي نوع حول اكتمال المعلومات أو دقتها أو موثوقيتها.",
    disc_s2_title: "2. المحتوى المُنشأ بالذكاء الاصطناعي",
    disc_s2_text: "تستخدم منصتنا الذكاء الاصطناعي للمساعدة في محادثات العملاء ومعالجة الطلبات والتوصيات. قد لا تكون الردود المُنشأة بالذكاء الاصطناعي دقيقة دائماً. أصحاب المتاجر مسؤولون عن مراجعة وتأكيد الإجراءات المدعومة بالذكاء الاصطناعي، بما في ذلك الطلبات والتواصل مع العملاء.",
    disc_s3_title: "3. تكاملات الأطراف الثالثة",
    disc_s3_text: "تتكامل منصتنا مع خدمات أطراف ثالثة مثل فيسبوك وإنستغرام وواتساب. نحن غير مسؤولين عن المحتوى أو ممارسات الخصوصية أو توفر هذه الخدمات الخارجية. يخضع استخدام خدمات الأطراف الثالثة لشروطها وأحكامها الخاصة.",
    disc_s4_title: "4. ليست نصيحة مهنية",
    disc_s4_text: "لا يشكل أي شيء على هذه المنصة نصيحة مهنية أو قانونية أو مالية أو تجارية. يجب عليك استشارة المتخصصين المناسبين قبل اتخاذ قرارات تجارية بناءً على المعلومات المقدمة عبر منصتنا.",
    disc_s5_title: "5. تحديد المسؤولية",
    disc_s5_text: "لن نتحمل المسؤولية عن أي خسائر أو أضرار أو مشكلات ناشئة عن استخدام منصتنا، بما في ذلك على سبيل المثال لا الحصر أخطاء الطلبات أو سوء التواصل أو انقطاع الخدمة.",
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
