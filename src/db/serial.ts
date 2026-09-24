let tail: Promise<unknown> = Promise.resolve();

/**
 * Runs database writes one at a time, in call order. expo-sqlite's `withTransactionAsync` is not
 * exclusive: anything else issued on the connection meanwhile lands inside the open transaction,
 * and a second transaction started then fails outright. Queue saves happen on their own schedule
 * (every few seconds while playing), so every multi-statement write goes through here.
 */
export function serial<T>(op: () => Promise<T>): Promise<T> {
  const run = tail.then(op, op);
  tail = run.catch(() => undefined);
  return run;
}
