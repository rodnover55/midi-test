import { hxStompEngine } from './hxStomp/engine.ts';
import { quadCortexEngine } from './quadCortex/engine.ts';
import type { DeviceEngine, DeviceId } from './types.ts';

/** Модели всех поддерживаемых процессоров. */
export const ENGINES: Record<DeviceId, DeviceEngine> = {
  qc: quadCortexEngine as DeviceEngine,
  hxstomp: hxStompEngine as DeviceEngine,
};
