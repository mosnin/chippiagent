'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserCheck } from 'lucide-react';

interface ConvertLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  leadId: string;
  currentTags: string[];
  onConverted: (leadId: string) => void;
}

export function ConvertLeadDialog({
  open,
  onOpenChange,
  leadName,
  leadId,
  onConverted,
}: ConvertLeadDialogProps) {
  const [loading, setLoading] = useState(false);

  async function handleConvert() {
    setLoading(true);
    try {
      // PATCH is field-scoped. Sending a stale full-row snapshot here
      // last-write-wins-clobbered concurrent Chippi / assign / note writes
      // (phone, notes, follow-up, assigned tag). Only remove the lead tags.
      const res = await fetch(`/api/contacts/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          removeTags: ['application-link', 'new-lead'],
        }),
      });
      if (res.ok) {
        toast.success('Converted to client.');
        onConverted(leadId);
        onOpenChange(false);
      } else {
        toast.error("Couldn't convert this lead. Try again.");
      }
    } catch {
      toast.error("Couldn't convert this lead. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck size={18} className="text-primary" />
            Convert to client
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Move{' '}
            <span className="font-semibold text-foreground">{leadName}</span> to
            your Clients pipeline? They&apos;ll be removed from the Leads inbox and
            you can track them through Qualifying → Tour → Applied.
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleConvert} disabled={loading}>
              {loading ? 'Moving...' : 'Convert to client'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
