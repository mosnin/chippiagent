'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Check, Plus, X, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface WizardContact {
  id: string;
  name: string;
  email: string | null;
  leadType: 'rental' | 'buyer' | 'seller';
}

interface WizardStepContactsProps {
  slug: string;
  selectedContacts: WizardContact[];
  onSelectionChange: (contacts: WizardContact[]) => void;
}

export function WizardStepContacts({ slug, selectedContacts, onSelectionChange }: WizardStepContactsProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WizardContact[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/contacts?slug=${encodeURIComponent(slug)}&search=${encodeURIComponent(q)}&limit=20`
      );
      if (res.ok) {
        const data = await res.json();
        // Normalize leadType in case it's missing
        const normalized: WizardContact[] = (data as Array<{
          id: string;
          name: string;
          email: string | null;
          leadType?: 'rental' | 'buyer' | 'seller' | null;
        }>).map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email ?? null,
          leadType: c.leadType === 'buyer' ? 'buyer' : c.leadType === 'seller' ? 'seller' : 'rental',
        }));
        setResults(normalized);
      }
    } finally {
      setSearching(false);
    }
  }, [slug]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  function toggleContact(contact: WizardContact) {
    const isSelected = selectedContacts.some((c) => c.id === contact.id);
    if (isSelected) {
      onSelectionChange(selectedContacts.filter((c) => c.id !== contact.id));
    } else {
      onSelectionChange([...selectedContacts, contact]);
    }
  }

  function removeContact(id: string) {
    onSelectionChange(selectedContacts.filter((c) => c.id !== id));
  }

  const hasBuyer = selectedContacts.some((c) => c.leadType === 'buyer');
  const hasSeller = selectedContacts.some((c) => c.leadType === 'seller');

  return (
    <div className="space-y-4">
      {/* Heading */}
      <div>
        <h2 className="text-lg font-semibold">Who is this deal for?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Search for a contact to link to this deal. We&apos;ll suggest the right pipeline type.
        </p>
      </div>

      {/* Selected contact chips */}
      {selectedContacts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedContacts.map((contact) => (
            <div
              key={contact.id}
              className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full pl-3 pr-2 py-1"
            >
              <span className="leading-none">{contact.name}</span>
              <button
                type="button"
                onClick={() => removeContact(contact.id)}
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-primary/20 transition-colors"
                title={`Remove ${contact.name}`}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search input */}
      <Input
        placeholder="Search by name or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="text-sm"
      />

      {/* Search feedback */}
      {searching && (
        <p className="text-xs text-muted-foreground">Searching…</p>
      )}
      {!searching && query.trim() && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No contacts found.</p>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden divide-y divide-border">
          {results.map((result) => {
            const isSelected = selectedContacts.some((c) => c.id === result.id);
            return (
              <button
                key={result.id}
                type="button"
                onClick={() => toggleContact(result)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
                  isSelected && 'bg-primary/5'
                )}
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                  {result.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">{result.name}</p>
                  {result.email && (
                    <p className="text-xs text-muted-foreground truncate">{result.email}</p>
                  )}
                </div>

                {/* Lead type badge */}
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0',
                  result.leadType === 'buyer'
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400'
                    : result.leadType === 'seller'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                    : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'
                )}>
                  {result.leadType === 'buyer' ? 'Buyer' : result.leadType === 'seller' ? 'Seller' : 'Rental'}
                </span>

                {/* Check / plus icon */}
                {isSelected ? (
                  <Check size={15} className="flex-shrink-0 text-primary" />
                ) : (
                  <Plus size={15} className="flex-shrink-0 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Pipeline suggestion info */}
      {hasBuyer && (
        <div className="flex items-center gap-2 rounded-md bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 px-3 py-2 text-xs font-medium">
          <Info size={13} className="flex-shrink-0" />
          Buyer pipeline will be suggested
        </div>
      )}
      {hasSeller && !hasBuyer && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2 text-xs font-medium">
          <Info size={13} className="flex-shrink-0" />
          Seller pipeline will be suggested
        </div>
      )}
    </div>
  );
}
