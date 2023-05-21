import { Octokit } from "@octokit/core";
import Bottleneck from "bottleneck";

type LimitHandler = (
  retryAfter: number,
  options: object,
  octokit: Octokit,
  retryCount: number
) => void;

export type SecondaryLimitHandler = {
  onSecondaryRateLimit: LimitHandler;
};

export type ThrottlingOptionsBase = {
  enabled?: boolean;
  Bottleneck?: typeof Bottleneck;
  id?: string;
  timeout?: number;
  connection?: Bottleneck.RedisConnection | Bottleneck.IORedisConnection;
  /**
   * @deprecated use `fallbackSecondaryRateRetryAfter`
   */
  minimalSecondaryRateRetryAfter?: number;
  fallbackSecondaryRateRetryAfter?: number;
  retryAfterBaseValue?: number;
  write?: Bottleneck.Group;
  search?: Bottleneck.Group;
  notifications?: Bottleneck.Group;
  onRateLimit: LimitHandler;
};

export type ThrottlingOptions =
  | (ThrottlingOptionsBase & SecondaryLimitHandler)
  | (Partial<ThrottlingOptionsBase & SecondaryLimitHandler> & {
      enabled: false;
    });

export type Groups = {
  global?: Bottleneck.Group;
  write?: Bottleneck.Group;
  search?: Bottleneck.Group;
  notifications?: Bottleneck.Group;
};
