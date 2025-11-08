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
 */
export class ThrottleGroup {
  private queues: Map<string, PQueue> = new Map();
  private lastExecutionTime: Map<string, number> = new Map();
  private readonly options: ThrottleGroupOptions;

  constructor(options: ThrottleGroupOptions) {
    this.options = options;
  }

  /**
   * Get or create a queue for a specific key (e.g., throttling ID)
   */
  key(id: string): ThrottleGroupKeyInstance {
    if (!this.queues.has(id)) {
      const queueOptions: {
        concurrency?: number;
        timeout?: number;
      } = {};
      if (this.options.maxConcurrent !== undefined) {
        queueOptions.concurrency = this.options.maxConcurrent;
      }
      if (this.options.timeout !== undefined) {
        queueOptions.timeout = this.options.timeout;
      }
      this.queues.set(id, new PQueue(queueOptions));
      this.lastExecutionTime.set(id, 0);
    }
    return new ThrottleGroupKeyInstance(
      this.queues.get(id)!,
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
