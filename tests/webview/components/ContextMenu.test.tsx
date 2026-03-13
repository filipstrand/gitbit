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

  it('keeps the main menu inside the viewport', () => {
    const onClose = vi.fn();
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if ((this as HTMLElement).classList?.contains('gitbit-context-menu')) {
        return {
          x: 0, y: 0, top: 0, left: 0, right: 220, bottom: 180, width: 220, height: 180, toJSON: () => ({})
        } as DOMRect;
      }
      return {
        x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({})
      } as DOMRect;
    });

    const prevWidth = window.innerWidth;
    const prevHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 600 });

    render(
      <ContextMenu
        x={790}
        y={590}
        onClose={onClose}
        actions={[{ label: 'Rename', onClick: vi.fn() }]}
      />
    );

    const menu = document.querySelector('.gitbit-context-menu') as HTMLDivElement | null;
    expect(menu).toBeTruthy();
    expect(menu!.style.left).toBe('572px');
    expect(menu!.style.top).toBe('412px');

    rectSpy.mockRestore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: prevWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: prevHeight });
  });

  it('repositions submenu to stay on-screen near the bottom-right edge', () => {
    const onClose = vi.fn();
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const el = this as HTMLElement;
      if (el.classList?.contains('gitbit-context-menu')) {
        return {
          x: 0, y: 0, top: 0, left: 0, right: 180, bottom: 180, width: 180, height: 180, toJSON: () => ({})
        } as DOMRect;
      }
      if (el.classList?.contains('gitbit-submenu')) {
        return {
          x: 0, y: 0, top: 0, left: 0, right: 180, bottom: 120, width: 180, height: 120, toJSON: () => ({})
        } as DOMRect;
      }
      if (el.classList?.contains('menu-item')) {
        return {
          x: 700, y: 560, top: 560, left: 700, right: 792, bottom: 584, width: 92, height: 24, toJSON: () => ({})
        } as DOMRect;
      }
      return {
        x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({})
      } as DOMRect;
    });

    const prevWidth = window.innerWidth;
    const prevHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 600 });

    render(
      <ContextMenu
        x={10}
        y={10}
        onClose={onClose}
        actions={[
          {
            label: 'Tag',
            submenu: [{ label: 'Delete Tag', onClick: vi.fn() }]
          }
        ]}
      />
    );

    fireEvent.mouseEnter(screen.getByText('Tag').closest('.menu-item')!);

    const submenu = document.querySelector('.gitbit-submenu') as HTMLDivElement | null;
    expect(submenu).toBeTruthy();
    expect(submenu!.style.left).toBe('518px');
    expect(submenu!.style.top).toBe('472px');

    rectSpy.mockRestore();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: prevWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: prevHeight });
  });
});
