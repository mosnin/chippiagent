'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Plus, Trash2, Megaphone, X, Loader2 } from 'lucide-react';

type Announcement = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export default function AnnouncementsClient() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    loadAnnouncements();
  }, []);

  async function loadAnnouncements() {
    try {
      const res = await fetch('/api/broker/announcements');
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data);
      }
    } catch {
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setTitle('');
    setBody('');
    setShowForm(false);
  }

  async function handlePost() {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/broker/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to post announcement');
      }

      const newAnn = await res.json();
      setAnnouncements((prev) => [newAnn, ...prev]);
      toast.success('Announcement posted');
      resetForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return;

    try {
      const res = await fetch(`/api/broker/announcements?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      toast.success('Announcement deleted');
    } catch {
      toast.error('Failed to delete announcement');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Team-wide announcements and updates
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={15} />
          New Announcement
        </button>
      </div>

      {/* Post form */}
      {showForm && (
        <Card>
          <CardContent className="px-5 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Post Announcement</h2>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Announcement title"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your announcement..."
                  rows={5}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={resetForm}
                  className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePost}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  Post
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Announcements list */}
      {loading ? (
        <Card>
          <CardContent className="px-5 py-10 text-center">
            <Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" />
          </CardContent>
        </Card>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center space-y-2">
            <Megaphone size={24} className="mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
            <p className="text-xs text-muted-foreground/60">
              Post announcements to keep your team informed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <Card key={ann.id}>
              <CardContent className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <Megaphone size={14} className="text-primary flex-shrink-0" />
                      <h3 className="text-sm font-semibold truncate">{ann.title}</h3>
                    </div>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                      {ann.body}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-medium">{ann.authorName}</span>
                      <span>&middot;</span>
                      <span>{relativeTime(ann.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(ann.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 transition-colors flex-shrink-0"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
