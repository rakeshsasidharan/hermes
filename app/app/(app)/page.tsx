import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { ResolveDefaultAddress } from './resolve-default-address';

export default function DefaultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResolveDefaultAddress />
    </Suspense>
  );
}
