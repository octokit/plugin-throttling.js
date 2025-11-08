/**
 * Type definitions for Redis connection support
 * These replace Bottleneck.RedisConnection and Bottleneck.IORedisConnection
 */

export interface RedisConnection {
  client?: any;
  disconnect(): Promise<void>;
  on(event: string, handler: (...args: any[]) => void): void;
}

export interface IORedisConnection {
  client?: any;
  disconnect(): Promise<void>;
  on(event: string, handler: (...args: any[]) => void): void;
}
