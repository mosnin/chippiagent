// Shared TypeScript types for the custom agents + swarm feature.

export type SwarmStatus = 'queued' | 'planning' | 'running' | 'auditing' | 'completed' | 'failed' | 'cancelled';
export type MemberStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface CustomAgent {
  id: string;
  spaceId: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  capabilities: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SwarmRun {
  id: string;
  spaceId: string;
  goal: string;
  status: SwarmStatus;
  plan: SwarmPlan | null;
  result: string | null;
  errorMessage: string | null;
  totalCostCents: number;
  createdAt: string;
  completedAt: string | null;
}

export interface SwarmPlan {
  tasks: SwarmPlanTask[];
  rationale?: string;
}

export interface SwarmPlanTask {
  name: string;
  role: string;
  task: string;
  agentIndex: number;
  wave: number;
}

export interface SwarmMember {
  id: string;
  swarmRunId: string;
  customAgentId: string | null;
  name: string;
  role: string | null;
  systemPrompt: string;
  task: string;
  status: MemberStatus;
  output: string | null;
  wave: number;
  costCents: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface SwarmEvent {
  id: string;
  swarmRunId: string;
  memberId: string | null;
  type: SwarmEventType;
  data: Record<string, unknown>;
  createdAt: string;
}

export type SwarmEventType =
  | 'connected'
  | 'swarm_planning'
  | 'plan_created'
  | 'agent_started'
  | 'agent_thinking'
  | 'agent_completed'
  | 'agent_failed'
  | 'wave_2_starting'
  | 'audit_started'
  | 'swarm_completed'
  | 'swarm_failed'
  | 'swarm_cancelled'
  | 'stream_end';

export interface AIUserProfile {
  id: string;
  spaceId: string;
  displayName: string | null;
  businessFocus: string[];
  yearsExperience: number | null;
  workingStyle: string | null;
  communicationTone: string | null;
  currentGoals: string | null;
  quirksAndPreferences: string | null;
  agentPersonalizationNote: string | null;
  role: string | null;
  zipCode: string | null;
  leadSources: string[];
  createdAt: string;
  updatedAt: string;
}

export const BUSINESS_FOCUS_OPTIONS = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'luxury', label: 'Luxury' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'investment', label: 'Investment' },
  { value: 'new_construction', label: 'New Construction' },
] as const;

export const WORKING_STYLE_OPTIONS = [
  { value: 'aggressive', label: 'Aggressive — close-focused, high-volume' },
  { value: 'methodical', label: 'Methodical — process-driven, thorough' },
  { value: 'relationship-first', label: 'Relationship-first — long-term client focus' },
  { value: 'tech-forward', label: 'Tech-forward — data and automation driven' },
  { value: 'balanced', label: 'Balanced — adaptable to each situation' },
] as const;

export const COMMUNICATION_TONE_OPTIONS = [
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'direct', label: 'Direct' },
  { value: 'warm', label: 'Warm' },
] as const;

export const AGENT_MODEL_OPTIONS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini — fast, efficient' },
  { value: 'gpt-4o', label: 'GPT-4o — most capable' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini — balanced' },
] as const;
