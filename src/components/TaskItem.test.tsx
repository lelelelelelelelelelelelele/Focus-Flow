// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { changeLanguage: () => {} } }),
}));
// TaskItem 内部 useAppStore(state => state.tasks)；桩成固定空数组。
vi.mock('@/store', () => ({ useAppStore: (sel: (s: { tasks: unknown[] }) => unknown) => sel({ tasks: [] }) }));

import { TaskItem } from './TaskItem';
import type { Task } from '@/types';

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;

afterEach(cleanup);

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 't1', zoneId: 'z1', parentId: null, isCollapsed: false, title: '写季度复盘',
    description: '', completed: false, priority: 'medium', urgency: 'low', deadline: null,
    deadlineType: 'none', order: 0, createdAt: 1, expanded: true, totalWorkTime: 0, ...over,
  };
}

function renderItem(task: Task, onToggle = vi.fn()) {
  const noop = vi.fn();
  const utils = render(
    <DndContext>
      <TaskItem
        task={task} zoneColor="#22c55e" isActive={false} isTimerRunning={false}
        onToggle={onToggle} onDelete={noop} onUpdate={noop} onToggleExpanded={noop}
        isDraggable={false}
      />
    </DndContext>
  );
  return { ...utils, onToggle };
}

describe('TaskItem（T04/T05 渲染层）', () => {
  it('渲染任务标题', () => {
    renderItem(makeTask());
    expect(screen.getByText('写季度复盘')).toBeInTheDocument();
  });

  it('点击复选框触发 onToggle(task.id)', async () => {
    const user = userEvent.setup();
    const { container, onToggle } = renderItem(makeTask());
    await user.click(container.querySelector('.task-checkbox')!);
    expect(onToggle).toHaveBeenCalledWith('t1');
  });

  it('completed=true 时复选框带 checked 样式（完成态渲染）', () => {
    const { container } = renderItem(makeTask({ completed: true }));
    expect(container.querySelector('.task-checkbox')).toHaveClass('checked');
  });
});
