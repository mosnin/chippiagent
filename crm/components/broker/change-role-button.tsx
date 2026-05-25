'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Shield, ChevronDown } from 'lucide-react';

interface ChangeRoleButtonProps {
  membershipId: string;
  currentRole: string;
  memberName: string;
}

const ROLES = [
  { value: 'broker_admin', label: 'Admin' },
  { value: 'realtor_member', label: 'Realtor' },
];

export function ChangeRoleButton({ membershipId, currentRole, memberName }: ChangeRoleButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleChange(newRole: string) {
    if (newRole === currentRole) {
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/broker/members/${membershipId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'Failed to change role.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        title={`Change role for ${memberName}`}
      >
        <Shield size={11} />
        <ChevronDown size={10} />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-card rounded-lg border border-border shadow-lg overflow-hidden min-w-[140px]">
          {ROLES.map((r) => (
            <button
              key={r.value}
              onClick={() => handleChange(r.value)}
              className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-muted transition-colors ${
                r.value === currentRole ? 'text-primary bg-primary/5' : 'text-foreground'
              }`}
              disabled={loading}
            >
              {r.label}
              {r.value === currentRole && ' (current)'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
