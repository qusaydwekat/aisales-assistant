import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, ArrowRight, Bot, Check, ChevronRight, Globe, Menu, MessageCircle, MessageSquare, Package, ShieldCheck, Sparkles, Workflow, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { navigationItems, adminNavigationItem } from "@/components/navigation-items";
import { useLanguage } from "@/contexts/LanguageContext";
import heroImage from "@/assets/ai-automation-hero.jpg";
import commerceImage from "@/assets/ai-commerce.jpg";

export default function HomePage() {
  const { language, setLanguage, dir, t } = useLanguage();
  const ar = language === "ar";
  const [menuOpen, setMenuOpen] = useState(false);
  const text = (en: string, arabic: string) => ar ? arabic : en;
  const descriptions: Record<string, [string, string]> = {
    dashboard: ["Your messages, orders, and revenue at a glance.", "رسائلك وطلباتك وإيراداتك في نظرة واحدة."],
    inbox: ["Every conversation. One inbox. AI and your team, together.", "كل المحادثات في صندوق واحد، للذكاء الاصطناعي وفريقك."],
    orders: ["From confirmation to delivery, keep every order in sync.", "تابع كل طلب من التأكيد حتى التوصيل."],
    products: ["Manage your catalog, variations, photos, and stock.", "أدر منتجاتك وخياراتها وصورها والمخزون."],
    catalog_tools: ["Enrich product details with AI and link your social posts.", "حسّن تفاصيل المنتجات بالذكاء الاصطناعي واربط منشوراتك."],
    reports: ["Understand sales trends and export your performance data.", "افهم اتجاهات المبيعات وصدّر بيانات الأداء."],
    growth: ["Manage promotions, restock signups, and knowledge gaps.", "أدر العروض وتنبيهات توفر المنتجات والأسئلة غير المجابة."],
    platforms: ["Connect your customer conversations through Meta.", "اربط محادثات عملائك من خلال ميتا."],
    ai_settings: ["Shape your assistant’s voice, model, and reply behavior.", "خصّص أسلوب مساعدك ونموذجه وطريقة ردوده."],
    store_settings: ["Keep store details, hours, and delivery policies together.", "اجمع تفاصيل متجرك وساعات العمل وسياسات التوصيل."],
    notifications: ["Stay on top of new activity and connection alerts.", "تابع آخر النشاطات وتنبيهات الاتصال."],
    admin: ["Dedicated account and subscription controls for platform admins.", "إدارة مخصصة للحسابات والاشتراكات لمسؤولي المنصة."],
  };
  const nav = [
    ["#capabilities", text("Platform", "المنصة")],
    ["#automation", text("AI automation", "الأتمتة الذكية")],
    ["#workspace", text("Workspace", "مساحة العمل")],
    ["#faq", text("FAQs", "الأسئلة الشائعة")],
  ];
  const reveal = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.12 }, transition: { duration: 0.5 } };

  return (
    <div className="home-page bg-background text-foreground" dir={dir}>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-xl">
        <div className="home-container flex h-20 items-center justify-between gap-4">
          <Link to="/" aria-label="AISales home" className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Zap className="h-5 w-5" fill="currentColor" /></span><span className="font-heading text-2xl font-bold">AI<span className="text-primary">Sales</span><span className="text-primary">.</span></span></Link>
          <nav className="hidden items-center gap-7 lg:flex" aria-label={text("Main navigation", "التنقل الرئيسي")}>{nav.map(([href, label]) => <a key={href} href={href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">{label}</a>)}</nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label={ar ? "English" : "العربية"} title={ar ? "English" : "العربية"} onClick={() => setLanguage(ar ? "en" : "ar")}><Globe /></Button>
            <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link to="/login">{text("Log in", "تسجيل الدخول")}</Link></Button>
            <Button asChild className="hidden sm:inline-flex"><Link to="/signup">{text("Get started", "ابدأ الآن")}<ArrowUpRight className="rtl:-scale-x-100" /></Link></Button>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label={text("Toggle menu", "فتح القائمة")} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</Button>
          </div>
        </div>
        {menuOpen && <nav className="home-container grid gap-1 border-t border-border py-4 lg:hidden">{nav.map(([href, label]) => <Button key={href} asChild variant="ghost" className="justify-start"><a href={href} onClick={() => setMenuOpen(false)}>{label}</a></Button>)}<Button asChild variant="outline"><Link to="/login">{text("Log in", "تسجيل الدخول")}</Link></Button><Button asChild><Link to="/signup">{text("Get started", "ابدأ الآن")}</Link></Button></nav>}
      </header>

      <main>
        <section className="home-hero relative isolate overflow-hidden">
          <img src={heroImage} width={1920} height={1024} fetchPriority="high" alt={text("Glass AI processor connecting customer messages, products, and orders", "معالج ذكاء اصطناعي يربط رسائل العملاء بالمنتجات والطلبات")} className="home-hero-art absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="home-container relative flex h-full items-center">
            <motion.div {...reveal} className="home-hero-copy max-w-xl py-16">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary/80 px-3 py-1.5 text-xs font-semibold text-primary"><Sparkles className="h-3.5 w-3.5" />{text("THE NEXT CHAPTER OF SOCIAL COMMERCE", "مستقبل التجارة عبر المحادثات")}</span>
              <h1 className="mt-7 font-heading text-6xl font-semibold leading-[1.08]">AISales<span className="text-primary">.</span><br /><span className="text-primary">{text("AI sales automation", "أتمتة المبيعات")}</span></h1>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">{text("Turn conversations into customers. An AI sales assistant that knows your products, answers naturally, and keeps your orders moving.", "حوّل المحادثات إلى مبيعات. مساعد ذكي يعرف منتجاتك، يرد بأسلوب طبيعي، ويتابع طلباتك.")}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3"><Button asChild size="lg"><Link to="/signup">{text("Build your AI sales team", "أنشئ فريق مبيعاتك الذكي")}<ArrowUpRight className="rtl:-scale-x-100" /></Link></Button><Button asChild size="lg" variant="outline"><a href="#capabilities">{text("Explore the platform", "اكتشف المنصة")}<ArrowRight className="rtl:-scale-x-100" /></a></Button></div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />{text("English & Arabic", "العربية والإنجليزية")}</span><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-primary" />{text("Your catalog. Your voice.", "منتجاتك. أسلوبك.")}</span></div>
            </motion.div>
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <div className="home-container flex flex-col items-center justify-between gap-6 py-7 md:flex-row"><p className="max-w-xs text-sm text-muted-foreground">{text("Connected conversations.\nOne intelligent workspace.", "محادثات مترابطة. مساحة عمل ذكية واحدة.")}</p><div className="flex flex-wrap justify-center gap-6 sm:gap-12">{[[MessageCircle, "Messenger"], [MessageSquare, "Instagram"], [MessageCircle, "WhatsApp"]].map(([Icon, name]) => { const ChannelIcon = Icon as typeof MessageCircle; return <span key={String(name)} className="flex items-center gap-2 font-heading text-lg font-medium"><ChannelIcon className="h-5 w-5 text-primary" />{String(name)}</span>; })}</div><span className="text-xs text-muted-foreground">{text("Powered by Meta connections", "عبر اتصالات ميتا")}</span></div>
        </section>

        <section id="capabilities" className="home-container home-section">
          <motion.div {...reveal} className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="home-eyebrow">{text("LESS BUSYWORK. MORE POSSIBILITY.", "عمل روتيني أقل. إمكانيات أكثر.")}</p><h2 className="home-heading mt-3">{text("A smarter way to sell.", "طريقة أذكى للبيع.")}</h2></div><p className="max-w-sm text-muted-foreground">{text("Bring your conversations, catalog, and orders together. Let AI handle the repetitive parts.", "اجمع محادثاتك ومنتجاتك وطلباتك، واترك المهام المتكررة للذكاء الاصطناعي.")}</p></motion.div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              { icon: MessageSquare, title: text("Conversations that connect", "محادثات تقرّبك من عملائك"), copy: text("Natural replies in your customer’s language. Product questions, photo matching, and a handoff to your team when needed.", "ردود طبيعية بلغة العميل، وإجابات عن المنتجات، ومطابقة الصور، وتحويل لفريقك عند الحاجة."), url: "/inbox", tag: text("UNIFIED INBOX", "صندوق وارد موحّد") },
              { icon: Bot, title: text("Your brand. Your assistant.", "علامتك التجارية. مساعدك الذكي."), copy: text("Choose the personality and AI model. Give your assistant the product details and store policies that make it yours.", "اختر الشخصية ونموذج الذكاء الاصطناعي، وزوّد مساعدك بمنتجاتك وسياسات متجرك."), url: "/ai-settings", tag: text("AI INTELLIGENCE", "ذكاء اصطناعي") },
              { icon: Package, title: text("From a message to an order", "من رسالة إلى طلب"), copy: text("Find the right variation, check stock, and manage orders in the conversation—with a full summary before creation.", "اختر الخيار المناسب، وتحقق من المخزون، وأدر الطلبات داخل المحادثة مع ملخص كامل قبل إنشائها."), url: "/orders", tag: text("CONNECTED COMMERCE", "تجارة مترابطة") },
            ].map((feature, i) => <motion.article {...reveal} key={feature.url} className="home-feature group rounded-lg border border-border bg-card p-7"><div className={`flex h-12 w-12 items-center justify-center rounded-lg ${i === 1 ? "bg-accent/10 text-accent" : "bg-secondary text-primary"}`}><feature.icon className="h-6 w-6" /></div><p className="mt-8 text-[11px] font-semibold text-muted-foreground">{feature.tag}</p><h3 className="mt-3 font-heading text-xl font-semibold">{feature.title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{feature.copy}</p><Button asChild variant="link" className="mt-5 h-auto p-0"><Link to={feature.url}>{text("Explore", "اكتشف")}<ArrowUpRight className="rtl:-scale-x-100" /></Link></Button></motion.article>)}
          </div>
        </section>

        <section id="automation" className="border-y border-border bg-secondary/50">
          <div className="home-container grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-20">
            <motion.div {...reveal} className="overflow-hidden"><img src={commerceImage} alt={text("AI scanner automating product parcels on a glass conveyor", "ماسح ذكي يؤتمت معالجة طرود المنتجات")} loading="lazy" width={1024} height={1024} className="aspect-square w-full rounded-lg object-cover" /></motion.div>
            <motion.div {...reveal}><p className="home-eyebrow">{text("INTELLIGENCE THAT MOVES BUSINESS", "ذكاء يحرّك أعمالك")}</p><h2 className="home-heading mt-3">{text("Your next sale starts\nwith a conversation.", "مبيعاتك القادمة تبدأ بمحادثة.")}</h2><p className="mt-5 leading-relaxed text-muted-foreground">{text("Behind a simple reply is a connected workflow. AISales brings product knowledge and order tools into the same conversation, while you stay in control.", "خلف كل رد بسيط سير عمل مترابط. يجمع AISales معرفة المنتجات وأدوات الطلبات في نفس المحادثة، مع إبقاء التحكم بيدك.")}</p><div className="mt-8 space-y-5">{[
              [text("Understand the customer", "افهم العميل"), text("Language, messages, and product images in context.", "اللغة والرسائل وصور المنتجات ضمن سياق المحادثة.")],
              [text("Find the right product", "اعثر على المنتج المناسب"), text("Catalog details, available variations, and current stock.", "تفاصيل المنتجات وخياراتها المتاحة والمخزون الحالي.")],
              [text("Keep the order moving", "تابع الطلب خطوة بخطوة"), text("Create, update, or cancel orders and track their status.", "أنشئ الطلبات أو عدّلها أو ألغها وتابع حالتها.")],
            ].map(([title, copy], i) => <div key={title} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/25 text-sm font-medium text-primary">0{i + 1}</span><div><h3 className="font-medium">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{copy}</p></div></div>)}</div><Button asChild variant="link" className="mt-6 px-0"><Link to="/signup">{text("Put AI to work", "ابدأ العمل بالذكاء الاصطناعي")}<ArrowRight className="rtl:-scale-x-100" /></Link></Button></motion.div>
          </div>
        </section>

        <section id="workspace" className="home-container home-section">
          <motion.div {...reveal} className="text-center"><p className="home-eyebrow">{text("THE WHOLE PICTURE", "الصورة الكاملة")}</p><h2 className="home-heading mt-3">{text("One workspace. Every moving part.", "مساحة واحدة. كل تفاصيل أعمالك.")}</h2><p className="mx-auto mt-4 max-w-xl text-muted-foreground">{text("Everything already inside AISales, connected around your store.", "كل ما تحتاجه داخل AISales، مترابط حول متجرك.")}</p></motion.div>
          <div className="mt-12 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">{[...navigationItems, adminNavigationItem].map(item => <motion.div {...reveal} key={item.key} className="flex gap-4 border-b border-border py-7"><item.icon className="mt-1 h-5 w-5 shrink-0 text-primary" /><div className="flex-1"><Link to={item.url} className="group flex items-center justify-between gap-2 font-heading text-base font-semibold">{t(item.key)}<ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 rtl:-scale-x-100" /></Link><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{descriptions[item.key]?.[ar ? 1 : 0]}</p></div></motion.div>)}</div>
        </section>

        <section className="border-y border-border bg-muted/40"><div className="home-container home-section"><p className="home-eyebrow">{text("MAKE IT YOURS", "اجعله مناسباً لك")}</p><h2 className="home-heading mt-3">{text("A clear path to getting started.", "خطوات واضحة للبداية.")}</h2><div className="mt-10 grid gap-8 md:grid-cols-3">{[
          [text("Set up your store", "جهّز متجرك"), text("Create your account and add your store details. Subscription activation is managed by the platform administrator.", "أنشئ حسابك وأضف معلومات متجرك. يتولى مسؤول المنصة تفعيل الاشتراك.")],
          [text("Connect your catalog & channels", "اربط المنتجات والقنوات"), text("Add products, configure your assistant, and connect Meta after your paid subscription is activated.", "أضف المنتجات وخصّص مساعدك واربط ميتا بعد تفعيل اشتراكك المدفوع.")],
          [text("Bring your conversations together", "اجمع محادثاتك"), text("Review replies, track orders, and step in whenever your customers need a human.", "راجع الردود وتابع الطلبات وتدخل عندما يحتاج العميل لفريقك.")],
        ].map(([title, copy], i) => <div key={title}><span className="font-heading text-4xl font-medium text-primary/40">0{i + 1}</span><h3 className="mt-4 font-heading text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy}</p></div>)}</div></div></section>

        <section id="faq" className="home-container home-section grid gap-10 md:grid-cols-[1fr_1.3fr]"><div><p className="home-eyebrow">{text("GOOD QUESTIONS", "أسئلة مهمة")}</p><h2 className="home-heading mt-3">{text("A little more clarity.", "تفاصيل أوضح.")}</h2><p className="mt-4 text-muted-foreground">{text("Get to know your new sales workspace.", "تعرّف على مساحة مبيعاتك الجديدة.")}</p></div><Accordion type="single" collapsible>{[
          [text("Can I customize the AI assistant?", "هل يمكنني تخصيص المساعد الذكي؟"), text("Yes. Configure its name, tone, language, AI model, and reply behavior in AI Settings. Store details and your catalog provide its business context.", "نعم، يمكنك تخصيص الاسم والأسلوب واللغة والنموذج وطريقة الرد من إعدادات الذكاء الاصطناعي، وتزويده بمعلومات متجرك ومنتجاتك.")],
          [text("Does it support Arabic?", "هل يدعم اللغة العربية؟"), text("AISales supports English and Arabic, including right-to-left layouts. The assistant can detect and respond in the customer’s language.", "يدعم AISales العربية والإنجليزية واتجاه العرض من اليمين لليسار. يستطيع المساعد التعرف على لغة العميل والرد بها.")],
          [text("Can my team take over a conversation?", "هل يمكن لفريقي استلام المحادثة؟"), text("Yes. The shared inbox supports manual replies and AI controls. The assistant can also escalate conversations when human help is needed.", "نعم. يدعم صندوق الوارد الردود اليدوية والتحكم بالذكاء الاصطناعي، ويمكن للمساعد تحويل المحادثات عند الحاجة لمساعدة بشرية.")],
          [text("When can I connect my social accounts?", "متى يمكنني ربط حساباتي الاجتماعية؟"), text("Meta connections are available after the platform administrator marks your subscription as paid and activates your account.", "يتاح ربط ميتا بعد تأكيد مسؤول المنصة دفع الاشتراك وتفعيل حسابك.")],
        ].map(([question, answer], i) => <AccordionItem key={question} value={String(i)}><AccordionTrigger className="text-start text-base">{question}</AccordionTrigger><AccordionContent className="leading-relaxed text-muted-foreground">{answer}</AccordionContent></AccordionItem>)}</Accordion></section>

        <section className="home-cta border-y border-border bg-secondary"><div className="home-container flex flex-col items-start justify-between gap-8 py-16 md:flex-row md:items-center"><div><div className="mb-4 flex items-center gap-2 text-primary"><Workflow className="h-5 w-5" /><span className="text-sm font-medium">{text("Your next chapter starts here", "خطوتك القادمة تبدأ هنا")}</span></div><h2 className="home-heading">{text("More connection. Less repetition.", "تواصل أكثر. تكرار أقل.")}</h2></div><Button asChild size="lg" className="shrink-0"><Link to="/signup">{text("Get started with AISales", "ابدأ مع AISales")}<ArrowUpRight className="rtl:-scale-x-100" /></Link></Button></div></section>
      </main>

      <footer className="home-container py-10"><div className="flex flex-col justify-between gap-8 sm:flex-row"><div><Link to="/" className="flex items-center gap-2 font-heading text-xl font-bold"><Zap className="h-5 w-5 text-primary" />AISales<span className="text-primary">.</span></Link><p className="mt-3 text-sm text-muted-foreground">{text("Intelligent conversations. Connected commerce.", "محادثات ذكية. تجارة مترابطة.")}</p></div><div className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-muted-foreground"><Link to="/privacy-policy" className="hover:text-primary">{t("privacy_policy")}</Link><Link to="/terms-of-use" className="hover:text-primary">{t("terms_of_use")}</Link><Link to="/disclaimer" className="hover:text-primary">{t("disclaimer")}</Link><Link to="/login" className="hover:text-primary">{text("Log in", "تسجيل الدخول")}</Link></div></div><div className="mt-9 flex flex-wrap justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground"><span>© {new Date().getFullYear()} AISales. {text("All rights reserved.", "جميع الحقوق محفوظة.")}</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />{text("AI-assisted. Human-led.", "بمساعدة الذكاء الاصطناعي. بقيادة الإنسان.")}</span></div></footer>
    </div>
  );
}