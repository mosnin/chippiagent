'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, Loader2, Plus, Trash2, Key } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  H3,
  SECTION_LABEL,
  BODY_MUTED,
  CAPTION,
  PRIMARY_PILL,
} from '@/lib/typography';
import { TemplatesEditor } from '@/components/settings/templates-editor';
import type { MessageTemplate } from '@/lib/message-templates';

type McpKey = {
  id: string;
  name: string;
  keyPrefix: string;
  clientId?: string;
  lastUsedAt: string | null;
  createdAt: string;
};

interface IntegrationsSectionProps {
  slug: string;
}

function CredentialRow({
  label,
  value,
  show,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  show: boolean;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className={SECTION_LABEL}>{label}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-9 rounded-md border border-border/70 bg-background px-3 flex items-center overflow-hidden">
          <span className="text-sm font-mono select-all truncate">
            {show ? value : '•'.repeat(Math.min(value.length, 40))}
          </span>
        </div>
        <button
          type="button"
          className="h-9 px-3 rounded-md border border-border/70 text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors duration-150 inline-flex items-center gap-1.5"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            onCopy();
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/**
 * MCP keys + message templates. Both folded inline because they're each one
 * short surface and the realtor visits them rarely. Two sections, no tabs.
 */
export function IntegrationsSection({ slug }: IntegrationsSectionProps) {
  const MCP_ENDPOINT = 'https://my.usechippi.com/api/mcp';

  // ── MCP state ──────────────────────────────────────────────────────────
  const [mcpKeys, setMcpKeys] = useState<McpKey[]>([]);
  const [mcpKeysLoading, setMcpKeysLoading] = useState(true);
  const [mcpNewKeyName, setMcpNewKeyName] = useState('');
  const [mcpCreating, setMcpCreating] = useState(false);
  const [mcpNewCreds, setMcpNewCreds] = useState<{
    key: string;
    clientId: string;
    clientSecret: string;
  } | null>(null);
  const [mcpShowForm, setMcpShowForm] = useState(false);
  const [mcpCopiedEndpoint, setMcpCopiedEndpoint] = useState(false);
  const [mcpCopiedField, setMcpCopiedField] = useState<string | null>(null);
  const [mcpDeletingId, setMcpDeletingId] = useState<string | null>(null);
  const [mcpShowSecrets, setMcpShowSecrets] = useState(false);

  // ── Templates state ────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/mcp-keys?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setMcpKeys(d.keys ?? []))
      .catch(() => setMcpKeys([]))
      .finally(() => setMcpKeysLoading(false));
  }, [slug]);

  useEffect(() => {
    fetch('/api/message-templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTemplates(Array.isArray(data) ? data : data.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);

  async function handleCreateMcpKey() {
    if (!mcpNewKeyName.trim()) return;
    setMcpCreating(true);
    try {
      const res = await fetch('/api/mcp-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name: mcpNewKeyName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setMcpNewCreds({
          key: data.key,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
        });
        setMcpKeys((prev) => [
          {
            id: data.id,
            name: data.name,
            keyPrefix: data.keyPrefix,
            clientId: data.clientId,
            lastUsedAt: null,
            createdAt: data.createdAt,
          },
          ...prev,
        ]);
        setMcpNewKeyName('');
      } else {
        alert(data.error ?? "Couldn't create that key. Try again.");
      }
    } catch {
      alert('I lost the connection. Try again.');
    } finally {
      setMcpCreating(false);
    }
  }

  async function handleDeleteMcpKey(id: string) {
    if (!confirm('Delete this key? Anything using it stops working right away.')) return;
    setMcpDeletingId(id);
    try {
      const res = await fetch('/api/mcp-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, id }),
      });
      if (res.ok) {
        setMcpKeys((prev) => prev.filter((k) => k.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Couldn't delete that key. Try again.");
      }
    } catch {
      alert('I lost the connection. Try again.');
    } finally {
      setMcpDeletingId(null);
    }
  }

  return (
    <div className="space-y-10">
      {/* MCP — endpoint + how to connect */}
      <div className="space-y-5">
        <p className={BODY_MUTED}>
          Connect external AI tools (Claude, Cursor, Windsurf) to your workspace via MCP.
        </p>

        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-medium text-foreground">Endpoint</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-9 rounded-md border border-border/70 bg-background px-3 flex items-center">
              <span className="text-sm font-mono select-all">{MCP_ENDPOINT}</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(MCP_ENDPOINT);
                setMcpCopiedEndpoint(true);
                setTimeout(() => setMcpCopiedEndpoint(false), 2000);
              }}
              className="h-9 px-3 rounded-md border border-border/70 text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors duration-150 inline-flex items-center gap-1.5"
            >
              {mcpCopiedEndpoint ? <Check size={12} /> : <Copy size={12} />}
              {mcpCopiedEndpoint ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className={CAPTION}>Streamable HTTP transport.</p>
        </div>
      </div>

      {/* API Keys */}
      <div
        id="api-keys"
        className="space-y-5 pt-6 border-t border-border/60 scroll-mt-24"
      >
        <div className="flex items-center justify-between gap-3">
          <p className={SECTION_LABEL}>API keys</p>
          {!mcpShowForm && !mcpNewCreds && (
            <button
              type="button"
              onClick={() => setMcpShowForm(true)}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
            >
              <Plus size={12} />
              New key
            </button>
          )}
        </div>

        {mcpNewCreds && (
          <div className="rounded-md border border-border/70 bg-foreground/[0.02] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className={H3}>Your MCP credentials</p>
              <button
                type="button"
                onClick={() => setMcpShowSecrets(!mcpShowSecrets)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
              >
                {mcpShowSecrets ? 'Hide' : 'Show'}
              </button>
            </div>
            <CredentialRow
              label="Server URL"
              value={MCP_ENDPOINT}
              show={true}
              onCopy={() => {
                setMcpCopiedField('url');
                setTimeout(() => setMcpCopiedField(null), 2000);
              }}
              copied={mcpCopiedField === 'url'}
            />
            <CredentialRow
              label="OAuth client ID"
              value={mcpNewCreds.clientId}
              show={mcpShowSecrets}
              onCopy={() => {
                setMcpCopiedField('clientId');
                setTimeout(() => setMcpCopiedField(null), 2000);
              }}
              copied={mcpCopiedField === 'clientId'}
            />
            <CredentialRow
              label="OAuth client secret"
              value={mcpNewCreds.clientSecret}
              show={mcpShowSecrets}
              onCopy={() => {
                setMcpCopiedField('secret');
                setTimeout(() => setMcpCopiedField(null), 2000);
              }}
              copied={mcpCopiedField === 'secret'}
            />
            <CredentialRow
              label="API key (alternative)"
              value={mcpNewCreds.key}
              show={mcpShowSecrets}
              onCopy={() => {
                setMcpCopiedField('key');
                setTimeout(() => setMcpCopiedField(null), 2000);
              }}
              copied={mcpCopiedField === 'key'}
            />
            <p className={CAPTION}>
              These credentials won&apos;t be shown again. Copy them now.
            </p>
            <button
              type="button"
              onClick={() => {
                setMcpNewCreds(null);
                setMcpShowForm(false);
                setMcpShowSecrets(false);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              Dismiss
            </button>
          </div>
        )}

        {mcpShowForm && !mcpNewCreds && (
          <div className="space-y-2">
            <Label htmlFor="mcp-key-name" className="text-[12.5px] font-medium text-foreground">
              Key name
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="mcp-key-name"
                value={mcpNewKeyName}
                onChange={(e) => setMcpNewKeyName(e.target.value)}
                placeholder='e.g. "Claude Desktop" or "Cursor"'
                className="flex-1"
              />
              <button
                type="button"
                disabled={mcpCreating || !mcpNewKeyName.trim()}
                onClick={handleCreateMcpKey}
                className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
              >
                {mcpCreating && <Loader2 size={13} className="animate-spin" />}
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setMcpShowForm(false);
                  setMcpNewKeyName('');
                }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 px-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mcpKeysLoading ? (
          <div className="h-16 rounded-md bg-foreground/[0.04] animate-pulse" />
        ) : mcpKeys.length === 0 ? (
          <p className={`${BODY_MUTED} italic`}>
            No keys yet. Generate one to connect a client.
          </p>
        ) : (
          <div>
            {mcpKeys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-3 py-3 border-b border-border/60 last:border-b-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Key size={14} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{k.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{k.keyPrefix}...</span>
                      <span>&#183;</span>
                      <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
                      {k.lastUsedAt && (
                        <>
                          <span>&#183;</span>
                          <span>Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteMcpKey(k.id)}
                  disabled={mcpDeletingId === k.id}
                  title="Delete key"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-foreground/[0.04] transition-colors duration-150 disabled:opacity-60"
                >
                  {mcpDeletingId === k.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message templates */}
      <div
        id="templates"
        className="space-y-4 pt-6 border-t border-border/60 scroll-mt-24"
      >
        <p className={SECTION_LABEL}>Message templates</p>
        <p className={BODY_MUTED}>
          Canned SMS, email, and note bodies you can fire per deal or contact. Use{' '}
          <code className="text-xs bg-foreground/[0.06] px-1 rounded">{'{{variable}}'}</code>{' '}
          placeholders to personalize.
        </p>
        {templates === null ? (
          <div className="h-40 bg-foreground/[0.04] rounded-md animate-pulse" />
        ) : (
          <TemplatesEditor initial={templates} />
        )}
      </div>
    </div>
  );
}
