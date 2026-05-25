'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SECTION_LABEL, PRIMARY_PILL } from '@/lib/typography';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AGENT_MODEL_OPTIONS } from '@/lib/swarm-types';
import type { CustomAgent } from '@/lib/swarm-types';
import { AgentCapabilityPicker } from './agent-capability-picker';

interface AgentBuilderFormProps {
  slug: string;
  spaceId: string;
  initialAgent?: Partial<CustomAgent>;
  onSaved?: (agent: CustomAgent) => void;
}

const MAX_NAME = 100;
const MAX_PROMPT = 4000;

export function AgentBuilderForm({ slug, spaceId, initialAgent, onSaved }: AgentBuilderFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialAgent?.id);

  const [name, setName] = useState(initialAgent?.name ?? '');
  const [description, setDescription] = useState(initialAgent?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initialAgent?.systemPrompt ?? '');
  const [model, setModel] = useState(initialAgent?.model ?? 'gpt-4o-mini');
  const [capabilities, setCapabilities] = useState<string[]>(initialAgent?.capabilities ?? []);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Name is required.');
      return;
    }
    if (!systemPrompt.trim()) {
      toast.error('Agent instructions are required.');
      return;
    }

    setSaving(true);
    try {
      const url = isEdit
        ? `/api/custom-agents/${initialAgent!.id}`
        : '/api/custom-agents';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, systemPrompt, model, capabilities, spaceId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Something went wrong.');
      }

      const data = await res.json();
      const agent: CustomAgent = data.agent ?? data;
      toast.success(isEdit ? 'Agent updated.' : 'Agent created.');
      onSaved?.(agent);
      router.push(`/s/${slug}/agents`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div className="space-y-1.5">
        <p className={cn(SECTION_LABEL)}>Name</p>
        <Label htmlFor="agent-name" className="sr-only">
          Name
        </Label>
        <Input
          id="agent-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
          placeholder="e.g. Lead Qualifier, Market Researcher, Follow-up Writer"
          required
          maxLength={MAX_NAME}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <p className={cn(SECTION_LABEL)}>Description</p>
        <Label htmlFor="agent-description" className="sr-only">
          Description
        </Label>
        <textarea
          id="agent-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this agent specialize in?"
          className={cn(
            'w-full min-h-[56px] rounded-md border border-input bg-transparent px-3 py-2',
            'text-sm placeholder:text-muted-foreground/70 text-foreground',
            'focus-visible:outline-none focus-visible:border-ring',
            'focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            'transition-colors duration-150 resize-none',
          )}
        />
      </div>

      {/* System prompt */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className={cn(SECTION_LABEL)}>Agent instructions</p>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {systemPrompt.length}/{MAX_PROMPT}
          </span>
        </div>
        <Label htmlFor="agent-prompt" className="sr-only">
          Agent instructions
        </Label>
        <textarea
          id="agent-prompt"
          rows={8}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value.slice(0, MAX_PROMPT))}
          placeholder="You are a real estate lead qualifier. Your job is to analyze lead quality and score prospects based on..."
          required
          maxLength={MAX_PROMPT}
          className={cn(
            'w-full min-h-[160px] rounded-md border border-input bg-transparent px-3 py-2',
            'text-sm placeholder:text-muted-foreground/70 text-foreground',
            'focus-visible:outline-none focus-visible:border-ring',
            'focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            'transition-colors duration-150 resize-y',
          )}
        />
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <p className={cn(SECTION_LABEL)}>Model</p>
        <Label htmlFor="agent-model" className="sr-only">
          Model
        </Label>
        <select
          id="agent-model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className={cn(
            'w-full h-9 rounded-md border border-input bg-transparent px-3',
            'text-sm text-foreground',
            'focus-visible:outline-none focus-visible:border-ring',
            'focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            'transition-colors duration-150',
          )}
        >
          {AGENT_MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Capabilities */}
      <AgentCapabilityPicker value={capabilities} onChange={setCapabilities} />

      {/* Submit */}
      <div className="flex justify-end pt-2">
        <button type="submit" disabled={saving} className={cn(PRIMARY_PILL, 'disabled:opacity-50')}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create agent'}
        </button>
      </div>
    </form>
  );
}
