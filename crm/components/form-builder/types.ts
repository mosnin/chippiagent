export interface IntakeFormConfig {
  version: number;
  leadType: 'rental' | 'buyer' | 'general';
  sections: FormSection[];
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  position: number;
  questions: FormQuestion[];
  visibleWhen?: {
    questionId: string;
    operator: 'equals' | 'not_equals' | 'contains';
    value: string;
  };
}

export interface FormQuestion {
  id: string;
  type: 'text' | 'textarea' | 'email' | 'phone' | 'number' | 'select' | 'multi_select' | 'radio' | 'checkbox' | 'date';
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  position: number;
  system?: boolean;
  options?: { value: string; label: string; scoreValue?: number }[];
  validation?: { pattern?: string; min?: number; max?: number; minLength?: number; maxLength?: number };
  scoring?: { weight: number; mappings?: { value: string; points: number }[] };
  visibleWhen?: { questionId: string; operator: 'equals' | 'not_equals' | 'contains'; value: string };
}
