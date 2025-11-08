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
 * ThrottleGroup manages request queuing and rate limiting for a specific group
 * Replaces Bottleneck.Group functionality with p-queue
 *
 * Note: In Bottleneck, maxConcurrent was shared across all keys in a group.
 * We use a single shared queue for the entire group, with per-key minTime tracking.
 */
export class ThrottleGroup {
  private sharedQueue: PQueue;
  private lastExecutionTime: Map<string, number> = new Map();
  private readonly options: ThrottleGroupOptions;

  constructor(options: ThrottleGroupOptions) {
    this.options = options;

    // Create a single shared queue for the entire group
    // Default to concurrency=1 if not specified (matching Bottleneck's default behavior)
    const queueOptions: {
      concurrency: number;
      timeout?: number;
    } = {
      concurrency: options.maxConcurrent ?? 1,
    };
    if (options.timeout !== undefined) {
      queueOptions.timeout = options.timeout;
    }
    this.sharedQueue = new PQueue(queueOptions);
  }

  /**
   * Get a key-specific instance that uses the shared queue
   */
  key(id: string): ThrottleGroupKeyInstance {
    if (!this.lastExecutionTime.has(id)) {
      this.lastExecutionTime.set(id, 0);
    }
    return new ThrottleGroupKeyInstance(
      this.sharedQueue,
      this.lastExecutionTime,
      id,
      this.options.minTime || 0,
    );
  }
}

/**
 * Represents a keyed instance of a throttle group
 * Mimics Bottleneck's key() API
 */
class ThrottleGroupKeyInstance {
  constructor(
    private queue: PQueue,
    private lastExecutionTime: Map<string, number>,
    private id: string,
    private minTime: number,
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

    return this.queue.add(
      async () => {
        // Enforce minTime delay between executions INSIDE the queue
        if (this.minTime > 0) {
          const now = Date.now();
          const lastExecution = this.lastExecutionTime.get(this.id) || 0;
          const timeSinceLastExecution = now - lastExecution;
          const waitTime = Math.max(0, this.minTime - timeSinceLastExecution);

          if (waitTime > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }

        this.lastExecutionTime.set(this.id, Date.now());
        return fn(...actualArgs);
      },
      { priority },
    );
  }
}
