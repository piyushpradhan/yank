import { useImageUrl } from '../hooks/useImageUrl';
import type { ClipItem } from '../lib/types';

interface ImagePreviewProps {
  item: ClipItem;
  getImage: (id: string) => Promise<Blob | null>;
  maxHeight?: string;
}

export function ImagePreview({ item, getImage, maxHeight = '400px' }: ImagePreviewProps) {
  const url = useImageUrl(item.id, getImage);

  if (!url) {
    return <div className="text-[13px] text-fg-faint">Loading image…</div>;
  }

  return (
    <img
      src={url}
      alt={item.preview}
      className="max-w-full rounded-lg bg-subtle"
      style={{ maxHeight }}
    />
  );
}
