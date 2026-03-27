const DisclaimerPage = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Disclaimer</h1>
      <p className="text-muted-foreground mb-6">Last updated: March 27, 2026</p>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">1. General Information</h2>
        <p className="text-muted-foreground leading-relaxed">The information provided on this platform is for general informational purposes only. While we strive to keep the information accurate and up to date, we make no representations or warranties of any kind about the completeness, accuracy, or reliability of the information.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">2. AI-Generated Content</h2>
        <p className="text-muted-foreground leading-relaxed">Our platform uses artificial intelligence to assist with customer conversations, order processing, and recommendations. AI-generated responses may not always be accurate. Store owners are responsible for reviewing and confirming AI-assisted actions, including orders and customer communications.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">3. Third-Party Integrations</h2>
        <p className="text-muted-foreground leading-relaxed">Our platform integrates with third-party services such as Facebook, Instagram, and WhatsApp. We are not responsible for the content, privacy practices, or availability of these external services. Use of third-party services is subject to their respective terms and conditions.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">4. No Professional Advice</h2>
        <p className="text-muted-foreground leading-relaxed">Nothing on this platform constitutes professional, legal, financial, or business advice. You should consult with appropriate professionals before making business decisions based on information provided through our platform.</p>
      </section>

      <section className="space-y-4 mb-8">
        <h2 className="text-xl font-semibold">5. Limitation of Responsibility</h2>
        <p className="text-muted-foreground leading-relaxed">We shall not be held responsible for any losses, damages, or issues arising from the use of our platform, including but not limited to order errors, miscommunications, or service interruptions.</p>
      </section>
    </div>
  </div>
);

export default DisclaimerPage;
