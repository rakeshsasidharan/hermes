import { Loader2 } from 'lucide-react';

export function MessageDetailLoading() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center border-b px-4 h-14 shrink-0">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="h-3.5 w-48 rounded bg-muted animate-pulse" />
          <div className="h-3 w-32 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
