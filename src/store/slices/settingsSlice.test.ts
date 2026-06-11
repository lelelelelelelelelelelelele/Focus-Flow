import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';

import { createSettingsSlice, type SettingsSlice } from './settingsSlice';

// settingsSlice 的 updateSettings 不依赖其它切片，可单独实例化。
function makeStore(): StoreApi<SettingsSlice> {
  return createStore<SettingsSlice>()(createSettingsSlice as unknown as StateCreator<SettingsSlice>);
}

let store: StoreApi<SettingsSlice>;
beforeEach(() => {
  store = makeStore();
});

// ============ T11：默认设置 ============
describe('默认设置', () => {
  it('初始番茄钟时长与语言为预期默认值', () => {
    const s = store.getState().settings;
    expect(s.language).toBe('zh');
    expect(s.workDuration).toBe(25 * 60);
    expect(s.breakDuration).toBe(5 * 60);
    expect(s.longBreakDuration).toBe(15 * 60);
    expect(s.autoSaveEnabled).toBe(true);
    expect(s.autoSaveInterval).toBe(120);
  });
});

// ============ T11：修改设置 ============
describe('updateSettings（修改并保留设置）', () => {
  it('修改专注时长为 30 分钟', () => {
    store.getState().updateSettings({ workDuration: 30 * 60 });
    expect(store.getState().settings.workDuration).toBe(30 * 60);
  });

  it('切换语言 zh → en → zh', () => {
    store.getState().updateSettings({ language: 'en' });
    expect(store.getState().settings.language).toBe('en');
    store.getState().updateSettings({ language: 'zh' });
    expect(store.getState().settings.language).toBe('zh');
  });

  it('部分更新只改目标字段，其它设置保持不变', () => {
    const before = store.getState().settings;
    store.getState().updateSettings({ workDuration: 50 * 60 });
    const after = store.getState().settings;
    expect(after.workDuration).toBe(50 * 60);
    // 其余字段不受影响
    expect(after.language).toBe(before.language);
    expect(after.breakDuration).toBe(before.breakDuration);
    expect(after.autoSaveEnabled).toBe(before.autoSaveEnabled);
  });
});
