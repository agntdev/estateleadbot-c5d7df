// One clock seam for persisted timestamps. Tests can replace it without changing
// feature logic; production uses the platform clock.
let currentNow = () => Date.now();

export function now(): number {
  return currentNow();
}

export function setNowForTest(next: (() => number) | undefined): void {
  currentNow = next ?? (() => Date.now());
}
