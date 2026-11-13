import { describe, expect, it } from "vitest";
import { getVersionInfo } from "./versionInfo";

describe("version info", () => {
  it("reports the app version it is given", () => {
    expect(getVersionInfo({ appVersion: "1.2.3", osRelease: "10.0.26100" }).app).toBe("1.2.3");
  });

  it("names Windows 11 from build 22000 on, with the build number", () => {
    expect(getVersionInfo({ appVersion: "1.0.0", osRelease: "10.0.22000" }).windows).toBe(
      "Windows 11 (build 22000)",
    );
    expect(getVersionInfo({ appVersion: "1.0.0", osRelease: "10.0.26100" }).windows).toBe(
      "Windows 11 (build 26100)",
    );
  });

  it("names Windows 10 for builds below 22000", () => {
    expect(getVersionInfo({ appVersion: "1.0.0", osRelease: "10.0.19045" }).windows).toBe(
      "Windows 10 (build 19045)",
    );
  });

  it("falls back to the raw release when it is not a Windows 10 or 11 release", () => {
    expect(getVersionInfo({ appVersion: "1.0.0", osRelease: "6.3.9600" }).windows).toBe(
      "Windows 6.3.9600",
    );
    expect(getVersionInfo({ appVersion: "1.0.0", osRelease: "" }).windows).toBe("Windows");
  });
});
