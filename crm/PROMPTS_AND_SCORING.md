# PROMPTS_AND_SCORING.md

Protected AI behavior documentation for prompts, scoring, and model configuration.

**These systems are protected.** Do not edit without explicit instruction. See change control rules in section 6.

---

## 1. Do prompts and scoring systems exist?

Yes. All are implemented and active.

| System | Status | Location |
|---|---|---|
| Lead scoring prompt + schema | **Implemented** | `lib/lead-scoring.ts` |
| AI assistant system prompt | **Implemented** | `lib/ai.ts` |
| Embedding pipeline | **Implemented** | `lib/embeddings.ts` |
| Vector retrieval (RAG) | **Implemented** | `lib/zilliz.ts` (Supabase pgvector wrapper — name retained from the historical Zilliz/Milvus integration), `lib/vectorize.ts` |

---

## 2. Code locations

### Lead scoring

| Component | File | Line reference |
|---|---|---|
| Main function | `lib/lead-scoring.ts` → `scoreLeadApplication()` | Entry point for scoring |
| Prompt builder | `lib/lead-scoring.ts` → `toPrompt()` | Constructs scoring prompt from lead fields |
| Schema validation | `lib/lead-scoring.ts` → `scoreSchema` (zod) | Validates model output |
| OpenAI structured output | `lib/lead-scoring.ts` → `response_format.json_schema` | Enforces output shape |
| Caller | `app/api/public/apply/route.ts` | Called after Contact creation |

### AI assistant

| Component | File | Line reference |
|---|---|---|
| Main function | `lib/ai.ts` → `chatWithRAG()` | Entry point for assistant |
| System prompt | `lib/ai.ts` → inline `systemPrompt` construction | Dynamic with space name + RAG context |
| Provider routing | `lib/ai.ts` → OpenAI only | Provider selection logic |
| API endpoint | `app/api/ai/task/route.ts` + `app/api/ai/task/approve/[requestId]/route.ts` | Authenticated task-based assistant endpoint (historical: previously `app/api/ai/chat/route.ts` — that route has been removed). See `docs/AI_AGENT_SPEC.md` for the full protocol. |
| Message persistence | `app/api/ai/task/route.ts` | Saves user + assistant messages to `Message` table |

### Embeddings and vectors

| Component | File |
|---|---|
| Text embedding | `lib/embeddings.ts` → `embedText()` |
| Vector CRUD | `lib/zilliz.ts` → `ensureCollection()`, `upsertVector()`, `searchVectors()`, `deleteVector()` |
| Entity sync | `lib/vectorize.ts` → `syncContact()`, `syncDeal()` |
| Sync trigger | `app/api/vectorize/sync/route.ts` |

---

## 3. Scoring contract (implemented)

### Input shape

The `scoreLeadApplication` function accepts:

```typescript
{
  contactId: string;    // Internal ID (for logging)
  name: string;         // Required
  email: string | null;
  phone: string;        // Required
  budget: number | null;
  timeline: string | null;
  preferredAreas: string | null;
  notes: string | null;
}
```

### Prompt structure

The scoring prompt is constructed by `toPrompt()`:

- **Role**: "You are scoring a U.S. renter leasing lead for follow-up priority."
- **Output instruction**: "Return strict JSON only."
- **Score range**: 0-100 (higher = higher follow-up priority)
- **Label rules**: hot (75-100), warm (45-74), cold (0-44), unscored only if insufficient data
- **Summary constraint**: "explainable and practical in under 300 chars"
- **System message**: "You are a lead qualification assistant. Return only valid JSON matching the schema."

### Model configuration

| Parameter | Value |
|---|---|
| Model | `gpt-4o-mini` |
| Temperature | `0` |
| Response format | `json_schema` (strict mode) |

### Output shape (`LeadScoringResult`)

```typescript
{
  scoringStatus: 'scored' | 'failed' | 'pending';
  leadScore: number | null;      // 0-100
  scoreLabel: string;            // 'hot' | 'warm' | 'cold' | 'unscored'
  scoreSummary: string | null;   // Max 300 chars, explainable
}
```

### Zod validation schema

```typescript
z.object({
  leadScore: z.number().min(0).max(100),
  scoreLabel: z.enum(['hot', 'warm', 'cold', 'unscored']),
  scoreSummary: z.string().min(1).max(300)
})
```

---

## 4. Parsing and persistence flow

```
1. POST /api/public/apply receives submission
2. Contact created with scoringStatus: 'pending', scoreLabel: 'unscored'
3. scoreLeadApplication() called with lead fields
4. OpenAI gpt-4o-mini called with structured JSON output format
5. Response parsed as JSON
6. Parsed JSON validated against Zod schema
7. If valid: Contact updated with scored result
8. If invalid (any step): Contact updated with fallback state
9. API returns 201 with scoring result
```

### Failure points and their handling

| Failure | Handling |
|---|---|
| `OPENAI_API_KEY` missing | `getOpenAIClient()` throws → caught → fallback state |
| Empty model response | Returns fallback state |
| Invalid JSON in response | `JSON.parse` fails → returns fallback state |
| Schema validation failure | `scoreSchema.safeParse` fails → returns fallback state |
| Provider API error | Catch block → returns fallback state |
| Scoring persistence failure | Separate catch block attempts fallback persistence |

---

## 5. Fallback behavior expectations

### Scoring fallback

On any scoring failure, the result must be:

```typescript
{
  scoringStatus: 'failed',
  leadScore: null,
  scoreLabel: 'unscored',
  scoreSummary: 'Scoring unavailable right now. Lead saved successfully.'
}
```

**Critical rule**: Scoring failures must **never** block lead persistence. The Contact is always saved regardless of scoring outcome.

### Assistant error handling

| Scenario | Behavior |
|---|---|
| `OPENAI_API_KEY` not configured | Returns text: "No AI API key configured. Add OPENAI_API_KEY in your Vercel environment variables." |
| OpenAI available | Uses OpenAI gpt-4.1-mini |
| OpenAI fails (4xx/5xx) | Returns descriptive error text |
| Zilliz/embeddings not configured | RAG context silently skipped; assistant still responds |

### Assistant model configuration

| Provider | Model | Temperature | Max tokens |
|---|---|---|---|
| OpenAI | `gpt-4.1-mini` | `0.2` | `2000` |

---

## 6. Change control rules (strict)

### What requires explicit instruction to change

1. Prompt text (scoring or assistant system prompts)
2. Model names or provider selection logic
3. Temperature, max tokens, or response format settings
4. Scoring label thresholds (hot/warm/cold ranges)
5. Schema contracts (input shape, output shape, Zod validation)
6. Fallback behavior and fallback text
7. Persistence fields and status semantics
8. Provider routing logic (OpenAI only)
9. Embedding model or vector dimensions

### Process for authorized changes

If a task explicitly requires changes to prompts or scoring:

1. **Call out** all impacted workflows in the task report
2. **Document** backward compatibility risk (will existing scored contacts still make sense?)
3. **Test** success path, failure path, and fallback path
4. **Verify** that scoring failures still do not block lead persistence
5. **Log** the change in `CHANGELOG_AI.md` with full detail

---

## 7. Mandatory protection note

AI prompts, scoring logic, model configuration, and provider routing are **protected core systems**.

Any change requires:
- Explicit task instruction
- Validation evidence covering success, failure, and fallback paths
- Entry in CHANGELOG_AI.md

No agent may modify these systems as part of a broader task, cleanup, or refactor. Changes must be isolated and intentional.
