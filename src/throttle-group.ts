import PQueue from "p-queue";
import type { Connection } from "./types.js";

interface ThrottleGroupOptions {
  id: string;
  maxConcurrent?: number;
  minTime?: number;
  timeout?: number;
  connection?: Connection;
}

interface JobOptions {
  priority?: number;
  weight?: number;
  expiration?: number;
}

/**
 * Simple lock to serialize async operations (mimics Bottleneck's Sync class)
 */
class AsyncLock {
  private queue: Array<() => Promise<void>> = [];
  private running = false;

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.tryRun();
    });
  }

  private async tryRun(): Promise<void> {
    if (this.running || this.queue.length === 0) {
      return;
    }

    this.running = true;
    const task = this.queue.shift()!;
    await task();
    this.running = false;
    this.tryRun();
  }
}

/**
 * ThrottleGroup manages request queuing and rate limiting for a specific group
 * Replaces Bottleneck.Group functionality with p-queue
 *
 * Note: In Bottleneck, maxConcurrent was shared across all keys in a group.
 * We use a single shared queue for the entire group.
 *
 * Key Bottleneck behavior: Bottleneck uses internal Sync locks that serialize
 * submission and draining operations, even with maxConcurrent > 1. This causes
 * jobs to be added to the queue one at a time, which with async operations can
 * result in serialized execution in practice. We replicate this with AsyncLock.
 */
export class ThrottleGroup {
  private sharedQueue: PQueue;
  private submitLock: AsyncLock = new AsyncLock();

  constructor(options: ThrottleGroupOptions) {
    // Create a single shared queue for the entire group
    // Use actual maxConcurrent value for p-queue's concurrency
    const queueOptions: {
      concurrency?: number;
      timeout?: number;
      intervalCap?: number;
      interval?: number;
    } = {};

    // Set concurrency to match maxConcurrent (or unlimited if not specified)
    if (options.maxConcurrent !== undefined) {
      queueOptions.concurrency = options.maxConcurrent;
    }

    if (options.timeout !== undefined) {
      queueOptions.timeout = options.timeout;
    }

    // If minTime is specified, use p-queue's interval limiting
    // minTime ensures minimum delay between task starts
    if (options.minTime !== undefined && options.minTime > 0) {
      queueOptions.intervalCap = 1;
      queueOptions.interval = options.minTime;
    }

    this.sharedQueue = new PQueue(queueOptions);
  }

  /**
   * Get a key-specific instance that uses the shared queue
   */
  key(_id: string): ThrottleGroupKeyInstance {
    return new ThrottleGroupKeyInstance(this.sharedQueue, this.submitLock);
  }
}

/**
 * Represents a keyed instance of a throttle group
 * Mimics Bottleneck's key() API
 */
class ThrottleGroupKeyInstance {
  constructor(
    private queue: PQueue,
    private submitLock: AsyncLock,
  ) {}

  /**
   * Schedule a function to run with throttling
   * Mimics Bottleneck's schedule() API
   */
  async schedule<T>(
    jobOptions: JobOptions | ((...args: any[]) => Promise<T> | T),
    fnOrArg1?: ((...args: any[]) => Promise<T> | T) | any,
    ...args: any[]
  ): Promise<T> {
    // Handle overloaded signature - schedule can be called with or without jobOptions
    let fn: (...args: any[]) => Promise<T> | T;
    let actualArgs: any[];
    let options: JobOptions = {};

    if (typeof jobOptions === "function") {
      // Called as: schedule(fn, ...args)
      fn = jobOptions;
      actualArgs = [fnOrArg1, ...args];
    } else {
      // Called as: schedule(options, fn, ...args)
      options = jobOptions;
      fn = fnOrArg1 as (...args: any[]) => Promise<T> | T;
      actualArgs = args;
    }

    // Add to queue with priority if specified
    const priority = options.priority !== undefined ? -options.priority : 0;

    // Use submitLock to serialize queue submissions (mimics Bottleneck's _submitLock)
    return this.submitLock.schedule(() =>
      this.queue.add(async () => fn(...actualArgs), { priority }),
    );
  }
}
