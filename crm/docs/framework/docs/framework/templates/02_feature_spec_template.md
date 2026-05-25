# 02 Feature Spec

> **TL;DR:** Template for specifying each feature's purpose, user actions, system behavior, and required UI states.
> **Covers:** feature definitions, user actions, system output, dependencies, loading/empty/success/error states | **Phase:** 2

## Instructions

Create one section per feature. Be specific about what the user does, what the system does in response, and what states the UI must handle. Group related features together.

### Feature: Invoice Builder
Purpose: Allow users to create professional invoices with line items, tax, and payment terms.
User action: User clicks "New Invoice", selects a client, adds line items (description, quantity, rate), sets due date and tax rate, then clicks "Send" or "Save Draft".
System output: System calculates totals, generates a PDF preview, saves the invoice with status "draft" or "sent", and triggers email delivery if sent.
Required in v1: Yes
Dependencies: Client must exist before invoice creation. Stripe must be connected for payment link generation.
Key states:
- Loading: Skeleton form while client list loads
- Empty: No clients yet — prompt to create first client
- Success: Invoice saved/sent with confirmation toast
- Error: Validation errors shown inline (missing client, zero amount, past due date)

### Feature: Client Management
Purpose: Maintain a contact directory of clients for invoice addressing.
User action: User creates a client with name, email, company, and billing address. User can edit or archive clients from the client list.
System output: Client record is stored and available in invoice builder dropdown. Archived clients are hidden from the dropdown but their invoices remain visible.
Required in v1: Yes
Dependencies: None
Key states:
- Loading: Skeleton table
- Empty: No clients — show CTA to add first client
- Success: Client list with search and sort
- Error: Duplicate email warning, validation errors on required fields

### Feature: Payment Tracking
Purpose: Show real-time payment status for all invoices.
User action: User views dashboard or invoice detail to see payment status. No manual action required — payments sync automatically from Stripe.
System output: Invoice status updates from "sent" to "paid" when Stripe webhook confirms payment. Dashboard summary row updates totals.
Required in v1: Yes
Dependencies: Stripe integration, webhook endpoint
Key states:
- Loading: Skeleton stats while payment data loads
- Empty: No invoices sent yet — show onboarding prompt
- Success: Real-time status with amounts and dates
- Error: Stripe sync failure — show last known state with warning banner
