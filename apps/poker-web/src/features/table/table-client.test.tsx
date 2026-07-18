// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ refreshGuest: vi.fn() }));
vi.mock("@/lib/socket", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/socket")>();
  return {
    ...actual,
    emitAck: vi.fn().mockResolvedValue({ ok: true }),
    createTableSocket: () => ({
      disconnect: vi.fn(),
      on: (event: string, handler: (payload: unknown) => void) => {
        handlers.set(event, handler);
      },
    }),
  };
});

import { I18nProvider } from "@/i18n/provider";
import { TableClient } from "./table-client";

describe("TableClient", () => {
  it("formats the P000188 resync notice through the active locale", async () => {
    const user = userEvent.setup();
    handlers.clear();
    render(
      <I18nProvider initialLocale="zh-CN">
        <TableClient roomId="room-1" />
      </I18nProvider>,
    );

    await waitFor(() => expect(handlers.get("table:error")).toBeDefined());
    handlers.get("connect")?.(undefined);
    await user.click(screen.getByRole("button", { name: "加入牌桌" }));
    await screen.findByRole("heading", { name: "牌桌" });
    handlers.get("table:error")?.({ ok: false, code: "P000188" });

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "你操作时牌桌状态已变化，已重新同步且未丢弃当前视图。",
      ),
    );
  });
});
