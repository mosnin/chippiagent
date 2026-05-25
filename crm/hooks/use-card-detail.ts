// Fetches rich card detail data when a card is expanded.
// Caches by type+id so re-expanding doesn't re-fetch.

import { useState, useCallback, useRef } from 'react';

export type CardType = 'contact' | 'deal' | 'tour' | 'property';

export interface CardDetailState<T = unknown> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useCardDetail<T = unknown>(type: CardType, id: string, spaceId: string) {
  const [state, setState] = useState<CardDetailState<T>>({ data: null, loading: false, error: null });
  const fetched = useRef(false);

  const fetchDetail = useCallback(async () => {
    if (fetched.current) return; // already fetched
    fetched.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`/api/cards/${type}/${id}?spaceId=${spaceId}`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setState({ data: json.data, loading: false, error: null });
    } catch {
      setState({ data: null, loading: false, error: 'Could not load details' });
      fetched.current = false; // allow retry
    }
  }, [type, id, spaceId]);

  return { ...state, fetchDetail };
}
