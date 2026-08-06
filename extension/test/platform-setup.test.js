import { describe, expect, it } from "vitest";
import {
  detectSetupBrowser,
  detectSetupPlatform,
  getPlatformSetup,
  SETUP_BROWSER,
  SETUP_PLATFORM
} from "../src/core/platform-setup.js";

describe("platform setup", () => {
  it("uses Windows instructions from extension platform information", () => {
    const platform = detectSetupPlatform(
      { os: "win", arch: "x86-64" },
      { platform: "MacIntel" }
    );
    expect(platform).toBe(SETUP_PLATFORM.WINDOWS);
    expect(getPlatformSetup(platform)).toMatchObject({
      shellLabel: "PowerShell",
      installCommand: "winget install --id Aiden1020.LocalSubs --exact",
      setupCommand: "localsubs setup --backend auto"
    });
  });

  it("uses macOS Homebrew instructions", () => {
    const platform = detectSetupPlatform({ os: "mac" });
    expect(platform).toBe(SETUP_PLATFORM.MACOS);
    expect(getPlatformSetup(platform).installCommand).toContain("brew install localsubs");
    expect(getPlatformSetup(platform).setupCommand).toBe("localsubs setup");
  });

  it("recognizes Darwin as macOS rather than Windows", () => {
    expect(detectSetupPlatform({ os: "darwin" })).toBe(SETUP_PLATFORM.MACOS);
  });

  it("falls back to navigator platform information", () => {
    expect(detectSetupPlatform({}, { userAgentData: { platform: "Windows" } }))
      .toBe(SETUP_PLATFORM.WINDOWS);
    expect(detectSetupPlatform({}, { platform: "MacIntel" }))
      .toBe(SETUP_PLATFORM.MACOS);
  });

  it("does not show install commands on unsupported systems", () => {
    expect(detectSetupPlatform({ os: "linux" }, { userAgent: "Windows NT 10.0" }))
      .toBe(SETUP_PLATFORM.UNSUPPORTED);
    expect(getPlatformSetup(SETUP_PLATFORM.UNSUPPORTED)).toBeUndefined();
  });

  it("does not show x64 Windows instructions on Windows ARM64", () => {
    expect(detectSetupPlatform({ os: "win", arch: "arm64" }))
      .toBe(SETUP_PLATFORM.UNSUPPORTED);
  });

  it("adds the Edge browser argument to Windows and macOS setup", () => {
    const browser = detectSetupBrowser({
      userAgent: "Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0"
    });
    expect(browser).toBe(SETUP_BROWSER.EDGE);
    expect(getPlatformSetup(SETUP_PLATFORM.WINDOWS, browser).setupCommand)
      .toBe("localsubs setup --browser edge --backend auto");
    expect(getPlatformSetup(SETUP_PLATFORM.MACOS, browser).setupCommand)
      .toBe("localsubs setup --browser edge");
  });
});
