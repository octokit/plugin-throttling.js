import PQueue from "p-queue";

/**
 * Simple throttle limiter for retry logic
 * Replaces basic Bottleneck instance functionality
 */
export class ThrottleLimiter {
  private queue: PQueue;
  private failedHandlers: Set<
    (error: any, info: { args: any[] }) => Promise<number | void>
  > = new Set();

  constructor() {
    this.queue = new PQueue({ concurrency: Infinity });
  }

  /**
   * Schedule a function to run with retry capability
   */
  async schedule<T>(
    fn: (...args: any[]) => Promise<T> | T,
    ...args: any[]
  ): Promise<T> {
    const executeWithRetry = async (): Promise<T> => {
      try {
        return await fn(...args);
      } catch (error) {
        // Call failed handlers and check if we should retry
        for (const handler of this.failedHandlers) {
          const retryAfter = await handler(error, { args });
          if (typeof retryAfter === "number" && retryAfter > 0) {
            // Wait and retry
            await new Promise((resolve) => setTimeout(resolve, retryAfter));
            return executeWithRetry();
          }
        }
        // No retry, rethrow the error
        throw error;
      }
    };

    return this.queue.add(executeWithRetry);
  }

  /**
   * Register a handler for failed requests
   */
  on(
    event: "failed",
    handler: (error: any, info: { args: any[] }) => Promise<number | void>,
  ): void {
    if (event === "failed") {
      this.failedHandlers.add(handler);
    }
  }
}
