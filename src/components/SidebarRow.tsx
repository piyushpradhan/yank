import type { ReactNode } from 'react';
import { Inline } from 'ember-design-system';
import type { Theme } from '../lib/types';

interface SidebarRowProps {
  t: Theme;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function SidebarRow({ active, onClick, children }: SidebarRowProps) {
  return (
    <Inline
      onClick={onClick}
      gap={3}
      px={3}
      radius="md"
      bg={active ? 'accent-soft' : 'transparent'}
      position="relative"
      interactive
      style={{
        height: 28,
        marginBottom: 2,
        fontWeight: active ? 'var(--font-medium)' : undefined,
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {children}
    </Inline>
  );
}
