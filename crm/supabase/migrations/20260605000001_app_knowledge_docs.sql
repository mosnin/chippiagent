-- Knowledge base for Chippi — app documentation that Chippi can look up
-- on demand when realtors ask "how do I..." or "why isn't X working".
-- Uses Postgres full-text search (no embedding API required).

CREATE TABLE IF NOT EXISTS "AppKnowledgeDoc" (
  "id"           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "category"     TEXT        NOT NULL,
  "title"        TEXT        NOT NULL,
  "content"      TEXT        NOT NULL,
  "searchVector" tsvector    GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", ''))
  ) STORED,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AppKnowledgeDoc_searchVector_idx"
  ON "AppKnowledgeDoc" USING gin("searchVector");

CREATE INDEX IF NOT EXISTS "AppKnowledgeDoc_category_idx"
  ON "AppKnowledgeDoc" ("category");

-- RLS: readable by authenticated users (no space scoping — app docs are global).
ALTER TABLE "AppKnowledgeDoc" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "AppKnowledgeDoc_read" ON "AppKnowledgeDoc"
  FOR SELECT USING (true);

-- RPC for full-text search — called by the Python recall_docs tool.
CREATE OR REPLACE FUNCTION search_knowledge_docs(
  query_text TEXT,
  filter_category TEXT DEFAULT NULL,
  result_limit INT DEFAULT 5
)
RETURNS TABLE (
  id TEXT,
  category TEXT,
  title TEXT,
  content TEXT,
  rank FLOAT4
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.id,
    d.category,
    d.title,
    d.content,
    ts_rank_cd(d."searchVector", websearch_to_tsquery('english', query_text)) AS rank
  FROM "AppKnowledgeDoc" d
  WHERE
    d."searchVector" @@ websearch_to_tsquery('english', query_text)
    AND (filter_category IS NULL OR filter_category = '' OR d.category = filter_category)
  ORDER BY rank DESC
  LIMIT result_limit;
$$;

-- ── Seed: initial application documentation ───────────────────────────────────

INSERT INTO "AppKnowledgeDoc" ("category", "title", "content") VALUES

('contacts', 'How contacts and leads work',
'Contacts (also called People or Leads) are the core of the CRM. Every buyer, renter, or seller you work with lives here.
Each contact has a lead type: buyer (purchasing a property), rental (looking to lease), or seller (listing a property for sale).
Contacts have a lead score (0-100) with labels hot, warm, or cold calculated by AI from their activity.
You can set a follow-up date on any contact to be reminded when to reach out.
To view all contacts, click People in the sidebar. To add a new contact, tell Chippi "add a contact named [name]" or click the + button on the People page.
Contacts move through pipeline stages: QUALIFICATION → TOUR → APPLICATION.'),

('contacts', 'Leads and the intake form',
'Leads are contacts who came in through your intake form (the public-facing lead capture form).
They appear on the Leads page with an AI score and application data (budget, move-in date, employment, preferences).
To view leads, click People → Leads in the sidebar.
The intake form is customizable — ask Chippi to "show me my intake form" or go to Intake form in the More section of the sidebar.
Chippi can edit your intake form questions directly: ask it to "add a question about pets to the rental form".'),

('deals', 'How deals and pipelines work',
'Deals represent active transactions — a buyer deal for a purchase, a rental deal for a lease, or a seller deal for a listing.
Each deal belongs to a pipeline stage (e.g. Prospect, Active, Under Contract, Closed Won).
There are separate pipelines for buyer, rental, and seller deals.
To create a deal, tell Chippi "create a deal for [contact name]" or click New Deal on the Deals page.
Deals can have a linked property, value, commission rate, close date, and contacts attached.
The deal kanban board shows all active deals grouped by stage. Drag cards to move them between stages.'),

('deals', 'Deal documents',
'Each deal has a Documents tab where you can upload PDFs, images, and Word documents.
Document types vary by pipeline: buyer deals support offer letters, purchase agreements, inspection reports, appraisals, title docs, and closing disclosure.
Rental deals support lease agreements, rental applications, move-in checklists, and inspection reports.
Seller deals support listing agreements, seller disclosures, comparative market analyses, net sheets, and closing statements.
To upload, go to the deal detail page and click the Documents tab. Drag a file onto the drop zone or click Choose file.'),

('properties', 'How properties work',
'Properties are real estate listings linked to your deals. They store address, list price, beds, baths, square footage, and listing status.
To add a property, create a new deal — properties are created as part of the deal flow. Click Add property in the sidebar under Properties, which takes you to the new deal form.
To view all properties, click Properties in the sidebar.
Commission reports and year-to-date earnings are under Properties → Commissions in the sidebar.'),

('tours', 'Scheduling and managing tours',
'Tours are property viewings scheduled for a contact at a specific time.
To book a tour, tell Chippi "book a tour for [contact name] on [date] at [time]" — the contact must have an email address on file.
Tours appear on the Calendar page. Each tour record has a status: scheduled, completed, or cancelled.
After a tour completes, Chippi can automatically follow up with the contact.
To view tours, go to the Calendar page in the sidebar.'),

('calendar', 'Calendar and events',
'The Calendar page shows all scheduled tours and follow-up dates.
Tours are automatically added to the calendar when booked via Chippi or the tour booking flow.
If you have Google Calendar connected (via Settings → Integrations), tours sync to your Google Calendar automatically.
To connect Google Calendar, go to Settings → Integrations in the sidebar.'),

('chippi', 'What Chippi can do',
'Chippi is your AI coworker. It can:
- Create contacts: "add a buyer named John Smith, budget $500k, looking in Brickell"
- Create deals: "create a deal for John Smith"
- Book tours: "book a tour for John on May 15 at 2pm at 123 Main St"
- Draft messages: "draft a follow-up email for Jane"
- Update contacts: "set Jane follow-up to next Friday", "tag John as hot"
- Look up contacts and deals: "find all my rental leads", "show me stalled deals"
- Analyze your pipeline: "what deals are closing this month?"
- Manage the intake form: "add a question about parking to the rental form"
- Store notes: "remember that John prefers text over email"
Chippi never sends messages — it creates drafts for your review.'),

('chippi', 'Chippi does not create contacts unless you ask it to',
'A common mistake: telling Chippi about a new lead and expecting it to save automatically. You must explicitly ask Chippi to create the contact.
Correct: "Add a new lead named Orlando, rental, $3500-4500/mo, looking for 2BR in Edgewater, end of June"
Incorrect: "I have a new lead named Orlando" — Chippi will acknowledge but not create the record unless you say "add them" or "create a contact".
If Chippi says it has "noted" something, that means it stored the info in memory only, not in your CRM. Always say "add" or "create" to get a real contact record.'),

('settings', 'Settings and integrations',
'Settings are in the sidebar. Key sections:
- Profile: your name, business focus, communication preferences for Chippi
- Integrations: connect Google Calendar for tour sync
- Intake form: customize your lead intake form questions
- Agents: configure AI agent behavior and personalization
The Agents page lets you set Chippi''s tone and focus areas.'),

('troubleshooting', 'Contact or deal not showing up after Chippi created it',
'If Chippi says it created a contact or deal but you do not see it, check:
1. Refresh the page — real-time updates sometimes need a manual refresh.
2. Check that Chippi actually called the tool — look for a confirmation like "Created contact Orlando" in the response.
3. If Chippi said "I have noted..." or "I have added to memory..." without confirming a tool call, it did NOT create the record. Ask again: "Please create a contact for Orlando."
4. Make sure you are on the right page — contacts are under People, deals are under Deals.'),

('troubleshooting', 'Tour booking fails',
'Chippi requires the contact to have an email address to book a tour. If booking fails:
1. Make sure the contact has an email: ask Chippi "what is [name]''s email?" or update it on their contact page.
2. The tour time must be in the future.
3. Provide a specific time: "book a tour for John on May 20 at 3pm" — vague times like "next week" will prompt Chippi to ask for a specific time.'),

('troubleshooting', 'Chippi is not responding or is slow',
'If Chippi stops responding mid-conversation or is very slow:
1. Refresh the page and start a new conversation.
2. Check your internet connection.
3. Complex requests (analyzing your full pipeline, bulk updates) take longer — wait up to 30 seconds.
If the issue persists, use the feedback link in the sidebar to report it.');
