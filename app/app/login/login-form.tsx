'use client';

import { useActionState, useEffect, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, type LoginState } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

const INITIAL_STATE: LoginState = {};

export function LoginForm() {
  const router = useRouter();
  // The server action is bound to the form's `action` so React server-renders
  // it as a POST. A submit that lands before hydration therefore still POSTs
  // to the server action instead of falling back to a native GET that would
  // put the credentials in the URL query string (see #266).
  const [state, formAction, isPending] = useActionState(loginAction, INITIAL_STATE);
  const [password, setPassword] = useState('');
  const [handledState, setHandledState] = useState(state);

  if (state !== handledState) {
    setHandledState(state);
    if (state.error) {
      setPassword('');
    }
  }

  useEffect(() => {
    if (state.success) {
      router.push('/');
    }
  }, [state.success, router]);

  const isLoading = isPending || Boolean(state.success);
  const error = isPending ? undefined : state.error;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Once hydrated, dispatch the action manually so React does not reset the
    // form afterwards — the username should survive a failed attempt.
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          disabled={isLoading}
          placeholder="admin"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isLoading}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}
