

# AISales — Phase 1: Core UI & Design System

## Overview
Build the complete UI shell of AISales with mock data, establishing the premium dark SaaS aesthetic. All screens will be functional with navigation, interactions, and realistic demo data — ready for backend integration in Phase 2.

---

## 1. Design System & Layout Foundation
- Import **Space Grotesk** (headings) and **Satoshi/DM Sans** (body) fonts
- Configure dark color tokens: navy `#0A0F1E` background, electric blue `#2563EB` primary, cyan `#06B6D4` accent
- Build glassmorphism card component with subtle borders and backdrop blur
- Create the **collapsible sidebar layout** with all navigation items (Dashboard, Inbox, Orders, Products, Store Settings, Connected Platforms, Reports, AI Settings, Notifications)
- Add Framer Motion page transitions (vertical slide + opacity fade)
- Notification bell with dropdown in the top header bar

## 2. Auth & Onboarding Flow
- **Login page** with email/password, "pending approval" state display
- **Multi-step signup wizard** (5 steps):
  - Step 1: Account info (name, email, password, phone, store name)
  - Step 2: Store info (description, category, logo upload, address, hours, policies)
  - Step 3: Product upload (manual form + CSV bulk import UI)
  - Step 4: Connect platforms (Facebook, Instagram, WhatsApp cards — OAuth/credential UI)
  - Step 5: Review & Submit
- Progress indicator across steps, smooth transitions between steps
- Post-signup: **Onboarding checklist** widget (connect platforms ✓, add products ✓, customize AI ✓, go live ✓)

## 3. Store Owner Dashboard (Home)
- **Summary metric cards** (4-column grid): messages today, new orders, pending orders, monthly revenue — each with mini sparkline area chart (Recharts)
- **Platform connection status** badges (Facebook ✓ / Instagram ✓ / WhatsApp ✓)
- **Real-time activity feed** — timeline of latest messages and orders with platform-specific colored icons
- **Line chart** for messages over time, **bar chart** for orders per day

## 4. Unified Inbox (Hero Feature)
- **Three-column layout**:
  - Left (`w-80`): Conversation list with customer name, platform icon, last message preview, timestamp, unread blue border, order status tag. Filters by platform/status/date, search bar
  - Center: Chat thread with styled bubbles (AI messages get cyan glow), platform badges, timestamps. Manual reply input, "Mark as Resolved" button
  - Right (`w-96`): Customer CRM panel (name, phone, address, past orders), active cart/order panel, product quick-search
- AI vs human message distinction, order cards embedded in thread
- Mobile-responsive: collapses to single column with navigation

## 5. Orders Management
- **Table view**: Order ID, Customer, Phone, Address, Products, Total, Status (color-coded badges), Platform icon, Date
- Filters by status, date range, platform
- Click to open **order detail modal**: customer info, ordered items with images, pricing breakdown, status timeline, conversation link, notes field
- Status dropdown to update (Pending → Confirmed → Shipped → Delivered)
- "Create Order" button, "Export CSV" button

## 6. Products Management
- **Grid/list toggle** view with product cards (image, name, price, stock, status badge)
- **Add/Edit product form**: name, description, category, price, compare price, images (multi-upload), stock, SKU, variants (size/color), active toggle
- Low stock alert badges
- Search and filter by category
- CSV import UI with template download link

## 7. Store Settings, Platforms, AI Settings
- **Store Settings**: Editable store info form (name, description, logo, hours with day toggles + time pickers, delivery/return policy)
- **Connected Platforms**: Cards for Facebook, Instagram, WhatsApp — each with connect/disconnect UI, status indicator, last synced time, message stats
- **AI Settings**: Persona name input, language selector, tone slider (Professional ↔ Casual), auto-reply toggle, response delay slider, fallback message, escalation threshold, greeting templates, **AI chat simulator panel** (split-screen: prompt editor + test chat)

## 8. Reports & Analytics
- Date range picker
- **Donut chart**: messages by platform
- **Line charts**: orders over time, revenue over time
- Top products table, average response time, AI resolution rate gauge, conversion rate
- Export buttons (CSV)

## 9. Super Admin Dashboard (`/admin`)
- Separate admin sidebar: Overview, Users, All Orders, Platform Connections, Settings, Announcements
- **User management table**: name, email, store name, status badges (Pending/Active/Suspended), actions (Approve/Reject/Suspend)
- **Pending approvals** tab with store detail preview
- **System stats** cards: total users, orders, messages, AI resolution rate
- **Announcements** compose UI

## 10. Mock Data & Polish
- Seed realistic demo data: 2 stores, 10 products each, 20 conversations, 15 orders in various statuses
- Quick reply templates UI
- Customer directory page (auto-built from conversations)
- Dark/light mode toggle in header
- RTL support structure for Arabic
- Final responsive polish across all breakpoints

