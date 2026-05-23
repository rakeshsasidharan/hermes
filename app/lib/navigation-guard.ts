type GuardFn = (proceed: () => void) => void;

let _guard: GuardFn | null = null;

export function setNavigationGuard(fn: GuardFn | null): void {
  _guard = fn;
}

export function isGuardActive(): boolean {
  return _guard !== null;
}

export function tryNavigate(proceed: () => void): void {
  if (_guard) {
    _guard(proceed);
  } else {
    proceed();
  }
}
