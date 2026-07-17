// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@reown/appkit/react", () => ({
  useAppKit: () => ({ open: vi.fn() }),
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: undefined, isConnected: false }),
  useChainId: () => 84532,
  useSwitchChain: () => ({ isPending: false, switchChain: vi.fn() }),
}));

import { I18nProvider } from "@/i18n/provider";
import { ConnectButton } from "./connect-button";

describe("ConnectButton", () => {
  it("uses the active locale for the disconnected wallet call to action", () => {
    render(
      <I18nProvider initialLocale="zh-CN">
        <ConnectButton />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "连接钱包" })).toBeVisible();
  });
});
