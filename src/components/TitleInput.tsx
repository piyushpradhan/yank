import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface TitleInputHandle {
  /** Save (true) or discard (false). Safe to call more than once; only the first counts. */
  finish: (save: boolean) => void;
}

interface TitleInputProps {
  initial: string;
  /** Font size of the title this input replaces, so editing causes no layout shift. */
  size: number;
  /** Called exactly once: the new title, or null if discarded / blank / unchanged. */
  onDone: (label: string | null) => void;
}

/**
 * In-place title editor (Finder-style): same type as the title it replaces,
 * pre-filled and pre-selected. Enter or clicking away saves, Escape discards.
 * Parents render explicit Save / Cancel controls through the ref.
 */
export const TitleInput = forwardRef<TitleInputHandle, TitleInputProps>(function TitleInput(
  { initial, size, onDone },
  ref
) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus + select on mount so typing replaces the title. Done here rather
  // than via autoFocus/onFocus, which loses the selection in the palette.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const label = value.trim();
    onDone(save && label && label !== initial ? label : null);
  };

  useImperativeHandle(ref, () => ({ finish }));

  return (
    <input
      ref={inputRef}
      aria-label="Item title"
      placeholder="Name this item"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      spellCheck={false}
      style={{
        flex: 1,
        minWidth: 0,
        font: 'inherit',
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.3,
        letterSpacing: '-0.01em',
        color: 'var(--text-primary)',
        background: 'var(--bg-subtle)',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        // Negative margin cancels the padding so the text stays where the title was.
        padding: '1px 6px',
        margin: '-1px -6px',
        outline: '2px solid color-mix(in oklab, var(--accent-ember-500) 45%, transparent)',
        outlineOffset: 0,
      }}
    />
  );
});
