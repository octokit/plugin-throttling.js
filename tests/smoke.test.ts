import { throttling } from "../src";

describe("Smoke test", () => {
  it("is a function", () => {
    expect(throttling).toBeInstanceOf(Function);
  });

  it("throttling.VERSION is set", () => {
    expect(throttling.VERSION).toEqual("0.0.0-development");
  });
});
