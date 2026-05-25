import { z } from 'zod';
import { normalizeSlug } from '@/lib/intake';

// ── Helpers ──
const optStr = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

const optNum = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === '') return undefined;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    const p = Number.parseFloat(String(v));
    return Number.isFinite(p) ? p : undefined;
  });

const optBool = z
  .union([z.boolean(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === '') return undefined;
    if (typeof v === 'boolean') return v;
    return v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : undefined;
  });

// ── Full multi-step application schema ──
export const publicApplicationSchema = z.object({
  slug: z
    .string()
    .min(1)
    .transform((value) => normalizeSlug(value))
    .refine((value) => value.length >= 3, { message: 'Invalid slug' }),

  // Lead type: rental or buyer
  leadType: z.enum(['rental', 'buyer']).optional().default('rental'),

  // Buyer-specific fields
  preApprovalStatus: optStr,
  preApprovalLender: optStr,
  preApprovalAmount: optStr,
  propertyType: optStr,
  bedrooms: optStr,
  bathrooms: optStr,
  mustHaves: optStr,
  firstTimeBuyer: optStr,
  buyerBudget: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null || v === '') return undefined;
      if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
      // Keep string values as-is (e.g. "1m_plus", "$1M+", "500k_750k")
      if (typeof v === 'string') return v;
      return undefined;
    }),
  housingSituation: optStr,
  buyerTimeline: optStr,

  // Step 1: Property Selection
  propertyAddress: optStr,
  unitType: optStr,
  targetMoveInDate: optStr,
  monthlyRent: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null || v === '') return undefined;
      // Accept both numeric values (old form) and range strings (new form)
      if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
      // If it's a range string like "$1,500 - $2,000", keep as string
      if (typeof v === 'string' && /[\$,]/.test(v)) return v;
      // Try to parse as number for backward compatibility, but only if
      // the entire string is a valid number (avoid parseFloat("1m_plus") → 1)
      if (typeof v === 'string') {
        const trimmed = String(v).trim();
        const p = Number(trimmed);
        return Number.isFinite(p) ? p : trimmed;
      }
      return undefined;
    }),
  leaseTermPreference: optStr,
  numberOfOccupants: optNum,

  // Step 2: Applicant Basics (name + phone required for old form; email required for new form)
  legalName: z.string().trim().min(1, 'Full name is required').max(120),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Invalid email')
    .max(255),
  phone: z
    .string()
    .trim()
    .min(1, 'Phone number is required')
    .max(40),
  dateOfBirth: optStr,

  // Step 3: Current Living Situation
  currentAddress: optStr,
  currentHousingStatus: z
    .union([
      z.enum(['own', 'rent', 'rent-free', '']),
      z.string().max(100),
    ])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  currentMonthlyPayment: optNum,
  lengthOfResidence: optStr,
  reasonForMoving: optStr,

  // Step 4: Household
  adultsOnApplication: optNum,
  childrenOrDependents: optNum,
  coRenters: optStr,
  emergencyContactName: optStr,
  emergencyContactPhone: optStr,

  // Step 5: Income
  employmentStatus: z
    .union([
      z.enum(['employed', 'self-employed', 'unemployed', 'retired', 'student', '']),
      z.enum(['Full-time employed', 'Self-employed', 'Part-time employed', 'Student', 'Not currently employed']),
      z.string().max(100),
    ])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  employerOrSource: optStr,
  monthlyGrossIncome: z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null || v === '') return undefined;
      // Accept both numeric values (old form) and range strings (new form)
      if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
      // If it's a range string like "$3,000 - $4,000", keep as string
      if (typeof v === 'string' && /[\$,]/.test(v)) return v;
      // Try to parse as number for backward compatibility, but only if
      // the entire string is a valid number (avoid parseFloat("1m_plus") → 1)
      if (typeof v === 'string') {
        const trimmed = String(v).trim();
        const p = Number(trimmed);
        return Number.isFinite(p) ? p : trimmed;
      }
      return undefined;
    }),
  additionalIncome: optNum,

  // Step 6: Rental History
  currentLandlordName: optStr,
  currentLandlordPhone: optStr,
  previousLandlordName: optStr,
  previousLandlordPhone: optStr,
  currentRentPaid: optNum,
  latePayments: optBool,
  leaseViolations: optBool,
  permissionToContactReferences: optBool,

  // Step 7: Screening
  priorEvictions: optBool,
  outstandingBalances: optBool,
  bankruptcy: optBool,
  backgroundAcknowledgment: optBool,
  creditScore: optNum,
  smoking: optBool,
  hasPets: optBool,
  petDetails: optStr,

  // Step 8: Additional notes
  additionalNotes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined)),

  // Step 9: Consents
  consentToScreening: optBool,
  truthfulnessCertification: optBool,
  electronicSignature: optStr,

  // Privacy consent
  privacyConsent: optBool,

  // Meta
  completedSteps: z.array(z.number()).optional(),
});

export type PublicApplicationInput = z.infer<typeof publicApplicationSchema>;

export function normalizePhone(input: string) {
  return input.replace(/\D/g, '');
}

export function applicationFingerprintKey(input: Pick<PublicApplicationInput, 'slug' | 'legalName'> & { phone?: string | null; email?: string | null }) {
  const normalizedName = input.legalName.trim().toLowerCase();
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : '';
  const normalizedEmail = (input.email ?? '').trim().toLowerCase();
  return `${input.slug}:${normalizedName}:${normalizedPhone}:${normalizedEmail}`;
}

/** Build the structured applicationData JSON from the validated input */
export function buildApplicationData(input: PublicApplicationInput) {
  return {
    leadType: input.leadType,
    propertyAddress: input.propertyAddress,
    unitType: input.unitType,
    targetMoveInDate: input.targetMoveInDate,
    monthlyRent: input.monthlyRent,
    leaseTermPreference: input.leaseTermPreference,
    numberOfOccupants: input.numberOfOccupants,
    legalName: input.legalName,
    email: input.email,
    phone: input.phone,
    dateOfBirth: input.dateOfBirth,
    currentAddress: input.currentAddress,
    currentHousingStatus: input.currentHousingStatus,
    currentMonthlyPayment: input.currentMonthlyPayment,
    lengthOfResidence: input.lengthOfResidence,
    reasonForMoving: input.reasonForMoving,
    adultsOnApplication: input.adultsOnApplication,
    childrenOrDependents: input.childrenOrDependents,
    coRenters: input.coRenters,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
    employmentStatus: input.employmentStatus,
    employerOrSource: input.employerOrSource,
    monthlyGrossIncome: input.monthlyGrossIncome,
    additionalIncome: input.additionalIncome,
    currentLandlordName: input.currentLandlordName,
    currentLandlordPhone: input.currentLandlordPhone,
    previousLandlordName: input.previousLandlordName,
    previousLandlordPhone: input.previousLandlordPhone,
    currentRentPaid: input.currentRentPaid,
    latePayments: input.latePayments,
    leaseViolations: input.leaseViolations,
    permissionToContactReferences: input.permissionToContactReferences,
    priorEvictions: input.priorEvictions,
    outstandingBalances: input.outstandingBalances,
    bankruptcy: input.bankruptcy,
    backgroundAcknowledgment: input.backgroundAcknowledgment,
    creditScore: input.creditScore,
    smoking: input.smoking,
    hasPets: input.hasPets,
    petDetails: input.petDetails,
    additionalNotes: input.additionalNotes,
    preApprovalStatus: input.preApprovalStatus,
    preApprovalLender: input.preApprovalLender,
    preApprovalAmount: input.preApprovalAmount,
    propertyType: input.propertyType,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    mustHaves: input.mustHaves,
    firstTimeBuyer: input.firstTimeBuyer,
    buyerBudget: input.buyerBudget,
    housingSituation: input.housingSituation,
    buyerTimeline: input.buyerTimeline,
    consentToScreening: input.consentToScreening,
    truthfulnessCertification: input.truthfulnessCertification,
    electronicSignature: input.electronicSignature,
    submittedAt: new Date().toISOString(),
    completedSteps: input.completedSteps,
  };
}
