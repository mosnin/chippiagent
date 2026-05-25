'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Copy, Check, Trash2, Plus, Key } from 'lucide-react';

type McpKey = {
  id: string;
  name: string;
  keyPrefix: string;
  clientId?: string;
  lastUsedAt: string | null;
  createdAt: string;
};

interface BrokerageMcpSectionProps {
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
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-9 rounded-lg border bg-white dark:bg-background px-3 flex items-center overflow-hidden">
          <span className="text-sm font-mono select-all truncate">
            {show ? value : '\u2022'.repeat(Math.min(value.length, 40))}
          </span>
        </div>
        <button
          type="button"
          className="h-9 px-3 rounded-lg border text-xs font-medium hover:bg-muted transition-colors flex items-center gap-1"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            onCopy();
          }}
        >
          {copied ? '\u2713 Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function BrokerageMcpSection({ slug }: BrokerageMcpSectionProps) {
  const [keys, setKeys] = useState<McpKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newCreds, setNewCreds] = useState<{
    key: string;
    clientId: string;
    clientSecret: string;
  } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

  const MCP_ENDPOINT = 'https://my.usechippi.com/api/mcp';

  useEffect(() => {
    fetch(`/api/mcp-keys?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setKeys(d.keys ?? []))
      .catch(() => setKeys([]))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/mcp-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewCreds({
          key: data.key,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
        });
        setKeys((prev) => [
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
        setNewKeyName('');
      } else {
        alert(data.error ?? 'Failed to create API key.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !confirm(
        'Are you sure you want to delete this API key? Any integrations using it will stop working.',
      )
    )
      return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/mcp-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, id }),
      });
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'Failed to delete key.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/20">
        <p className="font-semibold text-sm">Brokerage MCP</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Connect external AI tools to your brokerage data via the Model Context
          Protocol.
        </p>
      </div>
      <div className="px-6 py-5 space-y-4">
        {/* MCP Connection Info */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            MCP Connection Info
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>MCP Endpoint</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-9 rounded-lg border border-input bg-muted/40 px-3 flex items-center">
                  <span className="text-sm font-mono select-all">
                    {MCP_ENDPOINT}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={async () => {
                    await navigator.clipboard.writeText(MCP_ENDPOINT);
                    setCopiedEndpoint(true);
                    setTimeout(() => setCopiedEndpoint(false), 2000);
                  }}
                >
                  {copiedEndpoint ? (
                    <Check size={13} className="text-emerald-600" />
                  ) : (
                    <Copy size={13} />
                  )}
                  {copiedEndpoint ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Transport</Label>
              <p className="text-sm text-muted-foreground">Streamable HTTP</p>
            </div>
            <div className="space-y-1.5">
              <Label>How to connect</Label>
              <div className="text-sm text-muted-foreground space-y-3">
                <div>
                  <p className="font-medium text-foreground text-xs mb-1">
                    Claude Desktop / Cursor / Windsurf
                  </p>
                  <p className="text-xs mb-1.5">Add to your MCP config file:</p>
                  <div className="rounded-lg border border-input bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre">
                    {`{
  "mcpServers": {
    "chippi-brokerage": {
      "url": "${MCP_ENDPOINT}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
                  </div>
                </div>
                <p className="text-xs">
                  Generate an API key below and replace{' '}
                  <span className="font-mono">YOUR_API_KEY</span> with it. This
                  key gives access to all brokerage leads and data.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Brokerage API Keys
            </p>
            {!showForm && !newCreds && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setShowForm(true)}
              >
                <Plus size={12} />
                Generate new key
              </Button>
            )}
          </div>

          {/* New credentials reveal */}
          {newCreds && (
            <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-4 mb-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Your Brokerage MCP credentials
                </p>
                <button
                  type="button"
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {showSecrets ? 'Hide' : 'Show'}
                </button>
              </div>

              <CredentialRow
                label="MCP Server URL"
                value={MCP_ENDPOINT}
                show={true}
                onCopy={() => {
                  setCopiedField('url');
                  setTimeout(() => setCopiedField(null), 2000);
                }}
                copied={copiedField === 'url'}
              />
              <CredentialRow
                label="OAuth Client ID"
                value={newCreds.clientId}
                show={showSecrets}
                onCopy={() => {
                  setCopiedField('clientId');
                  setTimeout(() => setCopiedField(null), 2000);
                }}
                copied={copiedField === 'clientId'}
              />
              <CredentialRow
                label="OAuth Client Secret"
                value={newCreds.clientSecret}
                show={showSecrets}
                onCopy={() => {
                  setCopiedField('secret');
                  setTimeout(() => setCopiedField(null), 2000);
                }}
                copied={copiedField === 'secret'}
              />
              <CredentialRow
                label="API Key (alternative)"
                value={newCreds.key}
                show={showSecrets}
                onCopy={() => {
                  setCopiedField('key');
                  setTimeout(() => setCopiedField(null), 2000);
                }}
                copied={copiedField === 'key'}
              />

              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  These credentials won&apos;t be shown again. Copy them now.
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setNewCreds(null);
                  setShowForm(false);
                  setShowSecrets(false);
                }}
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Inline create form */}
          {showForm && !newCreds && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 mb-3 space-y-2">
              <Label htmlFor="brokerage-mcp-key-name">Key name</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="brokerage-mcp-key-name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder='e.g. "Claude Desktop — Brokerage"'
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9"
                  disabled={creating || !newKeyName.trim()}
                  onClick={handleCreate}
                >
                  {creating ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    'Create'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => {
                    setShowForm(false);
                    setNewKeyName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Keys list */}
          {loading ? (
            <div className="h-16 rounded-lg bg-muted animate-pulse" />
          ) : keys.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No brokerage API keys yet. Generate one to connect your MCP client
              to brokerage data.
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Key
                      size={14}
                      className="text-muted-foreground shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{k.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{k.keyPrefix}...</span>
                        <span>&#183;</span>
                        <span>
                          Created{' '}
                          {new Date(k.createdAt).toLocaleDateString()}
                        </span>
                        {k.lastUsedAt && (
                          <>
                            <span>&#183;</span>
                            <span>
                              Last used{' '}
                              {new Date(k.lastUsedAt).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDelete(k.id)}
                    disabled={deletingId === k.id}
                    title="Delete key"
                  >
                    {deletingId === k.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
