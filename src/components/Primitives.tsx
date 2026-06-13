import { Badge, Box, Inline, Stack, Text, Dot, type BadgeTone } from 'ember-design-system';
import { catStyle, CATEGORY_TONE } from '../lib/category';
import { colorForms } from '../lib/color';
import type { Category, ClipItem, Theme } from '../lib/types';

interface CategoryChipProps {
  t: Theme;
  cat: Category;
  mode?: 'chip' | 'icon' | 'dot' | 'mono';
}

export function CategoryChip({ t, cat, mode = 'chip' }: CategoryChipProps) {
  const c = catStyle(t, cat);
  const tone = CATEGORY_TONE[cat] as BadgeTone;

  if (mode === 'dot') {
    return <Dot color={c.bgStrong} />;
  }

  if (mode === 'mono') {
    return (
      <Text
        family="mono"
        size={10.5}
        weight="medium"
        transform="uppercase"
        tracking="wider"
        style={{ color: c.ink }}
      >
        {c.mono}
      </Text>
    );
  }

  if (mode === 'icon') {
    return (
      <Badge
        tone={tone}
        variant="subtle"
        size="sm"
        className="!h-[22px] !w-[22px] !rounded-md !px-0 justify-center font-mono !text-[11px] font-bold"
        style={{ borderColor: c.border }}
      >
        {c.icon}
      </Badge>
    );
  }

  return (
    <Badge
      tone={tone}
      variant="subtle"
      size="sm"
      className="!rounded !px-1.5 font-mono !text-[10px] font-semibold uppercase tracking-wider"
      style={{ borderColor: c.border }}
    >
      {c.mono}
    </Badge>
  );
}

interface ItemBodyProps {
  t: Theme;
  item: ClipItem;
  compact?: boolean;
}

export function ItemBody({ t, item, compact = false }: ItemBodyProps) {
  const c = catStyle(t, item.category);

  if (item.category === 'color') {
    const forms = colorForms(item.content);
    const rows: [string, string][] = forms
      ? [
          ['HEX', forms.hex],
          ['RGB', forms.rgb],
          ['HSL', forms.hsl],
        ]
      : [];
    return (
      <Inline gap={3} align="start">
        <Box
          radius="md"
          border="subtle"
          style={{
            width: compact ? 20 : 36,
            height: compact ? 20 : 36,
            flexShrink: 0,
            background: item.content,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
          }}
        />
        {forms ? (
          <Stack gap={1} style={{ minWidth: 0 }}>
            {rows.map(([k, v]) => (
              <Inline key={k} gap={2} align="center">
                <Text
                  family="mono"
                  size={10.5}
                  tone="tertiary"
                  transform="uppercase"
                  tracking="widest"
                  style={{ width: 28, flexShrink: 0 }}
                >
                  {k}
                </Text>
                <Text as="code" family="mono" tone="primary" size={compact ? 12 : 13}>
                  {v}
                </Text>
              </Inline>
            ))}
          </Stack>
        ) : (
          <Text as="code" family="mono" tone="primary" size={compact ? 12 : 13}>
            {item.content}
          </Text>
        )}
      </Inline>
    );
  }

  if (item.category === 'code') {
    return (
      <Box
        as="pre"
        bg="subtle"
        border="subtle"
        radius="lg"
        overflow="auto"
        px={compact ? 3 : 4}
        py={compact ? 2 : 3}
        style={{ margin: 0 }}
      >
        <Text
          as="span"
          family="mono"
          tone="primary"
          size={compact ? 11.5 : 12.5}
          leading={1.55}
          whitespace="pre"
        >
          {item.content}
        </Text>
      </Box>
    );
  }

  if (
    item.category === 'url' ||
    item.category === 'email' ||
    item.category === 'phone' ||
    item.category === 'path' ||
    item.category === 'number'
  ) {
    return (
      <Text
        as="code"
        family="mono"
        size={compact ? 12 : 13.5}
        style={{ color: c.ink, wordBreak: 'break-all' }}
      >
        {item.content}
      </Text>
    );
  }

  return (
    <Text as="div" tone="primary" size={compact ? 13 : 14} leading={1.55} whitespace="pre-wrap">
      {item.content}
    </Text>
  );
}
