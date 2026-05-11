'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export interface ComposeInitialData {
  draftId?: string;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  attachmentKeys?: string[];
}

interface ComposeContextValue {
  isOpen: boolean;
  initialData: ComposeInitialData | null;
  openCompose: (data?: ComposeInitialData) => void;
  closeCompose: () => void;
}

const ComposeContext = createContext<ComposeContextValue | null>(null);

export function useCompose() {
  const ctx = useContext(ComposeContext);
  if (!ctx) throw new Error('useCompose must be used within ComposeProvider');
  return ctx;
}

interface ComposeProviderProps {
  children: ReactNode;
}

export function ComposeProvider({ children }: ComposeProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialData, setInitialData] = useState<ComposeInitialData | null>(null);

  function openCompose(data?: ComposeInitialData) {
    setInitialData(data ?? null);
    setIsOpen(true);
  }

  function closeCompose() {
    setIsOpen(false);
    setInitialData(null);
  }

  return (
    <ComposeContext.Provider value={{ isOpen, initialData, openCompose, closeCompose }}>
      {children}
    </ComposeContext.Provider>
  );
}