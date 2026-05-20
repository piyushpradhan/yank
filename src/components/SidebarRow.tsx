import type { ReactNode } from 'react';
import type { Theme } from '../lib/types';

interface SidebarRowProps {
  t: Theme;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function SidebarRow({ active, onClick, children }: SidebarRowProps) {
  return (
    <div
      onClick={onClick}
      className={`relative mb-0.5 flex h-7 cursor-pointer items-center gap-2.5 rounded-md px-2.5 transition-colors duration-150 ${
        active ? 'bg-accent-soft font-medium text-fg' : 'bg-transparent text-fg-muted'
      }`}
    >
      {children}
    </div>
  );
}
