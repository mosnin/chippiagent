import { getOpenAIClient } from '@/lib/ai-tools/openai-client';

export interface CompactionInput {
  messages: Array<{ role: string; content: string }>;
  maxContextChars: number;
  model: string;
}

export function estimateContextChars(messages: Array<{ role: string; content: string }>): number {
  return messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
}

export async function compactContext(input: CompactionInput): Promise<{
  messages: Array<{ role: string; content: string }>;
  summary: string;
  removedCount: number;
}> {
  const { messages, maxContextChars } = input;

  if (estimateContextChars(messages) <= maxContextChars) {
    return { messages, summary: '', removedCount: 0 };
  }

  const splitIndex = Math.floor(messages.length / 2);
  const oldestHalf = messages.slice(0, splitIndex);
  const newestHalf = messages.slice(splitIndex);

  const conversationText = oldestHalf
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const { client } = getOpenAIClient();

  const completion = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'user',
        content:
          'Summarize the following conversation history in one dense paragraph, preserving key facts, decisions, and context:\n\n' +
          conversationText,
      },
    ],
  });

  const summary = completion.choices[0]?.message?.content ?? '';

  const compactedMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: `Previous context summary: ${summary}` },
    ...newestHalf,
  ];

  return {
    messages: compactedMessages,
    summary,
    removedCount: oldestHalf.length,
  };
}
