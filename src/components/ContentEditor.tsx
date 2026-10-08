import type { ClipItem } from '../lib/types';

interface ContentEditorProps {
  item: ClipItem;
  value: string;
  onChange: (value: string) => void;
  /** Enter. */
  onSave: () => void;
  /** Cmd/Ctrl+Enter: paste or copy the edited text once, without saving. */
  onUseOnce: () => void;
  /** Escape. */
  onDiscard: () => void;
  minHeight?: number;
}

/**
 * Edits an item's text. Keys match the edit bar: Enter saves, Shift+Enter
 * adds a newline, Cmd/Ctrl+Enter uses it once, Escape discards.
 */
export function ContentEditor({
  item,
  value,
  onChange,
  onSave,
  onUseOnce,
  onDiscard,
  minHeight = 280,
}: ContentEditorProps) {
  const isCode = item.category === 'code';
  return (
    <textarea
      autoFocus
      aria-label="Clipboard text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onDiscard();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onUseOnce();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSave();
        }
      }}
      spellCheck={!isCode}
      style={{
        width: '100%',
        minHeight,
        resize: 'none',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: 12,
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
        fontFamily: isCode ? 'var(--font-mono)' : 'inherit',
        fontSize: 13,
        lineHeight: 1.55,
        outline: 'none',
      }}
    />
  );
}
