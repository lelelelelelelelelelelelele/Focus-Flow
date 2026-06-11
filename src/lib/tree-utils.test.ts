import { describe, it, expect } from 'vitest';
import type { Task } from '@/types';
import { getFlattenedTasks, calculateNewPosition, type FlattenedTask } from './tree-utils';

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    zoneId: 'z1',
    parentId: null,
    isCollapsed: false,
    title: id,
    description: '',
    completed: false,
    priority: 'medium',
    urgency: 'low',
    deadline: null,
    deadlineType: 'none',
    order: 0,
    createdAt: 0,
    expanded: false,
    totalWorkTime: 0,
    ...over,
  };
}

// 经典两级树：root1{ child1a, child1b }, root2
function buildTree(): Task[] {
  return [
    task('root1', { order: 0 }),
    task('child1a', { parentId: 'root1', order: 0 }),
    task('child1b', { parentId: 'root1', order: 1 }),
    task('root2', { order: 1 }),
  ];
}

// ============ getFlattenedTasks ============
describe('getFlattenedTasks（树打平）', () => {
  it('按 order 深度优先展开，记录正确 depth', () => {
    const flat = getFlattenedTasks(buildTree(), 'z1', null);
    expect(flat.map(t => t.id)).toEqual(['root1', 'child1a', 'child1b', 'root2']);
    expect(flat.map(t => t.depth)).toEqual([0, 1, 1, 0]);
  });

  it('折叠的父节点不展开其子节点', () => {
    const tasks = buildTree();
    tasks[0] = { ...tasks[0], isCollapsed: true }; // root1 折叠
    const flat = getFlattenedTasks(tasks, 'z1', null);
    expect(flat.map(t => t.id)).toEqual(['root1', 'root2']);
  });

  it('按 zoneId 过滤其它分区任务', () => {
    const tasks = [...buildTree(), task('other', { zoneId: 'z2', order: 5 })];
    const flat = getFlattenedTasks(tasks, 'z1', null);
    expect(flat.find(t => t.id === 'other')).toBeUndefined();
  });

  it('zoneId 为 null 时不过滤分区', () => {
    const tasks = [task('a', { zoneId: 'z1' }), task('b', { zoneId: 'z2' })];
    const flat = getFlattenedTasks(tasks, null, null);
    expect(flat.map(t => t.id).sort()).toEqual(['a', 'b']);
  });

  it('聚焦模式以焦点任务的子节点为根，depth 从 0 起算', () => {
    const flat = getFlattenedTasks(buildTree(), 'z1', 'root1');
    expect(flat.map(t => t.id)).toEqual(['child1a', 'child1b']);
    expect(flat.map(t => t.depth)).toEqual([0, 0]);
  });

  it('子节点按 order 升序排列', () => {
    const tasks = [
      task('root', { order: 0 }),
      task('c2', { parentId: 'root', order: 2 }),
      task('c0', { parentId: 'root', order: 0 }),
      task('c1', { parentId: 'root', order: 1 }),
    ];
    const flat = getFlattenedTasks(tasks, 'z1', null);
    expect(flat.map(t => t.id)).toEqual(['root', 'c0', 'c1', 'c2']);
  });
});

// ============ calculateNewPosition ============
describe('calculateNewPosition（拖拽落点定位）', () => {
  // 一个三项的同级平铺列表
  const flat: FlattenedTask[] = [
    { ...task('A', { order: 0 }), depth: 0 },
    { ...task('B', { order: 1 }), depth: 0 },
    { ...task('C', { order: 2 }), depth: 0 },
  ];

  it('找不到 active/over 返回 null', () => {
    expect(calculateNewPosition(flat, 'X', 'B', 0, null)).toBeNull();
    expect(calculateNewPosition(flat, 'A', 'X', 0, null)).toBeNull();
  });

  it('无缩进拖到 B 之后，保持同级、锚点为 B', () => {
    const r = calculateNewPosition(flat, 'A', 'B', 0, null);
    expect(r).toEqual({ newDepth: 0, newParentId: null, anchorId: 'B' });
  });

  it('右移一格缩进 → 成为 B 的子节点', () => {
    const r = calculateNewPosition(flat, 'A', 'B', 24, null);
    expect(r).toEqual({ newDepth: 1, newParentId: 'B', anchorId: null });
  });

  it('向上拖到首位 → 顶层、无锚点（插到最前）', () => {
    const r = calculateNewPosition(flat, 'C', 'A', 0, null);
    expect(r).toEqual({ newDepth: 0, newParentId: null, anchorId: null });
  });

  it('深度受前一节点 +1 限制（不会凭空多缩进）', () => {
    const r = calculateNewPosition(flat, 'A', 'B', 240, null); // 夸张右移
    expect(r!.newDepth).toBe(1); // 最多 prevItem.depth + 1
  });
});
