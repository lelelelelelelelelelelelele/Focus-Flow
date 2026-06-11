import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';

// zoneSlice.deleteZone 依赖 taskSlice 的 tasks；taskSlice 又在 checkRecurringTasks 用到 i18n。
vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string) => key, changeLanguage: () => {} },
}));

import { createZoneSlice, type ZoneSlice } from './zoneSlice';
import { createTaskSlice, type TaskSlice } from './taskSlice';
import { createUISlice, type UISlice } from './uiSlice';

type Combined = ZoneSlice & TaskSlice & UISlice;
type Store = StoreApi<Combined>;

// 组合 zone + task + ui 三个切片：deleteZone 要读 tasks，T03 切换要用 ui。
const initCombined: StateCreator<Combined> = (set, get, api) => ({
  ...createTaskSlice(set as never, get as never, api as never),
  ...createZoneSlice(set as never, get as never, api as never),
  ...createUISlice(set as never, get as never, api as never),
});

function makeStore(): Store {
  return createStore<Combined>()(initCombined);
}

let store: Store;
beforeEach(() => {
  store = makeStore();
});

const zoneByName = (name: string) => store.getState().zones.find(z => z.name === name)!;

// ============ T03：分区创建 ============
describe('addZone（新建分区）', () => {
  it('新建分区带正确字段与默认 order=0', () => {
    store.getState().addZone('测试分区A', '#22c55e');
    const zones = store.getState().zones;
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ name: '测试分区A', color: '#22c55e', order: 0 });
    expect(zones[0].id).toBeTruthy();
    expect(zones[0].createdAt).toBeTypeOf('number');
  });

  it('多个分区 order 递增', () => {
    store.getState().addZone('A', '#111');
    store.getState().addZone('B', '#222');
    store.getState().addZone('C', '#333');
    expect(store.getState().zones.map(z => z.order)).toEqual([0, 1, 2]);
  });
});

// ============ updateZone / getZoneById / reorderZones ============
describe('updateZone / getZoneById / reorderZones', () => {
  it('updateZone 改名与改色', () => {
    store.getState().addZone('旧名', '#111');
    const id = store.getState().zones[0].id;
    store.getState().updateZone(id, { name: '新名', color: '#abc' });
    expect(store.getState().getZoneById(id)).toMatchObject({ name: '新名', color: '#abc' });
  });

  it('reorderZones 按传入顺序重排', () => {
    store.getState().addZone('A', '#1');
    store.getState().addZone('B', '#2');
    const [a, b] = store.getState().zones;
    store.getState().reorderZones([b, a]);
    expect(store.getState().zones.map(z => z.name)).toEqual(['B', 'A']);
  });
});

// ============ deleteZone：级联删除该分区任务 ============
describe('deleteZone（删除分区会连带删除其任务）', () => {
  it('删除分区时，该分区下的任务一并删除，其它分区任务保留', () => {
    store.getState().addZone('Z1', '#1');
    store.getState().addZone('Z2', '#2');
    const z1 = zoneByName('Z1').id;
    const z2 = zoneByName('Z2').id;
    store.getState().addTask(z1, 'z1-任务', '');
    store.getState().addTask(z2, 'z2-任务', '');

    store.getState().deleteZone(z1);

    expect(store.getState().zones.map(z => z.id)).toEqual([z2]);
    expect(store.getState().tasks.map(t => t.title)).toEqual(['z2-任务']);
  });
});

// ============ T03：分区切换（uiSlice） ============
describe('分区切换（setActiveZoneId / setCurrentView）', () => {
  it('setActiveZoneId 切换当前分区并清空 focusedTaskId', () => {
    store.getState().addZone('A', '#1');
    const id = store.getState().zones[0].id;
    store.getState().setFocusedTaskId('some-task');
    store.getState().setActiveZoneId(id);
    expect(store.getState().activeZoneId).toBe(id);
    expect(store.getState().focusedTaskId).toBeNull();
  });

  it('setCurrentView 切换视图（zones ↔ global）', () => {
    expect(store.getState().currentView).toBe('zones');
    store.getState().setCurrentView('global');
    expect(store.getState().currentView).toBe('global');
  });
});
