'use client';

import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import type { TextBlock } from '@/lib/ai-tools/blocks';

/** Render inline spans: `**bold**`, `*italic*`, and `` `code` ``. */
function renderInline(text: string, keyOffset = 0): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Order matters: backtick first (greedy-safe), then bold, then italic.
  const regex = /(`([^`]+)`|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let key = keyOffset;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    if (match[0].startsWith('`')) {
      // inline code
      parts.push(
        <code
          key={key++}
          className="font-mono text-[12px] bg-muted px-1 py-0.5 rounded text-foreground/90"
        >
          {match[2]}
        </code>,
      );
    } else if (match[0].startsWith('**')) {
      parts.push(
        <strong key={key++} className="font-semibold">
          {match[3]}
        </strong>,
      );
    } else {
      parts.push(<em key={key++}>{match[4]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/** Parse the full content string into React block-level nodes. */
function renderMarkdown(content: string, streaming?: boolean): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = content.split('\n');
  let i = 0;
  let keyCounter = 0;
  const key = () => keyCounter++;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ────────────────────────────────────────────────
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++; // skip opening fence
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      nodes.push(
        <pre
          key={key()}
          className="bg-muted rounded-lg p-3 overflow-x-auto font-mono text-[12px] text-foreground/90 my-2 whitespace-pre"
        >
          {codeLines.join('\n')}
        </pre>,
      );
      continue;
    }

    // ── Heading h1 ───────────────────────────────────────────────────────
    if (/^# /.test(line)) {
      nodes.push(
        <h1 key={key()} className="text-sm font-semibold text-foreground mt-3 mb-1">
          {renderInline(line.slice(2))}
        </h1>,
      );
      i++;
      continue;
    }

    // ── Heading h2 ───────────────────────────────────────────────────────
    if (/^## /.test(line)) {
      nodes.push(
        <h2 key={key()} className="text-sm font-semibold text-foreground mt-3 mb-1">
          {renderInline(line.slice(3))}
        </h2>,
      );
      i++;
      continue;
    }

    // ── Heading h3–h6 (h1 and h2 already handled above) ────────────────
    if (/^#{3,6} /.test(line)) {
      const match = line.match(/^#{3,6} (.*)/);
      if (match) {
        nodes.push(
          <h3 key={key()} className="text-sm font-semibold text-foreground mt-3 mb-1">
            {renderInline(match[1])}
          </h3>,
        );
        i++;
        continue;
      }
    }

    // ── Unordered list ───────────────────────────────────────────────────
    if (/^[-*] /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(
          <li key={key()} className="text-sm text-foreground">
            {renderInline(lines[i].slice(2))}
          </li>,
        );
        i++;
      }
      nodes.push(
        <ul key={key()} className="list-disc pl-4 space-y-0.5 my-1">
          {items}
        </ul>,
      );
      continue;
    }

    // ── Ordered list ─────────────────────────────────────────────────────
    if (/^\d+\. /.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        const text = lines[i].replace(/^\d+\. /, '');
        items.push(
          <li key={key()} className="text-sm text-foreground">
            {renderInline(text)}
          </li>,
        );
        i++;
      }
      nodes.push(
        <ol key={key()} className="list-decimal pl-4 space-y-0.5 my-1">
          {items}
        </ol>,
      );
      continue;
    }

    // ── Blank line → paragraph break ─────────────────────────────────────
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ── Paragraph: collect consecutive non-blank, non-block lines ────────
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6} /.test(lines[i]) &&
      !/^[-*] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      !lines[i].trimStart().startsWith('```')
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      // Determine if this is the last node (for cursor placement).
      const isLast = i >= lines.length;
      nodes.push(
        <p key={key()} className="text-sm text-foreground leading-relaxed mb-2">
          {paraLines.map((pl, pi) => (
            <Fragment key={pi}>
              {renderInline(pl)}
              {pi < paraLines.length - 1 && <br />}
            </Fragment>
          ))}
          {isLast && streaming && (
            <span className="chippi-cursor" aria-hidden="true" />
          )}
        </p>,
      );
    }
    continue;
  }

  return nodes;
}

interface TextBlockViewProps {
  block: TextBlock;
  /** Whether the text is still streaming — shows a blinking caret. */
  streaming?: boolean;
  /** Whether this is the user's turn or the assistant's. */
  role?: 'user' | 'assistant';
  className?: string;
}

export function TextBlockView({
  block,
  streaming,
  role = 'assistant',
  className,
}: TextBlockViewProps) {
  if (role === 'user') {
    return (
      <div className={cn('flex justify-end', className)}>
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-sm text-foreground">
          <p className="whitespace-pre-wrap leading-relaxed">
            {block.content.split('\n').map((line, i, arr) => (
              <Fragment key={i}>
                {renderInline(line)}
                {i < arr.length - 1 && '\n'}
              </Fragment>
            ))}
          </p>
        </div>
      </div>
    );
  }

  const nodes = renderMarkdown(block.content, streaming);

  // If streaming and content ends with a block element (list, heading, pre),
  // the cursor won't have been appended inside a paragraph — append it as a
  // trailing inline span so it's always visible.
  const lastNode = nodes[nodes.length - 1];
  const lastIsPara =
    lastNode != null &&
    typeof lastNode === 'object' &&
    'type' in (lastNode as React.ReactElement) &&
    (lastNode as React.ReactElement).type === 'p';
  const needsTrailingCursor = streaming && !lastIsPara;

  return (
    <div
      // aria-live "polite" announces streaming deltas without interrupting;
      // aria-atomic=false means screen readers read appended text only.
      // Only the *streaming* block needs live semantics — static history
      // should stay silent so reload doesn't re-read the whole transcript.
      aria-live={streaming ? 'polite' : undefined}
      aria-atomic={streaming ? false : undefined}
      className={cn('text-sm text-foreground leading-relaxed', className)}
    >
      {nodes}
      {needsTrailingCursor && (
        <span className="chippi-cursor" aria-hidden="true" />
      )}
    </div>
  );
}
