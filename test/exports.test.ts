import type { ThrottlingOptions } from "../src";
import type { Octokit } from "@octokit/core";

describe("Exports", function () {
  it("Should export ThrottlingOptions", function () {
    const options: ThrottlingOptions = {
      enabled: true,
      onRateLimit: () => {},
      onSecondaryRateLimit: () => {},
    };

    options.enabled = false;
    options.onRateLimit(10, {}, {} as Octokit, 0);
    options.onSecondaryRateLimit(10, {}, {} as Octokit, 0);
  });
});
