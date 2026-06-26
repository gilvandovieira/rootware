let consumedValue: unknown;

export function consume(value: unknown): void {
  consumedValue = value;
}

export function readConsumed(): unknown {
  return consumedValue;
}
