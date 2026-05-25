'use client';

import { FileDown } from 'lucide-react';

export function PdfExportButton({ contactId }: { contactId: string }) {
  return (
    <a
      href={`/api/applications/pdf?contactId=${contactId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
    >
      <FileDown size={13} />
      Export PDF
    </a>
  );
}
