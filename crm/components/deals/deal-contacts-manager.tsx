'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, X, Check } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DEAL_CONTACT_ROLES } from '@/lib/deals/roles';
import type { DealContactRole } from '@/lib/types';

interface LinkedContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: DealContactRole | null;
}

interface ContactSearchResult {
  id: string;
  name: string;
  email: string | null;
  leadType: 'rental' | 'buyer';
}

interface DealContactsManagerProps {
  dealId: string;
  slug: string;
  initialContacts: LinkedContact[];
}

export function DealContactsManager({ dealId, slug, initialContacts }: DealContactsManagerProps) {
  const [contacts, setContacts] = useState<LinkedContact[]>(initialContacts);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/contacts?slug=${encodeURIComponent(slug)}&search=${encodeURIComponent(q)}&limit=20`);
      if (res.ok) {
        const data: ContactSearchResult[] = await res.json();
        setResults(data);
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

  async function patchContacts(newContacts: LinkedContact[], previous: LinkedContact[]) {
    const contactIds = newContacts.map((c) => c.id);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds }),
      });
      if (!res.ok) {
        setContacts(previous);
        toast.error("Couldn't update the contacts. Try again.");
      }
    } catch {
      setContacts(previous);
      toast.error("Couldn't update the contacts. Try again.");
    }
  }

  function handleAdd(result: ContactSearchResult) {
    const alreadyLinked = contacts.some((c) => c.id === result.id);
    if (alreadyLinked) {
      // Toggle off — remove
      const previous = contacts;
      const updated = contacts.filter((c) => c.id !== result.id);
      setContacts(updated);
      patchContacts(updated, previous);
      return;
    }
    const previous = contacts;
    const newContact: LinkedContact = {
      id: result.id,
      name: result.name,
      email: result.email,
      phone: null,
      role: null,
    };
    const updated = [...contacts, newContact];
    setContacts(updated);
    patchContacts(updated, previous);
  }

  /**
   * Update a contact's role. Uses the dedicated role endpoint so it doesn't
   * race with list-level patches.
   */
  async function handleRoleChange(contactId: string, role: DealContactRole | null) {
    const previous = contacts;
    setContacts((list) => list.map((c) => c.id === contactId ? { ...c, role } : c));

    try {
      const res = await fetch(`/api/deals/${dealId}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        setContacts(previous);
        toast.error("Couldn't save that role.");
      }
    } catch {
      setContacts(previous);
      toast.error("Couldn't save that role.");
    }
  }

  function handleRemove(contactId: string) {
    const previous = contacts;
    const updated = contacts.filter((c) => c.id !== contactId);
    setContacts(updated);
    patchContacts(updated, previous);
  }

  return (
    <div className="space-y-3">
      {/* Linked contacts list */}
      {contacts.length === 0 && !isAddOpen && (
        <p className="text-sm text-muted-foreground">No contacts linked.</p>
      )}

      {contacts.length > 0 && (
        <div className="space-y-1.5">
          {contacts.map((contact) => (
            <div key={contact.id} className="flex items-center gap-2.5">
              {/* Initial circle */}
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                {contact.name.charAt(0).toUpperCase()}
              </div>

              {/* Name + email/phone */}
              <Link
                href={`/s/${slug}/contacts/${contact.id}`}
                className="flex-1 min-w-0 hover:underline"
              >
                <p className="text-sm font-medium leading-tight truncate">{contact.name}</p>
                {(contact.email || contact.phone) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {contact.email ?? contact.phone}
                  </p>
                )}
              </Link>

              {/* Role selector — compact dropdown. Empty string = no role. */}
              <select
                value={contact.role ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  handleRoleChange(contact.id, v === '' ? null : (v as DealContactRole));
                }}
                className="flex-shrink-0 text-xs border border-border rounded px-1.5 py-1 bg-transparent max-w-[120px]"
                aria-label={`Role for ${contact.name}`}
              >
                <option value="">Role…</option>
                {DEAL_CONTACT_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => handleRemove(contact.id)}
                className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Remove contact"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add contact toggle button */}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setIsAddOpen((v) => !v);
          if (isAddOpen) {
            setQuery('');
            setResults([]);
          }
        }}
        className="gap-1.5"
      >
        <Plus size={14} />
        Add contact
      </Button>

      {/* Collapsible add section */}
      {isAddOpen && (
        <div className="space-y-2">
          <Input
            placeholder="Search people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="h-8 text-sm"
          />

          {searching && (
            <p className="text-xs text-muted-foreground px-1">Searching…</p>
          )}

          {!searching && query.trim() && results.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">No contacts found.</p>
          )}

          {results.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden divide-y divide-border">
              {results.map((result) => {
                const isSelected = contacts.some((c) => c.id === result.id);
                return (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => handleAdd(result)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60',
                      isSelected && 'bg-primary/5'
                    )}
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                      {result.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">{result.name}</p>
                      {result.email && (
                        <p className="text-xs text-muted-foreground truncate">{result.email}</p>
                      )}
                    </div>
                    {isSelected ? (
                      <Check size={14} className="flex-shrink-0 text-primary" />
                    ) : (
                      <Plus size={14} className="flex-shrink-0 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
