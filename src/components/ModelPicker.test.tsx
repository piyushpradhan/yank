import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ModelPicker } from './ModelPicker';

it('shows each download state with the action that fits it', () => {
  const download = vi.fn();
  const pause = vi.fn();
  const remove = vi.fn();
  const onSelect = vi.fn();
  render(
    <ModelPicker
      value="bge-small-en-v1.5"
      inUse="bge-small-en-v1.5"
      onSelect={onSelect}
      models={{
        'bge-small-en-v1.5': { state: 'ready', total: 134e6 },
        'embeddinggemma-300m': { state: 'downloading', done: 50e6, total: 219e6 },
        'embeddinggemma-2': { state: 'paused', done: 100e6, total: 346e6 },
        'all-minilm-l6-v2': { state: 'missing', total: 91e6 },
      }}
      rates={{ 'embeddinggemma-300m': 4.2e6 }}
      error={null}
      download={download}
      pause={pause}
      remove={remove}
    />,
  );

  expect(screen.getByText('In use')).toBeTruthy();
  expect(screen.getByText('50 MB of 219 MB · 4.2 MB/s')).toBeTruthy();
  expect(screen.getByText('Paused · 100 MB of 346 MB')).toBeTruthy();

  // Only downloaded models can be picked.
  expect(screen.getByRole('radio', { name: /MiniLM/ })).toHaveProperty('disabled', true);
  expect(screen.getByRole('radio', { name: /BGE Small/ })).toHaveProperty('checked', true);

  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete EmbeddingGemma 2' }));
  expect(pause).toHaveBeenCalledWith('embeddinggemma-300m');
  expect(download.mock.calls).toEqual([['embeddinggemma-2'], ['all-minilm-l6-v2']]);
  expect(remove).toHaveBeenCalledWith('embeddinggemma-2');
  // Action buttons sit inside the row's label but must not select it.
  expect(onSelect).not.toHaveBeenCalled();
});
