import { supabase } from '@/lib/supabase';
import { randomUUID } from 'crypto';

interface ToolCallRecord {
  stepId: string;
  spaceId: string;
  taskId?: string;
  toolName: string;
  startedAt: Date;
}

// In-flight tool call tracking
const inFlight = new Map<string, ToolCallRecord>();

export async function logToolCallStart(
  spaceId: string,
  toolName: string,
  args: Record<string, unknown>,
  taskId?: string
): Promise<string> {
  const stepId = randomUUID();
  const inputSummary = JSON.stringify(args).slice(0, 500);

  try {
    await supabase.from('ExecutionStep').insert({
      id: stepId,
      spaceId,
      taskId: taskId ?? null,
      stepIndex: 0,
      stepType: 'tool_call',
      toolName,
      inputSummary,
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    inFlight.set(stepId, { stepId, spaceId, taskId, toolName, startedAt: new Date() });
  } catch {
    // Non-blocking — logging failure must never break the tool call
  }

  return stepId;
}

export async function logToolCallComplete(stepId: string, outputSummary: string): Promise<void> {
  const record = inFlight.get(stepId);
  if (!record) return;
  inFlight.delete(stepId);

  try {
    await supabase.from('ExecutionStep').update({
      outputSummary: outputSummary.slice(0, 500),
      toolResult: { output: outputSummary.slice(0, 500) },
      status: 'completed',
      completedAt: new Date().toISOString(),
    }).eq('id', stepId);
  } catch {
    // Non-blocking
  }
}

export async function logToolCallError(stepId: string, error: string): Promise<void> {
  const record = inFlight.get(stepId);
  if (!record) return;
  inFlight.delete(stepId);

  try {
    await supabase.from('ExecutionStep').update({
      errorMessage: error.slice(0, 1000),
      outputSummary: error.slice(0, 500),
      status: 'failed',
      completedAt: new Date().toISOString(),
    }).eq('id', stepId);
  } catch {
    // Non-blocking
  }
}
