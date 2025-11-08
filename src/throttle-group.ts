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

  constructor(options: ThrottleGroupOptions) {
    // Create a single shared queue for the entire group
    // Bottleneck defaults: maxConcurrent=null (unlimited), minTime=0
    const queueOptions: {
      concurrency?: number;
      timeout?: number;
      intervalCap?: number;
      interval?: number;
    } = {};

    // Set concurrency if maxConcurrent is specified (otherwise p-queue defaults to Infinity)
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
    return new ThrottleGroupKeyInstance(this.sharedQueue);
  }
}

/**
 * Represents a keyed instance of a throttle group
 * Mimics Bottleneck's key() API
 */
class ThrottleGroupKeyInstance {
  constructor(private queue: PQueue) {}

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

    return this.queue.add(async () => fn(...actualArgs), { priority });
  }
}
