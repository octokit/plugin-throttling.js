import type { Octokit } from "@octokit/core";
import type { EndpointDefaults } from "@octokit/types";
import type { ThrottleGroup } from "./throttle-group.js";
import type { ThrottleLimiter } from "./throttle-limiter.js";

// Generic connection interface for Redis clustering support
// Users can pass any connection object that implements these methods
export interface Connection {
  disconnect(): Promise<void>;
  on(event: string, handler: (...args: any[]) => void): void;
}

type LimitHandler = (
  retryAfter: number,
  options: Required<EndpointDefaults>,
  octokit: Octokit,
  retryCount: number,
) => void;

export type SecondaryLimitHandler = {
  onSecondaryRateLimit: LimitHandler;
};

export type ThrottlingOptionsBase = {
  enabled?: boolean;
  id?: string;
  timeout?: number;
  connection?: Connection;
  /**
   * @deprecated use `fallbackSecondaryRateRetryAfter`
   */
  minimalSecondaryRateRetryAfter?: number;
  fallbackSecondaryRateRetryAfter?: number;
  retryAfterBaseValue?: number;
  write?: ThrottleGroup;
  search?: ThrottleGroup;
  notifications?: ThrottleGroup;
  onRateLimit: LimitHandler;
};

export type ThrottlingOptions =
  | (ThrottlingOptionsBase & SecondaryLimitHandler)
  | (Partial<ThrottlingOptionsBase & SecondaryLimitHandler> & {
      enabled: false;
    });

export type Groups = {
  global?: ThrottleGroup;
  auth?: ThrottleGroup;
  write?: ThrottleGroup;
  search?: ThrottleGroup;
  notifications?: ThrottleGroup;
};

export type State = {
  clustering: boolean;
  triggersNotification: (pathname: string) => boolean;
  fallbackSecondaryRateRetryAfter: number;
  retryAfterBaseValue: number;
  retryLimiter: ThrottleLimiter;
  id: string;
} & Required<Groups> &
  ThrottlingOptions;

export type CreateGroupsCommon = {
  connection?: Connection;
  timeout: number;
};
