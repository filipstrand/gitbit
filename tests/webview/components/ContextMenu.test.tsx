import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContextMenu } from '../../../src/webview/components/ContextMenu';

describe('ContextMenu', () => {
  it('executes action and closes on item click', () => {
    const onClose = vi.fn();
    const onClick = vi.fn();
    render(
      <ContextMenu
        x={10}
        y={10}
        onClose={onClose}
        actions={[{ label: 'Rename', onClick }]}
      />
    );

    fireEvent.click(screen.getByText('Rename'));
    expect(onClick).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does not execute disabled action', () => {
    const onClose = vi.fn();
    const onClick = vi.fn();
    render(
      <ContextMenu
        x={10}
        y={10}
        onClose={onClose}
        actions={[{ label: 'Delete', onClick, disabled: true }]}
      />
    );

    fireEvent.click(screen.getByText('Delete'));
    expect(onClick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens submenu on hover and executes submenu item', () => {
    const onClose = vi.fn();
    const onTagDelete = vi.fn();
    render(
      <ContextMenu
        x={10}
        y={10}
        onClose={onClose}
        actions={[
          {
            label: 'Tag',
            submenu: [{ label: 'Delete Tag', onClick: onTagDelete }]
          }
        ]}
      />
    );

    fireEvent.mouseEnter(screen.getByText('Tag').closest('.menu-item')!);
    fireEvent.click(screen.getByText('Delete Tag'));

    expect(onTagDelete).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
