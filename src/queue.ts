type Job<T> = {
  data: T;
  resolve: (value: void) => void;
  reject: (error: Error) => void;
};

export class AsyncQueue<T> {
  private queue: Job<T>[] = [];
  private running = 0;
  private concurrency: number;
  private handler: (data: T) => Promise<void>;

  constructor(handler: (data: T) => Promise<void>, concurrency = 3) {
    this.handler = handler;
    this.concurrency = concurrency;
  }

  enqueue(data: T): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this.process();
    });
  }

  private async process() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.running++;
      try {
        await this.handler(job.data);
        job.resolve();
      } catch (err) {
        job.reject(err instanceof Error ? err : new Error(String(err)));
      } finally {
        this.running--;
        this.process();
      }
    }
  }

  get pending() {
    return this.queue.length;
  }

  get active() {
    return this.running;
  }
}
