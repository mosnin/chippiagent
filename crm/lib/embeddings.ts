import type OpenAI from 'openai';
import { getLLMClient, EMBEDDING_MODEL } from '@/lib/llm';

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (!_client) _client = getLLMClient();
  return _client;
}

export async function embedText(text: string): Promise<number[]> {
  const response = await client().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}
