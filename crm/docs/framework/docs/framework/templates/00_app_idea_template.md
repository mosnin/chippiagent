# 00 App Idea

> **TL;DR:** Template for capturing the product concept, target users, core problem, and v1 scope.
> **Covers:** app name, problem, users, core features, entities, roles, non-goals | **Phase:** 2

## Instructions

Fill out every section with concrete, specific content for your product. Do not leave sections blank or generic. If a section is not applicable, write "Not applicable for v1" and explain why.

## App Name

> Example: InvoiceFlow

## One Sentence Product Definition

> Example: InvoiceFlow is a tool that lets freelancers create, send, and track invoices from a single dashboard.

## Core User

> Example: Independent freelancers and solo consultants who manage their own billing and have 5-50 active clients.

## Core Problem

> Example: Freelancers lose time switching between spreadsheets, email, and payment tools to invoice clients, leading to late payments and missed follow-ups.

## Core Outcome

> Example: Freelancers send professional invoices in under 60 seconds and get paid faster through automated reminders and online payment links.

## First Value Event

> Example: User creates and sends their first invoice to a real client.

## Main Product Workflow

> Example: Create client → Create invoice (line items, tax, due date) → Send via email → Client pays online → Dashboard updates automatically.

## Dashboard Definition

> Example: Summary row showing total outstanding, total paid this month, and overdue count. Main area is an invoice list sorted by status (draft, sent, overdue, paid). Secondary panel shows recent activity and upcoming due dates.

## Onboarding Definition

> Example: Step 1: Business profile (name, logo, address). Step 2: Payment setup (connect Stripe). Step 3: Add first client. Step 4: Create first invoice. Skip option available after step 2.

## Required Internal Modules

> Example: Analytics (revenue over time, average payment speed), Integrations (Stripe, QuickBooks), Notifications (payment received, invoice overdue), Activity Logs (invoice sent, payment recorded).

## Product Specific Features

> Example: Invoice builder with line items and tax calculation, client management with contact details, recurring invoice scheduling, payment link generation, PDF export, email delivery with open tracking.

## Product Specific Entities

> Example: Client (name, email, company, address), Invoice (client_id, line_items, status, due_date, amount, tax), Line Item (description, quantity, rate), Payment (invoice_id, amount, method, paid_at), Recurring Schedule (invoice_template_id, frequency, next_send_date).

## Roles And Permissions

> Example: Owner (full access, billing, can delete workspace), Admin (manage clients, invoices, settings, cannot delete workspace), Member (create and send invoices, view own clients only).

## Integrations Or External Config

> Example: Stripe (payment processing), QuickBooks (accounting sync optional in v1), SMTP or SendGrid (invoice delivery emails).

## Admin Requirements

> Example: View all users and their workspaces, view system-wide invoice volume, suspend accounts, view billing status per workspace.

## V1 Scope

> Example: Invoice CRUD, client management, Stripe payments, email delivery, dashboard with payment status, basic analytics, mobile responsive.

## Non Goals

> Example: Multi-currency support, proposal/estimate features, time tracking, team collaboration, white-label branding, API access.

## UX Constraints

> Example: Invoice creation must complete in under 3 clicks from dashboard. Mobile must support viewing invoices and payment status but not full invoice editing.

## Technical Constraints

> Example: Must use Stripe for payments. Must support PDF generation server-side. Email delivery must be transactional (not bulk).

## Success Criteria

> Example: User can go from signup to sending first invoice in under 5 minutes. Invoice email delivery rate above 95%. Payment conversion within 48 hours of send for 60%+ of invoices.
