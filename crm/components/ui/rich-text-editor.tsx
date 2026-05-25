'use client';

import { useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  Underline,
  Heading2,
  Heading3,
  List,
  ListOrdered,
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function ToolbarButton({
  onClick,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // Prevent losing selection
        onClick();
      }}
      title={title}
      disabled={disabled}
      className={cn(
        'p-1.5 rounded hover:bg-accent hover:text-accent-foreground transition-colors',
        'text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start typing...',
  className,
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);

  // Sync external value changes into the editor
  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const execCommand = useCallback(
    (command: string, val?: string) => {
      if (disabled) return;
      document.execCommand(command, false, val);
      editorRef.current?.focus();
    },
    [disabled]
  );

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      // Basic keyboard shortcuts
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 'b':
            e.preventDefault();
            execCommand('bold');
            break;
          case 'i':
            e.preventDefault();
            execCommand('italic');
            break;
          case 'u':
            e.preventDefault();
            execCommand('underline');
            break;
        }
      }
    },
    [disabled, execCommand]
  );

  const iconSize = 16;

  return (
    <div
      className={cn(
        'rounded-lg border border-input bg-background overflow-hidden',
        disabled && 'opacity-60 cursor-not-allowed',
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30 flex-wrap">
        <ToolbarButton
          onClick={() => execCommand('bold')}
          title="Bold (Ctrl+B)"
          disabled={disabled}
        >
          <Bold size={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => execCommand('italic')}
          title="Italic (Ctrl+I)"
          disabled={disabled}
        >
          <Italic size={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => execCommand('underline')}
          title="Underline (Ctrl+U)"
          disabled={disabled}
        >
          <Underline size={iconSize} />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton
          onClick={() => execCommand('formatBlock', 'h2')}
          title="Heading 2"
          disabled={disabled}
        >
          <Heading2 size={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => execCommand('formatBlock', 'h3')}
          title="Heading 3"
          disabled={disabled}
        >
          <Heading3 size={iconSize} />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton
          onClick={() => execCommand('insertUnorderedList')}
          title="Bullet list"
          disabled={disabled}
        >
          <List size={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => execCommand('insertOrderedList')}
          title="Numbered list"
          disabled={disabled}
        >
          <ListOrdered size={iconSize} />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        className={cn(
          'min-h-[300px] max-h-[600px] overflow-y-auto px-4 py-3 text-sm focus:outline-none',
          'prose prose-sm dark:prose-invert max-w-none',
          '[&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground [&:empty]:before:pointer-events-none'
        )}
      />
    </div>
  );
}
