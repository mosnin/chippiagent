'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { MoreHorizontal, Plus, Check, X, Pencil, Palette, Trash2 } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Pipeline } from '@/lib/types';

const BOARD_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#64748b',
  '#78716c',
];

interface PipelineTabsProps {
  slug: string;
  pipelines: Pipeline[];
  activePipelineId: string;
  onSelect: (id: string) => void;
  onPipelinesChange: (pipelines: Pipeline[]) => void;
}

interface DeleteState {
  pipeline: Pipeline;
  dealCount: number;
  stageCount: number;
  targetPipelineId: string;
  submitting: boolean;
}

export function PipelineTabs({
  slug,
  pipelines,
  activePipelineId,
  onSelect,
  onPipelinesChange,
}: PipelineTabsProps) {
  // New board creation state
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(BOARD_COLORS[0]);
  const [createPending, setCreatePending] = useState(false);
  const newNameRef = useRef<HTMLInputElement>(null);

  // Rename state: pipelineId → pending name
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  // Recolor state: pipelineId being recolored
  const [recoloring, setRecoloring] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);

  useEffect(() => {
    if (creating && newNameRef.current) newNameRef.current.focus();
  }, [creating]);

  useEffect(() => {
    if (renaming && renameRef.current) renameRef.current.focus();
  }, [renaming]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreatePending(true);
    try {
      const res = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name, color: newColor }),
      });
      if (!res.ok) {
        toast.error("Couldn't create that board. Try again.");
        return;
      }
      const created: Pipeline = await res.json();
      onPipelinesChange([...pipelines, created]);
      onSelect(created.id);
      setCreating(false);
      setNewName('');
      setNewColor(BOARD_COLORS[0]);
      toast.success(`Board "${created.name}" added.`);
    } catch {
      toast.error("Couldn't create that board. Try again.");
    } finally {
      setCreatePending(false);
    }
  }

  async function handleRename(pipeline: Pipeline) {
    const name = renameValue.trim();
    if (!name || name === pipeline.name) {
      setRenaming(null);
      return;
    }
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast.error("Couldn't rename the board. Try again.");
        return;
      }
      const updated: Pipeline = await res.json();
      onPipelinesChange(pipelines.map((p) => (p.id === pipeline.id ? updated : p)));
      toast.success('Board renamed.');
    } catch {
      toast.error("Couldn't rename the board. Try again.");
    } finally {
      setRenaming(null);
    }
  }

  async function handleRecolor(pipeline: Pipeline, color: string) {
    setRecoloring(null);
    if (color === pipeline.color) return;
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color }),
      });
      if (!res.ok) {
        toast.error("Couldn't change the color. Try again.");
        return;
      }
      const updated: Pipeline = await res.json();
      onPipelinesChange(pipelines.map((p) => (p.id === pipeline.id ? updated : p)));
    } catch {
      toast.error("Couldn't change the color. Try again.");
    }
  }

  async function initiateDelete(pipeline: Pipeline) {
    // First attempt a delete; if it returns pipeline-has-deals, show dialog
    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}`, { method: 'DELETE' });
      if (res.ok) {
        const remaining = pipelines.filter((p) => p.id !== pipeline.id);
        onPipelinesChange(remaining);
        if (activePipelineId === pipeline.id && remaining.length > 0) {
          onSelect(remaining[0].id);
        }
        toast.success(`Board "${pipeline.name}" deleted.`);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 400 && body?.error === 'pipeline-has-deals') {
        const others = pipelines.filter((p) => p.id !== pipeline.id);
        setDeleteState({
          pipeline,
          dealCount: Number(body.dealCount ?? 0),
          stageCount: Number(body.stageCount ?? 0),
          targetPipelineId: others[0]?.id ?? '',
          submitting: false,
        });
      } else {
        toast.error("Couldn't delete the board. Try again.");
      }
    } catch {
      toast.error("Couldn't delete the board. Try again.");
    }
  }

  async function confirmDelete() {
    if (!deleteState || !deleteState.targetPipelineId) return;
    setDeleteState((prev) => prev && { ...prev, submitting: true });
    try {
      const params = new URLSearchParams({ targetPipelineId: deleteState.targetPipelineId });
      const res = await fetch(
        `/api/pipelines/${deleteState.pipeline.id}?${params.toString()}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        toast.error("Couldn't delete the board. Try again.");
        setDeleteState((prev) => prev && { ...prev, submitting: false });
        return;
      }
      const remaining = pipelines.filter((p) => p.id !== deleteState.pipeline.id);
      onPipelinesChange(remaining);
      if (activePipelineId === deleteState.pipeline.id && remaining.length > 0) {
        onSelect(remaining[0].id);
      }
      toast.success(`Board deleted. Deals moved to "${remaining.find((p) => p.id === deleteState.targetPipelineId)?.name ?? 'target board'}".`);
      setDeleteState(null);
    } catch {
      toast.error("Couldn't delete the board. Try again.");
      setDeleteState((prev) => prev && { ...prev, submitting: false });
    }
  }

  return (
    <>
      <div className="flex items-center gap-1 flex-wrap">
        {pipelines.map((pipeline) => {
          const isActive = pipeline.id === activePipelineId;
          const isRenaming = renaming === pipeline.id;

          return (
            <div key={pipeline.id} className="relative group/tab flex items-center">
              {isRenaming ? (
                <div className="flex items-center gap-1 rounded-lg border border-primary bg-background px-2 py-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: pipeline.color }}
                  />
                  <input
                    ref={renameRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(pipeline);
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    onBlur={() => handleRename(pipeline)}
                    className="w-28 text-sm bg-transparent outline-none"
                    maxLength={100}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleRename(pipeline); }}
                    className="text-primary hover:text-primary/80"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setRenaming(null); }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(pipeline.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2',
                    isActive
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: pipeline.color }}
                  />
                  {pipeline.name}

                  {/* "..." menu — appears on hover or when active */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
                        className={cn(
                          'ml-0.5 w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
                          isActive
                            ? 'opacity-60 group-hover/tab:opacity-100'
                            : 'opacity-0 group-hover/tab:opacity-60',
                        )}
                      >
                        <MoreHorizontal size={12} />
                      </span>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameValue(pipeline.name);
                          setRenaming(pipeline.id);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-left"
                      >
                        <Pencil size={13} />
                        Rename
                      </button>
                      <Popover open={recoloring === pipeline.id} onOpenChange={(open) => setRecoloring(open ? pipeline.id : null)}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-left"
                          >
                            <Palette size={13} />
                            Change color
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-44 p-2" onClick={(e) => e.stopPropagation()}>
                          <div className="grid grid-cols-6 gap-1.5">
                            {BOARD_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => handleRecolor(pipeline, c)}
                                className="w-6 h-6 rounded-md transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring"
                                style={{ backgroundColor: c }}
                                aria-label={c}
                              >
                                {c === pipeline.color && (
                                  <Check size={10} className="text-white mx-auto" />
                                )}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      {pipelines.length > 1 && (
                        <>
                          <div className="my-1 h-px bg-border" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              initiateDelete(pipeline);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-destructive/10 text-destructive transition-colors text-left"
                          >
                            <Trash2 size={13} />
                            Delete board
                          </button>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                </button>
              )}
            </div>
          );
        })}

        {/* New board button / inline creation */}
        {creating ? (
          <div className="flex items-center gap-1 rounded-lg border border-primary bg-background px-2 py-1">
            {/* Color dot picker */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-border hover:ring-primary transition-all"
                  style={{ backgroundColor: newColor }}
                  aria-label="Pick color"
                />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-44 p-2">
                <div className="grid grid-cols-6 gap-1.5">
                  {BOARD_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className="w-6 h-6 rounded-md transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring"
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    >
                      {c === newColor && <Check size={10} className="text-white mx-auto" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <input
              ref={newNameRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewName('');
                }
              }}
              placeholder="Board name…"
              className="w-28 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
              maxLength={100}
              disabled={createPending}
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || createPending}
              className="text-primary hover:text-primary/80 disabled:opacity-40"
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewName(''); }}
              disabled={createPending}
              className="text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            title="New board"
            aria-label="New board"
            className="ml-1 flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Delete confirmation dialog (when pipeline has deals) */}
      {deleteState && (
        <Dialog open onOpenChange={(open) => { if (!open && !deleteState.submitting) setDeleteState(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete &ldquo;{deleteState.pipeline.name}&rdquo;?</DialogTitle>
              <DialogDescription>
                This board has {deleteState.dealCount} deal{deleteState.dealCount === 1 ? '' : 's'} across{' '}
                {deleteState.stageCount} stage{deleteState.stageCount === 1 ? '' : 's'}. Choose a board to move them to before deleting.
              </DialogDescription>
            </DialogHeader>
            <Select
              value={deleteState.targetPipelineId}
              onValueChange={(v) => setDeleteState((prev) => prev && { ...prev, targetPipelineId: v })}
              disabled={deleteState.submitting}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Move deals to…" />
              </SelectTrigger>
              <SelectContent>
                {pipelines
                  .filter((p) => p.id !== deleteState.pipeline.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteState(null)}
                disabled={deleteState.submitting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={!deleteState.targetPipelineId || deleteState.submitting}
              >
                {deleteState.submitting ? 'Deleting…' : 'Delete board'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
