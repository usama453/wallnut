/**
 * Minimal async semaphore. Serverless functions are per-instance, so this is a
 * best-effort cap on concurrent heavy work (e.g. Gemini proofs) per warm instance.
 */
export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export const proofSemaphore = new Semaphore(3);
