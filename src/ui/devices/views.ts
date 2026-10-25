import type { ComponentType } from 'react';
import type { DeviceId, DeviceStateBase } from '../../core/devices/types.ts';
import { HxStompView } from './hxStomp/HxStompView.tsx';
import { QuadCortexView } from './quadCortex/QuadCortexView.tsx';

/** Свойства компонента, рисующего устройство. */
export interface DeviceViewProps<S extends DeviceStateBase = DeviceStateBase> {
  state: S;
}

/** Компонент изображения каждого устройства. */
export const DEVICE_VIEWS = {
  qc: QuadCortexView,
  hxstomp: HxStompView,
} as Record<DeviceId, ComponentType<DeviceViewProps>>;

/**
 * Отношение ширины изображения устройства к высоте. Панели устройств делят
 * ширину пропорционально ему, чтобы изображения были одной высоты.
 */
export const DEVICE_ASPECT: Record<DeviceId, number> = {
  qc: 290 / 195,
  hxstomp: 178 / 126,
};
