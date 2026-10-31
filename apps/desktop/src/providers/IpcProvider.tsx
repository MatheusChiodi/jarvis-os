import { createContext, useContext, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface IpcContextValue {
  invoke: typeof invoke;
  listen: typeof listen;
}

const IpcContext = createContext<IpcContextValue | null>(null);

export function IpcProvider({ children }: { children: ReactNode }) {
  return (
    <IpcContext.Provider value={{ invoke, listen }}>
      {children}
    </IpcContext.Provider>
  );
}

export function useIpc() {
  const context = useContext(IpcContext);
  if (!context) throw new Error('useIpc must be used within IpcProvider');
  return context;
}