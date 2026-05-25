'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DeleteDealButtonProps {
  dealId: string;
  slug: string;
  dealTitle: string;
}

export function DeleteDealButton({ dealId, slug, dealTitle }: DeleteDealButtonProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete "${dealTitle}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/deals/${dealId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push(`/s/${slug}/deals`);
      } else {
        toast.error("Couldn't delete that deal. Try again.");
      }
    } catch {
      toast.error("Couldn't delete that deal. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
      onClick={handleDelete}
      disabled={deleting}
      aria-label="Delete deal"
    >
      <Trash2 size={15} />
    </Button>
  );
}
