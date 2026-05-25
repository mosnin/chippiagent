'use client';

import { useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import { documentKindLabel, formatFileSize, type DealDocumentKind } from '@/lib/deals/documents';

interface Props {
  token: string;
  docId: string;
  label: string;
  kind: string;
  sizeBytes: number | null;
}

/**
 * Client-side download trigger for a document in a public packet. Fetches a
 * short-lived signed URL from the token-scoped endpoint, then opens it in a
 * new tab.
 */
export function PacketDocumentLink({ token, docId, label, kind, sizeBytes }: Props) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const res = await fetch(`/api/packet/${token}/documents/${docId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-muted/40 transition-colors"
    >
      <FileText size={16} className="text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-[11px] text-muted-foreground">
          {documentKindLabel(kind as DealDocumentKind)}
          {sizeBytes ? ` · ${formatFileSize(sizeBytes)}` : ''}
        </p>
      </div>
      {loading ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : <Download size={14} className="text-muted-foreground" />}
    </button>
  );
}
