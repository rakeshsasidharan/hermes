'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

interface ComingSoonPaneProps {
  label: string;
}

export function ComingSoonPane({ label }: ComingSoonPaneProps) {
  useEffect(() => {
    toast.info(`${label} folder coming soon`, { id: `coming-soon-${label}` });
  }, [label]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center border-b px-4 h-14 shrink-0">
        <h2 className="font-semibold text-sm">{label}</h2>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <p className="text-sm">{label} folder coming soon</p>
      </div>
    </div>
  );
}
