import { Image, Text } from 'ember-design-system';
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
    return (
      <Text size={13} tone="tertiary">
        Loading image…
      </Text>
    );
  }

  return <Image src={url} alt={item.preview} radius="lg" bg fit="contain" maxHeight={maxHeight} />;
}
