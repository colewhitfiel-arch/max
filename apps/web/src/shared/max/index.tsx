import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { MockMaxBridge } from './mock-bridge';
import { MaxSdkBridge } from './sdk-bridge';
import type { MaxBridge, MaxBridgeMode, MaxTheme } from './types';

export * from './types';
export { MockMaxBridge, createMockStorage } from './mock-bridge';
export { MaxSdkBridge, MaxSdkUnavailableError } from './sdk-bridge';

/** Фабрика адаптера по режиму из env. */
export function createMaxBridge(mode: MaxBridgeMode): MaxBridge {
  return mode === 'real' ? new MaxSdkBridge() : new MockMaxBridge();
}

const MaxBridgeContext = createContext<MaxBridge | null>(null);

export function MaxBridgeProvider({
  bridge,
  children,
}: {
  bridge: MaxBridge;
  children: ReactNode;
}) {
  return <MaxBridgeContext.Provider value={bridge}>{children}</MaxBridgeContext.Provider>;
}

export function useMaxBridge(): MaxBridge {
  const bridge = useContext(MaxBridgeContext);
  if (!bridge) throw new Error('useMaxBridge: нет MaxBridgeProvider');
  return bridge;
}

/** Текущая тема мессенджера с подпиской на изменения. */
export function useMaxTheme(): MaxTheme {
  const bridge = useMaxBridge();
  const [theme, setTheme] = useState<MaxTheme>(() => safeTheme(bridge));
  useEffect(() => {
    setTheme(safeTheme(bridge));
    return bridge.on('theme', setTheme);
  }, [bridge]);
  return theme;
}

function safeTheme(bridge: MaxBridge): MaxTheme {
  try {
    return bridge.getTheme();
  } catch {
    return 'light';
  }
}
