import {
  Type,
  AlignLeft,
  Mail,
  Phone,
  Hash,
  List,
  ListChecks,
  CircleDot,
  CheckSquare,
  Calendar,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FormQuestion } from './types';

export interface QuestionTypeConfig {
  type: FormQuestion['type'];
  label: string;
  icon: LucideIcon;
  defaultConfig: Partial<FormQuestion>;
}

export const QUESTION_TYPES: QuestionTypeConfig[] = [
  {
    type: 'text',
    label: 'Short Text',
    icon: Type,
    defaultConfig: {
      label: 'Short Text',
      placeholder: 'Enter text...',
      required: false,
    },
  },
  {
    type: 'textarea',
    label: 'Long Text',
    icon: AlignLeft,
    defaultConfig: {
      label: 'Long Text',
      placeholder: 'Enter your answer...',
      required: false,
    },
  },
  {
    type: 'email',
    label: 'Email',
    icon: Mail,
    defaultConfig: {
      label: 'Email Address',
      placeholder: 'name@example.com',
      required: false,
    },
  },
  {
    type: 'phone',
    label: 'Phone',
    icon: Phone,
    defaultConfig: {
      label: 'Phone Number',
      placeholder: '(555) 123-4567',
      required: false,
    },
  },
  {
    type: 'number',
    label: 'Number',
    icon: Hash,
    defaultConfig: {
      label: 'Number',
      placeholder: '0',
      required: false,
    },
  },
  {
    type: 'select',
    label: 'Dropdown',
    icon: List,
    defaultConfig: {
      label: 'Select One',
      required: false,
      options: [
        { value: 'option_1', label: 'Option 1' },
        { value: 'option_2', label: 'Option 2' },
      ],
    },
  },
  {
    type: 'multi_select',
    label: 'Multi Select',
    icon: ListChecks,
    defaultConfig: {
      label: 'Select Multiple',
      required: false,
      options: [
        { value: 'option_1', label: 'Option 1' },
        { value: 'option_2', label: 'Option 2' },
      ],
    },
  },
  {
    type: 'radio',
    label: 'Radio',
    icon: CircleDot,
    defaultConfig: {
      label: 'Choose One',
      required: false,
      options: [
        { value: 'option_1', label: 'Option 1' },
        { value: 'option_2', label: 'Option 2' },
      ],
    },
  },
  {
    type: 'checkbox',
    label: 'Checkbox',
    icon: CheckSquare,
    defaultConfig: {
      label: 'Checkbox',
      required: false,
    },
  },
  {
    type: 'date',
    label: 'Date',
    icon: Calendar,
    defaultConfig: {
      label: 'Date',
      required: false,
    },
  },
];

export function getQuestionTypeConfig(type: FormQuestion['type']): QuestionTypeConfig | undefined {
  return QUESTION_TYPES.find((qt) => qt.type === type);
}
