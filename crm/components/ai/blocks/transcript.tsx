'use client';

import { cn } from '@/lib/utils';
import type { MessageBlock, ToolCallBlock } from '@/lib/ai-tools/blocks';
import { TextBlockView } from './text-block-view';
import { ToolCallBlockView } from './tool-call-block-view';
import { ToolGroupBlockView } from './tool-group-block-view';
import { SubagentBlockView, isSubagentTool } from './subagent-block-view';
import { ReasoningBlockView } from './reasoning-block-view';
import { PermissionBlockView } from './permission-block-view';
import { PermissionPromptView, type PermissionPromptData } from './permission-prompt-view';
import { ApprovalCelebration, type ApprovalKind } from '@/components/chippi/approval-celebration';

interface TranscriptProps {
  blocks: MessageBlock[];
  /** Whose turn these blocks belong to. User turns only carry text blocks. */
  role: 'user' | 'assistant';
  /**
   * When this turn is still streaming, the trailing text block gets a
   * pulsing caret. Pass `true` for the assistant turn that is currently
   * emitting deltas; omit or false for saved history.
   */
  streaming?: boolean;
  /**
   * Tool callIds that are currently in-flight (the model called them in
   * this turn but the handler hasn't resolved yet). Lets the block view
   * render the "Running" state even though `status` is still a placeholder.
   */
  liveCallIds?: Set<string>;
  /**
   * Optional interactive permission prompt. Shown below the blocks when the
   * turn paused for approval. The parent owns the approve/deny callbacks so
   * the Transcript stays a pure presentational component.
   */
  pendingApproval?: {
    prompt: PermissionPromptData;
    onApprove: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
    onDeny: (requestId: string) => Promise<void>;
    onAlwaysAllow?: (requestId: string, editedArgs?: Record<string, unknown>) => Promise<void>;
    busy?: boolean;
  };
  /**
   * When present, the surface the approval prompt occupied is replaced by
   * one calm Chippi-voiced sentence for ~2.5s. The parent owns the dwell —
   * the celebration calls `onDone` when its time is up so the parent can
   * clear this state and let the next streamed blocks (or whatever's next)
   * take the floor.
   */
  approvalCelebration?: {
    kind: ApprovalKind;
    subject?: string;
    onDone: () => void;
  };
  /** Bubbled by interactive tool-result cards (currently the availability
   *  picker). The workspace forwards the text as the realtor's next
   *  message. Omit on read-only history surfaces. */
  onUserIntent?: (text: string) => void;
  className?: string;
}

/**
 * Renders an ordered list of blocks. Each block type maps to a dedicated
 * view; this component is strictly a dispatcher. Stable keys come from
 * callId for tool-related blocks (so re-renders don't flicker during
 * streaming) and from index for text blocks (text is append-only per turn).
 */
export function Transcript({
  blocks,
  role,
  streaming,
  liveCallIds,
  pendingApproval,
  approvalCelebration,
  onUserIntent,
  className,
}: TranscriptProps) {
  // Find the last text block so we can scope the streaming caret to it.
  let lastTextIndex = -1;
  if (streaming && role === 'assistant') {
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].type === 'text') {
        lastTextIndex = i;
        break;
      }
    }
  }

  // Group consecutive non-subagent tool_call blocks so 2+ collapse into one
  // ToolGroup header (Claude / ChatGPT pattern). Single-tool runs keep the
  // existing per-block view — its inline rich-data cards (contacts / deals /
  // tours / properties) read better solo than buried under a collapsed group.
  //
  // Subagents (analyze_pipeline, research_person, planner) break the run and
  // get their own one-line "Completed Subagent · <task>" row. They're
  // conceptually distinct from regular tools so they're never grouped.
  type RenderItem =
    | { kind: 'text'; block: Extract<MessageBlock, { type: 'text' }>; originalIndex: number }
    | { kind: 'permission'; block: Extract<MessageBlock, { type: 'permission' }> }
    | { kind: 'reasoning'; block: Extract<MessageBlock, { type: 'reasoning' }> }
    | { kind: 'tool-single'; block: ToolCallBlock }
    | { kind: 'tool-group'; blocks: ToolCallBlock[]; groupId: string }
    | { kind: 'subagent'; block: ToolCallBlock };

  const items: RenderItem[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'reasoning') {
      items.push({ kind: 'reasoning', block });
      continue;
    }
    if (block.type === 'tool_call') {
      if (isSubagentTool(block.name)) {
        items.push({ kind: 'subagent', block });
        continue;
      }
      const run: ToolCallBlock[] = [block];
      while (
        i + 1 < blocks.length &&
        blocks[i + 1].type === 'tool_call' &&
        !isSubagentTool((blocks[i + 1] as ToolCallBlock).name)
      ) {
        run.push(blocks[i + 1] as ToolCallBlock);
        i++;
      }
      if (run.length === 1) {
        items.push({ kind: 'tool-single', block: run[0] });
      } else {
        items.push({
          kind: 'tool-group',
          blocks: run,
          groupId: `group-${run[0].callId}`,
        });
      }
    } else if (block.type === 'text') {
      items.push({ kind: 'text', block, originalIndex: i });
    } else if (block.type === 'permission') {
      items.push({ kind: 'permission', block });
    }
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      {items.map((item) => {
        switch (item.kind) {
          case 'text':
            return (
              <TextBlockView
                key={`text-${item.originalIndex}`}
                block={item.block}
                role={role}
                streaming={item.originalIndex === lastTextIndex}
              />
            );
          case 'tool-single':
            return (
              <ToolCallBlockView
                key={`tool-${item.block.callId}`}
                block={item.block}
                live={liveCallIds?.has(item.block.callId)}
                onUserIntent={onUserIntent}
              />
            );
          case 'tool-group':
            return (
              <ToolGroupBlockView
                key={item.groupId}
                blocks={item.blocks}
                liveCallIds={liveCallIds}
                onUserIntent={onUserIntent}
              />
            );
          case 'subagent':
            return (
              <SubagentBlockView
                key={`subagent-${item.block.callId}`}
                block={item.block}
                live={liveCallIds?.has(item.block.callId)}
              />
            );
          case 'reasoning':
            return (
              <ReasoningBlockView
                key={`reasoning-${item.block.content.length}`}
                block={item.block}
                streaming={streaming && role === 'assistant'}
              />
            );
          case 'permission':
            return <PermissionBlockView key={`perm-${item.block.callId}`} block={item.block} />;
        }
      })}

      {/* Celebration takes precedence over the approval prompt — the moment
          the realtor approves a celebrate-able tool, the parent flips
          `approvalCelebration` and the prompt is swapped for the win line on
          the same surface. */}
      {approvalCelebration ? (
        <ApprovalCelebration
          kind={approvalCelebration.kind}
          subject={approvalCelebration.subject}
          onDone={approvalCelebration.onDone}
        />
      ) : (
        pendingApproval && (
          <PermissionPromptView
            prompt={pendingApproval.prompt}
            onApprove={pendingApproval.onApprove}
            onDeny={pendingApproval.onDeny}
            onAlwaysAllow={pendingApproval.onAlwaysAllow}
            busy={pendingApproval.busy}
          />
        )
      )}
    </div>
  );
}
