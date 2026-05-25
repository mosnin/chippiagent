import { embedText } from '@/lib/embeddings';
import { upsertVector, deleteVector } from '@/lib/zilliz';
import type { Deal, IntakeFormConfig, FormQuestion } from '@/lib/types';
import { formatAnswerValue } from '@/lib/form-versioning';

type VectorContact = {
  id: string;
  spaceId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  preferences?: string | null;
  properties?: string[];
  budget?: number | null;
  type: string;
  tags: string[];
  /** Dynamic form answers (keyed by question ID) */
  applicationData?: Record<string, any> | null;
  /** Frozen form config at time of submission */
  formConfigSnapshot?: IntakeFormConfig | null;
};

export async function syncContact(contact: VectorContact) {
  const text = buildContactEmbeddingText(contact);

  const vector = await embedText(text);
  await upsertVector(
    contact.spaceId,
    `contact_${contact.id}`,
    'contact',
    contact.id,
    text,
    vector
  );
}

/**
 * Build embedding text for a contact. If the contact has a dynamic
 * form config snapshot, format as "Q: {label} A: {answer}" pairs
 * so the AI assistant understands what each answer means.
 * Falls back to the original field-based format for legacy contacts.
 */
function buildContactEmbeddingText(contact: VectorContact): string {
  // Base fields always included
  const baseParts: (string | null | undefined)[] = [
    contact.name,
    contact.email,
    contact.phone,
    contact.address,
    contact.notes,
    contact.preferences,
    (contact.properties ?? []).join(' '),
    contact.budget != null ? `$${contact.budget}` : null,
    contact.type,
    contact.tags.join(' '),
  ];

  // ── Dynamic form mode ──────────────────────────────────────────────────
  if (
    contact.formConfigSnapshot?.sections &&
    contact.applicationData &&
    typeof contact.applicationData === 'object'
  ) {
    const qaParts: string[] = [];

    const sortedSections = [...contact.formConfigSnapshot.sections].sort(
      (a, b) => a.position - b.position,
    );

    for (const section of sortedSections) {
      const sortedQuestions = [...section.questions].sort(
        (a, b) => a.position - b.position,
      );

      for (const question of sortedQuestions) {
        // Skip system fields (name/email/phone) — already in base parts
        if (question.system) continue;

        const rawValue = contact.applicationData[question.id];
        if (rawValue == null || rawValue === '') continue;

        const displayValue = formatAnswerValue(rawValue, question);
        if (displayValue) {
          qaParts.push(`Q: ${question.label} A: ${displayValue}`);
        }
      }
    }

    return [...baseParts.filter(Boolean), ...qaParts].join(' ');
  }

  // ── Legacy mode ────────────────────────────────────────────────────────
  return baseParts.filter(Boolean).join(' ');
}

export async function syncDeal(deal: Deal & { stage?: { name: string } }) {
  const text = [
    deal.title,
    deal.description,
    deal.address,
    deal.priority,
    deal.stage?.name,
    deal.value != null ? `$${deal.value}` : null
  ]
    .filter(Boolean)
    .join(' ');

  const vector = await embedText(text);
  await upsertVector(
    deal.spaceId,
    `deal_${deal.id}`,
    'deal',
    deal.id,
    text,
    vector
  );
}

export async function deleteContactVector(spaceId: string, contactId: string) {
  await deleteVector(spaceId, `contact_${contactId}`);
}

export async function deleteDealVector(spaceId: string, dealId: string) {
  await deleteVector(spaceId, `deal_${dealId}`);
}
