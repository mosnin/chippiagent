/**
 * Zod validation schema for the dynamic form builder IntakeFormConfig.
 *
 * Validates:
 *   - At least one section with at least one question
 *   - System fields (name, email, phone) present and required
 *   - Unique question IDs across all sections
 *   - Valid non-negative positions
 *   - Options required for select/radio/multi_select types
 *   - visibleWhen references valid questionIds
 */

import { z } from 'zod';

// ── Question option ───────────────────────────────────────────────────────────

const formOptionSchema = z.object({
  value: z.string().min(1, 'Option value is required'),
  label: z.string().min(1, 'Option label is required'),
  scoreValue: z.number().optional(),
});

// ── Validation rules ──────────────────────────────────────────────────────────

const validationSchema = z.object({
  // Cap pattern length to prevent ReDoS attacks with complex regex
  pattern: z.string().max(200).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().nonnegative().max(10000).optional(),
  maxLength: z.number().int().positive().max(10000).optional(),
}).optional();

// ── Scoring rules ─────────────────────────────────────────────────────────────

const scoringSchema = z.object({
  weight: z.number().min(0).max(100),
  mappings: z.array(z.object({
    value: z.string().max(500),
    points: z.number().min(-100).max(100),
  })).optional(),
}).optional();

// ── Conditional visibility ────────────────────────────────────────────────────

const visibleWhenSchema = z.object({
  questionId: z.string().min(1),
  operator: z.enum(['equals', 'not_equals', 'contains']),
  value: z.string().max(500),
}).optional();

// ── Question types ────────────────────────────────────────────────────────────

const QUESTION_TYPES = [
  'text', 'textarea', 'email', 'phone', 'number',
  'select', 'multi_select', 'radio', 'checkbox', 'date',
] as const;

const TYPES_REQUIRING_OPTIONS = ['select', 'multi_select', 'radio'] as const;

// ── Form question ─────────────────────────────────────────────────────────────

const formQuestionSchema = z.object({
  id: z.string().min(1, 'Question ID is required'),
  type: z.enum(QUESTION_TYPES),
  label: z.string().min(1, 'Question label is required').max(500),
  description: z.string().max(1000).optional(),
  placeholder: z.string().max(500).optional(),
  required: z.boolean(),
  position: z.number().int().nonnegative(),
  system: z.boolean().optional(),
  options: z.array(formOptionSchema).max(200).optional(),
  validation: validationSchema,
  scoring: scoringSchema,
  visibleWhen: visibleWhenSchema,
});

// ── Form section ──────────────────────────────────────────────────────────────

const formSectionSchema = z.object({
  id: z.string().min(1, 'Section ID is required'),
  title: z.string().min(1, 'Section title is required').max(200),
  description: z.string().max(1000).optional(),
  position: z.number().int().nonnegative(),
  questions: z.array(formQuestionSchema).min(1, 'Each section must have at least one question').max(50),
  visibleWhen: visibleWhenSchema,
});

// ── Full form config ──────────────────────────────────────────────────────────

export const formConfigSchema = z
  .object({
    version: z.number().int().positive(),
    leadType: z.enum(['rental', 'buyer', 'general']),
    sections: z.array(formSectionSchema).min(1, 'At least one section is required').max(50),
  })
  .superRefine((config: { version: number; leadType: string; sections: z.infer<typeof formSectionSchema>[] }, ctx: z.RefinementCtx) => {
    // Collect all question IDs and check for duplicates
    const allQuestionIds = new Set<string>();
    const allQuestions: z.infer<typeof formQuestionSchema>[] = [];

    for (const section of config.sections) {
      for (const question of section.questions) {
        if (allQuestionIds.has(question.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate question ID: "${question.id}"`,
            path: ['sections'],
          });
        }
        allQuestionIds.add(question.id);
        allQuestions.push(question);
      }
    }

    // Ensure system fields exist and are required
    const systemFields = [
      { id: 'name', label: 'name' },
      { id: 'email', label: 'email' },
      { id: 'phone', label: 'phone' },
    ];

    for (const field of systemFields) {
      const systemQuestion = allQuestions.find(
        (q) => q.id === field.id && q.system === true,
      );
      if (!systemQuestion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `System field "${field.id}" must be present with system: true`,
          path: ['sections'],
        });
      } else if (!systemQuestion.required) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `System field "${field.id}" must be required`,
          path: ['sections'],
        });
      }
    }

    // Ensure options exist for select/radio/multi_select types
    for (const question of allQuestions) {
      if (
        (TYPES_REQUIRING_OPTIONS as readonly string[]).includes(question.type) &&
        (!question.options || question.options.length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Question "${question.id}" (type: ${question.type}) must have at least one option`,
          path: ['sections'],
        });
      }
    }

    // Validate visibleWhen references valid questionIds
    for (const question of allQuestions) {
      if (question.visibleWhen) {
        if (!allQuestionIds.has(question.visibleWhen.questionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Question "${question.id}" visibleWhen references unknown questionId "${question.visibleWhen.questionId}"`,
            path: ['sections'],
          });
        }
        // Prevent self-reference
        if (question.visibleWhen.questionId === question.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Question "${question.id}" visibleWhen cannot reference itself`,
            path: ['sections'],
          });
        }
      }
    }

    // Validate section-level visibleWhen
    const SYSTEM_FIELD_IDS = ['name', 'email', 'phone'];
    for (let si = 0; si < config.sections.length; si++) {
      const section = config.sections[si];
      if (!section.visibleWhen) continue;

      // Sections containing system fields must not have visibleWhen
      const hasSystemField = section.questions.some(
        (q) => q.system || SYSTEM_FIELD_IDS.includes(q.id),
      );
      if (hasSystemField) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Section "${section.title}" contains system fields and must not have visibleWhen`,
          path: ['sections', si, 'visibleWhen'],
        });
        continue;
      }

      // visibleWhen must reference a valid questionId
      if (!allQuestionIds.has(section.visibleWhen.questionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Section "${section.title}" visibleWhen references unknown questionId "${section.visibleWhen.questionId}"`,
          path: ['sections', si, 'visibleWhen'],
        });
        continue;
      }

      // visibleWhen can only reference questions in EARLIER sections (prevent forward references and cycles)
      const earlierQuestionIds = new Set<string>();
      for (let ej = 0; ej < si; ej++) {
        for (const q of config.sections[ej].questions) {
          earlierQuestionIds.add(q.id);
        }
      }
      if (!earlierQuestionIds.has(section.visibleWhen.questionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Section "${section.title}" visibleWhen can only reference questions from earlier sections`,
          path: ['sections', si, 'visibleWhen'],
        });
      }
    }
  });

export type IntakeFormConfig = z.infer<typeof formConfigSchema>;

export type FormSection = IntakeFormConfig['sections'][number];
export type FormQuestion = FormSection['questions'][number];
