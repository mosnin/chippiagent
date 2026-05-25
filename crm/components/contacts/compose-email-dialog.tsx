'use client';

import { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TemplatePicker } from '@/components/templates/template-picker';

interface ComposeEmailDialogProps {
  contactId: string;
  contactName: string;
  contactEmail: string;
}

export function ComposeEmailDialog({ contactId, contactName, contactEmail }: ComposeEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setStatus('idle');
    try {
      const res = await fetch(`/api/contacts/${contactId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      if (res.ok) {
        setStatus('sent');
        setTimeout(() => {
          setOpen(false);
          setSubject('');
          setBody('');
          setStatus('idle');
        }, 1500);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-foreground"
      >
        <Mail size={14} className="text-muted-foreground" />
        Send email
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail size={16} className="text-muted-foreground" />
              Email {contactName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* To field */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">To</p>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-sm text-foreground">
                {contactEmail}
              </div>
            </div>

            {/* Subject + template picker */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Subject</p>
                <TemplatePicker
                  channel="email"
                  ctx={{
                    contactName,
                    contactFirstName: contactName.split(' ')[0] ?? contactName,
                  }}
                  onPick={({ subject: s, body: b }) => {
                    if (s) setSubject(s);
                    setBody(b);
                  }}
                  disabled={sending}
                />
              </div>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject line…"
                className="bg-card"
              />
            </div>

            {/* Body */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Message</p>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message…"
                rows={6}
                className="w-full text-sm rounded-lg border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {status === 'error' && (
              <p className="text-xs text-destructive">Failed to send. Please try again.</p>
            )}
            {status === 'sent' && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Email sent successfully!</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !body.trim() || status === 'sent'}
                className={cn('gap-2', status === 'sent' && 'bg-emerald-600 hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-500')}
              >
                <Send size={14} />
                {sending ? 'Sending…' : status === 'sent' ? 'Sent!' : 'Send'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
