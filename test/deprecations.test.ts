import { Octokit } from "@octokit/core";
import { throttling } from "../src";

const TestOctokit = Octokit.plugin(throttling);

describe.skip("deprecations", () => {
  it("No deprecations", () => {});
});
