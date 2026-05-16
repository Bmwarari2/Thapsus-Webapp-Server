# iOS ↔ Web feature audit

**Date:** 2026-05-16
**Question:** Does the Swiftcargo-main web client expose every feature the iOS app does?
**Method:** Two parallel codebase enumerations (iOS `Features/` directory + web client `pages/` + `components/`), then cross-referenced by domain.
**Repos:**
- iOS: `~/Documents/PROJECTS/thapsus-v1.1/iosApp/`
- Web: `~/Documents/PROJECTS/Swiftcargo-main/client/`

---

## TL;DR

The web client covers the **core** customer + operator + admin loops, but iOS has shipped **eight surfaces in the last 14 days that are not on web**. Most are admin-side compliance and ops work; one is a customer-facing privacy feature (account deletion) that arguably needs to ship to web for GDPR symmetry.

**Concrete gaps to close**, ranked by risk:

1. **Account deletion (14-day cooldown)** — customer-facing. iOS-only. Web only has the older DSAR export/erase request.
2. **Admin audit logs** — iOS-only.
3. **Admin error logs** — iOS-only.
4. **Admin AML queue** — iOS-only.
5. **Admin user-detail drill-down** — iOS-only (web has list-level controls inside `AdminDashboard.jsx`).
6. **Admin payments review queue** — iOS-only (Stripe auto-flips, but the M-Pesa awaiting-review queue has no web surface).
7. **Admin order-detail drill-down** — iOS-only (web has customer-facing `OrderDetail.jsx` but no admin variant with cost breakdown + audit timeline).
8. **Referral dashboard** — web file exists (`Referral.jsx`) but is not wired into the router. Customer can earn credit via the `?ref=` code on registration but can't see/share their own code.

Two iOS surfaces are functionally covered on web but in a different shape:

- **Lipana STK push** — iOS has a dedicated bottom-sheet (`LipanaStkSheet.swift`). Web's `PayInvoiceModal` orchestrates Stripe + M-Pesa, but the audit could not confirm an explicit Lipana STK branch. Worth a 30-second check before scheduling work.
- **Home greeting carousel** — iOS has a rotating engagement carousel on the customer home. Web's `Dashboard.jsx` has a cutoff banner + active-orders preview but no equivalent rotating hero. Not a parity bug — a deliberate design difference. Flagged for awareness.

The rest is at parity. The web client also has **legitimate web-only surfaces** (marketing pages, public pricing calculator, exchange-rate tool, GTM/Pixel widgets) that intentionally have no iOS equivalent — those are not gaps.

---

## 1. Domain-by-domain coverage matrix

Legend: **✓** = present on this surface · **✗** = absent · **stub** = file exists but not wired · **partial** = covered but in a meaningfully different shape · **n/a** = intentionally not applicable

| # | Domain | Roles | iOS | Web | Gap notes |
|---|---|---|---|---|---|
| 1 | Sign-in / sign-up / forgot-password / reset-password | All | ✓ | ✓ | iOS deep-links to `PasswordResetView`; web has dedicated `Login` + `Register` + `ForgotPassword` + `ResetPassword` pages. |
| 2 | Buy-for-me — customer create + accept/reject | Customer | ✓ | ✓ | Both `BuyForMeView` (iOS) / `BuyForMe.jsx` (web). |
| 3 | Buy-for-me — operator quote queue | Operator | ✓ | ✓ | `OpsBuyForMeQueueView` / `OpsBuyForMe.jsx`. |
| 4 | Buy-for-me — admin create-on-behalf | Admin | ✓ | ✓ | `AdminCreateBuyForMeView` / `AdminCreateBuyForMe.jsx`. |
| 5 | Pre-register (warehouse address folded in on iOS) | Customer | ✓ | ✓ | iOS `NewOrderView`; web `NewOrder.jsx` + dedicated `/warehouse` `WarehouseAddresses.jsx`. **Different layout, equivalent reach.** |
| 6 | Order list + detail (customer) | Customer | ✓ | ✓ | iOS `TrackingView` + `ParcelDetailView`; web `Orders.jsx` + `OrderDetail.jsx`. |
| 7 | Public parcel tracking | Public | ✓ | ✓ | iOS `TrackingView` + `https://thapsus.uk/track/<TN>` universal link; web `TrackPackage.jsx` at `/track` + `/track/:tn`. |
| 8 | Customer consolidation request | Customer | ✓ | ✓ | iOS `CustomerConsolidationView` (read-only summary); web `Consolidation.jsx` (multi-select + request). Web has the richer surface here. |
| 9 | Consolidations V2 — operator builder | Operator | ✓ | ✓ | iOS `ConsolidationListView` + `ConsolidationDetailView`; web `OpsConsolidations.jsx` + `/ops/consolidations/:id`. |
| 10 | Customer consolidations — admin manage | Admin | ✓ | ✓ | `AdminCustomerConsolidationsView` / `AdminCustomerConsolidations.jsx`. |
| 11 | Invoices — customer view & pay | Customer | ✓ | ✓ | iOS in-line on `CustomerActivityHubView` + `PayInvoiceView`; web `PayInvoiceModal` invoked from `Orders.jsx`, `Consolidation.jsx`, `BuyForMe.jsx`. |
| 12 | Public payment deep-link | Public | ✓ | ✓ | iOS `PublicPaymentView` (`thapsus://pay/...`); web `/pay/:orderId` `PublicPayment.jsx`. |
| 13 | Admin issue invoice (off-platform) | Admin | ✓ | ✓ | `AdminIssueInvoiceView` / `AdminIssueInvoice.jsx`. |
| 14 | Admin payments review queue (M-Pesa awaiting_review) | Admin | ✓ | **✗** | iOS `AdminPaymentsView`. Web has no dedicated admin M-Pesa approval surface — flagged below as gap #6. |
| 15 | Credit centre | Customer | ✓ | ✓ | `CreditCenterView` / `CreditCenter.jsx`. |
| 16 | Transactions / credit ledger | Customer | ✓ | ✓ | `TransactionsView` / `Transactions.jsx`. |
| 17 | Referral program — customer dashboard | Customer | ✓ | **stub** | iOS `ReferralView` (code, earnings, referees). Web `Referral.jsx` **file exists but is not wired into the router**. Customer can earn credit via `?ref=` on registration but cannot share their own code from inside the app. |
| 18 | Notification inbox | Customer + Ops | ✓ | ✓ | `NotificationInboxView` / `Notifications.jsx`. |
| 19 | Support tickets (customer + admin queue) | Customer + Admin | ✓ | ✓ | `TicketsListView` / `Support.jsx`. |
| 20 | NPS survey | Customer + Admin | ✓ | partial | iOS `NpsSurveyView` is an **in-app** post-delivery sheet (auto-prompt currently disabled per memory, but manual trigger via home carousel still works). Web `NpsLanding.jsx` is **email-only** — landing from the `sendNpsInvitationEmail` link. Web has no in-app NPS surface; this is intentional (mobile is the trigger surface, web is the fallback for inbox users). Not flagged as a gap. |
| 21 | DSAR (export / erase request) | Customer + Admin | ✓ | ✓ | `DsarView` + `AdminDsarQueueView` / `DsarRequest.jsx` + `AdminDsarQueue.jsx`. |
| 22 | Account deletion (14-day cooldown + HTML export) | Customer | ✓ | **✗** | iOS `AccountDeletionView` (PR #121, merged 2026-05-16). Web does not have this surface — customer can only file a DSAR `erase` request. **Customer-facing privacy gap — flagged as #1.** |
| 23 | Prohibited items search | Customer + Public | ✓ | ✓ | iOS `ProhibitedSearchView` (auth); web `/prohibited` `ProhibitedItems.jsx` (public). Web is actually more accessible. |
| 24 | Profile edit | Customer | ✓ | ✓ | `ProfileEditView` / inside `Dashboard.jsx` flow. |
| 25 | Appearance settings (light/dark) | Customer | ✓ | n/a | Web inherits OS theme automatically. Not a gap. |
| 26 | Warehouse intake — operator | Operator | ✓ | ✓ | `OperatorReceiveView` / `OpsConsole.jsx` (barcode scan + receive). |
| 27 | Operator today / queue stats | Operator | ✓ | ✓ | `OperatorTodayView` / built into `OpsConsole.jsx`. |
| 28 | Dispatch — last-mile assign | Operator | ✓ | ✓ | `DispatchView` / `OpsDispatch.jsx`. |
| 29 | Customs / clearing agent portal | Agent | ✓ | ✓ | `CustomsListView` / `partner/AgentPortal.jsx`. |
| 30 | Agent invoices | Agent | ✓ | ✓ | iOS `AgentInvoicesView`; web routed at `/partner/agent/invoices`. |
| 31 | Rider runs + POD capture | Rider | ✓ | ✓ | iOS `RiderRunView` + `RunStopListView` + `SignaturePadView` + `OutboxView`; web `partner/RiderPwa.jsx` (mobile-camera-aware PWA). Different shape, functional parity. |
| 32 | Admin dashboard / KPI | Admin | ✓ | ✓ | `AdminDashboardView` + `KPIDashboardView` / `AdminDashboard.jsx` + `KpiDashboard.jsx`. |
| 33 | Admin orders — list | Admin | ✓ | ✓ | iOS `AdminOrdersView`; web inside `AdminDashboard.jsx` Parcels/Orders tabs. |
| 34 | Admin order — detail drill-down | Admin | ✓ | **✗** | iOS `AdminOrderDetailView` (cost breakdown recomputed from current pricing, full audit timeline). Web has `OrderDetail.jsx` for the **customer** view but no admin variant with bypass cost breakdown + status-change controls. **Flagged as gap #7.** |
| 35 | Admin users — list + provision + reset password | Admin | ✓ | ✓ | iOS `AdminUsersView` + provision sheet + reset-password actions; web inside `AdminDashboard.jsx` "User mgmt" tab. Parity. |
| 36 | Admin users — detail drill-down (orders + emails sent) | Admin | ✓ | **✗** | iOS `AdminUserDetailView` (PR #117, merged 2026-05-16): tap a row to see profile, orders placed, emails sent, role/status controls. Web's user-mgmt tab is list-only — clicking a row may expand it but there's no dedicated detail page with the emails-sent history. **Flagged as gap #5.** |
| 37 | Admin revenue | Admin | ✓ | ✓ | iOS `AdminRevenueView` (CSV export); web `RevenueAreaChart` lazy-loaded inside `AdminDashboard.jsx`. Both consume `/api/admin/revenue`. |
| 38 | Admin audit logs (privileged-action feed) | Admin | ✓ | **✗** | iOS `AdminAuditLogsView` (paginated `/api/admin/logs`). Web has no surface for `admin_logs`. **Flagged as gap #2.** |
| 39 | Admin error logs (server error stream) | Admin | ✓ | **✗** | iOS `AdminErrorLogsView` (level filter, search, clear-all, auto-refresh). Web has no surface for `error_logs`. **Flagged as gap #3.** |
| 40 | Admin AML risk queue | Admin | ✓ | **✗** | iOS surfaces `aml_flags` as a card on `AdminDashboardView` + a dedicated `AdminAmlQueueView` (PR #118). Web's admin dashboard has no AML section. **Flagged as gap #4.** |
| 41 | Ops settings (pricing tiers, customs tiers, HS codes, FX, prohibited items) | Admin | ✓ | ✓ | iOS `OpsSettingsView` (4 sub-pages); web `OpsSettings.jsx` (6 tabs — actually richer than iOS). |
| 42 | Stripe + M-Pesa SMS-submit payments | Customer | ✓ | ✓ | `MpesaSubmitSheet` / inside `PayInvoiceModal`. |
| 43 | Lipana STK push payment flow | Customer | ✓ | partial | iOS `LipanaStkSheet.swift` (dedicated phone-input → PIN-prompt UI). Web `PayInvoiceModal` claims to handle "Stripe + M-Pesa"; the explicit Lipana STK branch is unconfirmed from the audit. **Flagged for verification, not yet a confirmed gap.** |
| 44 | Home greeting carousel | Customer | ✓ | partial | iOS `HomeGreetingCarousel.swift` rotates 25+ greetings with deep-link destinations (parcel, ticket, NPS, activity). Web `Dashboard.jsx` is static. **Engagement-design difference, not a parity bug.** |
| 45 | Public marketing pages (Home, FAQ, Privacy, Terms) | Public | n/a | ✓ | Web-only by design (SEO + acquisition). |
| 46 | Public pricing calculator | Public | n/a | ✓ | Web-only. iOS Quote tab is the closest equivalent but for signed-in customers. |
| 47 | Public exchange-rate page | Public | n/a | ✓ | Web-only. |
| 48 | Public ship-instructions retailer carousel | Customer | ✓ | ✓ | iOS folded into pre-register; web at `/ship-instructions`. |
| 49 | GTM / Meta Pixel / cookie consent | n/a | n/a | ✓ | Web-only marketing widgets — intentionally not on iOS. |
| 50 | Real-time updates (Realtime / SSE) | All | ✓ | ✓ | iOS uses Supabase Realtime; web uses SSE (`/api/events`). Both fan-out the same domain events. |

---

## 2. Confirmed iOS-only surfaces — ranked by risk

### Gap #1 — Account deletion (customer-facing privacy)
**iOS:** `AccountDeletionView.swift` (PR #121). 14-day cooldown, HTML data export, signed Supabase Storage URL, email confirmation, in-app countdown, cancel CTA.
**Web:** absent. Customer can file a DSAR `erase` request (open queue, ≥30-day SLA, admin-fulfilled) but not the new self-serve 14-day cooldown flow.
**Why it matters:** GDPR symmetry — the same customer who can delete on mobile may expect to delete on web. Also: web customers currently can't access the data export through the cooldown path at all, only through DSAR.
**Effort:** medium. Backend is shared (`/api/account/deletion-request` lives on Swiftcargo-main). Web just needs the four-page flow (idle / active / cancelled / completed) mirroring iOS `AccountDeletionView`.

### Gap #2 — Admin audit logs
**iOS:** `AdminAuditLogsView.swift`. Paginated feed of privileged actions (user provision, password reset, pricing edits, etc.). Reads `GET /api/admin/logs`.
**Web:** absent. Admin can only see privileged actions via direct DB query.
**Why it matters:** S3-3 audit requirement. Web admins lose visibility into provisioning + role-change + pricing actions.
**Effort:** low. Single page + pagination wrapper around the existing endpoint.

### Gap #3 — Admin error logs
**iOS:** `AdminErrorLogsView.swift`. Level filter, search, clear-all, auto-refresh.
**Web:** absent.
**Why it matters:** ops visibility into server errors without SSH-ing to Railway.
**Effort:** low. Same shape as audit logs page.

### Gap #4 — Admin AML risk queue
**iOS:** `AdminAmlQueueView.swift` (PR #118) + summary card on `AdminDashboardView`. Status filter (open / cleared / escalated), per-row Clear/Escalate actions.
**Web:** absent. Web `AdminDashboard.jsx` has no AML section.
**Why it matters:** compliance. AML flags raised against customer/parcel activity are blind to web admins.
**Effort:** low. Reads `/api/admin/aml-flags`, writes the same `resolveAmlFlag` endpoint iOS does.

### Gap #5 — Admin user-detail drill-down
**iOS:** `AdminUserDetailView.swift` (PR #117). Tap a user row → profile + recent emails sent + role/status controls + reset-password + delete.
**Web:** `AdminDashboard.jsx` "User mgmt" tab does provision + lookup + lock/unlock + send test SMS, but there's no dedicated detail page that shows the email history for a given user.
**Why it matters:** when a customer reports "I never got the welcome email," the admin needs the per-user email log. Web admins currently can't pull this.
**Effort:** medium. Need a new modal or sub-page that aggregates `/api/admin/users/:id` + `/api/admin/users/:id/emails`.

### Gap #6 — Admin payments review queue (M-Pesa awaiting-review)
**iOS:** `AdminPaymentsView.swift`. Lists `payments` rows with `status='awaiting_review'`, exposes Verify/Reject sheets, supports the "verify with override" path when claimed amount < invoice due.
**Web:** the closest surface is the `AdminDashboard.jsx` Parcels/Orders tab, but there's no `/admin/payments` route in the audit. M-Pesa payments needing manual approval can only be cleared from iOS or via direct DB.
**Why it matters:** if the iOS admin is asleep, an awaiting-review M-Pesa payment stays stuck.
**Effort:** medium. Need a new web page + the two sheets (reject reason, override reason).

### Gap #7 — Admin order-detail drill-down
**iOS:** `AdminOrderDetailView.swift`. Server-recomputed cost breakdown, status-hero, packages assigned, full timeline. Mirrors web's customer-facing OrderDetail.jsx but uses the admin bypass.
**Web:** customer-facing `OrderDetail.jsx` exists. Admins click into orders from `AdminDashboard.jsx` Parcels tab but the audit didn't surface a dedicated admin order-detail page. May exist as a modal — verify.
**Why it matters:** medium. Admins need cost-breakdown bypass to debug pricing complaints from customers.
**Effort:** low if it's just hooking up a route to an existing page; medium if building from scratch.

### Gap #8 — Referral dashboard
**iOS:** `ReferralView.swift`. Customer's referral code + earnings + referees list + share CTA.
**Web:** `Referral.jsx` **file exists but is not wired into the router**. Customer can earn credit via `?ref=<CODE>` on register, but cannot see their own code anywhere in the app.
**Why it matters:** referral channel is dead on web. Free customer acquisition friction.
**Effort:** trivial. Wire `Referral.jsx` to `/referral` in `App.jsx` and add a nav entry on `Dashboard.jsx`. Verify the page actually fetches `/api/referral` correctly first.

---

## 3. Surfaces worth verifying (not yet confirmed gaps)

### Lipana STK push branch in `PayInvoiceModal`
iOS has a dedicated bottom-sheet for the STK flow. The web audit says `PayInvoiceModal` handles "Stripe + M-Pesa orchestration" but does not explicitly call out a Lipana STK branch. If the web modal only renders the manual SMS-submit path, customers on web cannot use the lower-friction STK push.
**Verify:** open `client/src/components/PayInvoiceModal.jsx` and look for an `stk` / `lipana` branch around the M-Pesa path.

### Home greeting carousel
iOS rotates greetings with deep-link destinations. Web shows a static cutoff banner + active-orders preview. Not necessarily a gap — desktop and mobile have different attention budgets — but worth confirming this is a product-design decision rather than oversight.

---

## 4. Web-only surfaces (intentional, not gaps)

These exist on web and have **no iOS counterpart by design** — listed for completeness:

- `/` `Home.jsx` — marketing landing, hero, retailer marquee, testimonials, FAQ embed
- `/faq` `FAQ.jsx` — SEO-friendly expandable FAQs
- `/privacy` `PrivacyPolicy.jsx`, `/terms` `TermsOfService.jsx` — legal pages
- `/pricing` `PricingCalculator.jsx` — public quote tool (iOS Quote tab is signed-in only)
- `/exchange` `ExchangeRate.jsx` — public FX viewer
- `/ship-instructions` `ShipInstructions.jsx` — public retailer carousel (iOS does this in pre-register only)
- `GoogleAnalytics`, `MetaPixel`, `CookieConsent`, `ScrollToTop`, `SEO` (helmet meta), `SupportChatWidget` — marketing/analytics widgets

The iOS app gets `https://thapsus.uk/privacy` etc. via Safari sheet, so the legal pages are reachable from both surfaces; they just live on web.

---

## 5. Recommended punch list

If you want to close the gap completely, here's the order I'd merge in:

1. **Quick wins** (an hour each, mostly wire-up):
   - Wire `Referral.jsx` into `App.jsx` + nav (gap #8).
   - Verify Lipana STK branch in `PayInvoiceModal` (gap-of-uncertainty).
2. **Compliance** (half-day each):
   - Admin audit logs page (gap #2).
   - Admin error logs page (gap #3).
   - Admin AML queue page (gap #4).
3. **Admin productivity** (~day each):
   - Admin user-detail page with email log (gap #5).
   - Admin payments review queue (gap #6).
   - Admin order-detail page with bypass cost breakdown (gap #7).
4. **Customer-facing** (1–2 days):
   - Account deletion 14-day cooldown flow (gap #1). Mirror iOS's four-state UI (idle / active / cancelled / completed). Backend endpoints already live on Swiftcargo-main.

Total: ~5–7 working days to reach surface-parity. Backend work needed: zero (every endpoint these surfaces consume is already live on `/api/admin/*` and `/api/account/deletion-request`).

---

**Audit compiled by parallel `Explore` agents over `~/Documents/PROJECTS/thapsus-v1.1/iosApp/Features/` (iOS reference set) and `~/Documents/PROJECTS/Swiftcargo-main/client/` (web reference set), 2026-05-16.**
