import { describe, expect, it } from 'vitest';
import { migrateConfig, normalizeConfig } from './config.ts';
import { ENGINES } from './devices/registry.ts';

describe('migrateConfig', () => {
  const saved = (version?: number) => ({
    ...(version === undefined ? {} : { version }),
    devices: { qc: { channel: 3, settings: { startModeSlot: 'unknown', tempoLed: false } } },
  });

  it('заменяет «неизвестен» прежнего значения по умолчанию на Mode Slot 2', () => {
    const config = normalizeConfig(migrateConfig(saved()), ENGINES);
    expect(config.devices.qc.settings.startModeSlot).toBe('2');
    expect(config.devices.qc.settings.tempoLed).toBe(false);
    expect(config.devices.qc.channel).toBe(3);
  });

  it('оставляет «неизвестен», выбранный в текущей версии', () => {
    const config = normalizeConfig(migrateConfig(saved(2)), ENGINES);
    expect(config.devices.qc.settings.startModeSlot).toBe('unknown');
  });

  it('не трогает другие значения и пустую конфигурацию', () => {
    const raw = { devices: { qc: { settings: { startModeSlot: '3' } } } };
    expect(migrateConfig(raw)).toBe(raw);
    expect(migrateConfig(undefined)).toBeUndefined();
  });
});
