// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { listRooms } = vi.hoisted(() => ({ listRooms: vi.fn() }));

vi.mock("@/lib/api", () => ({ listRooms }));

import { I18nProvider } from "@poker/next-i18n/react";
import { RoomList } from "./room-list";

afterEach(() => {
  cleanup();
  listRooms.mockReset();
});

describe("RoomList", () => {
  it("shows the catalogued load error without exposing a server error message", async () => {
    listRooms.mockRejectedValue(new Error("database connection refused"));

    render(
      <I18nProvider initialLocale="en">
        <RoomList />
      </I18nProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load rooms",
    );
    expect(
      screen.queryByText("database connection refused"),
    ).not.toBeInTheDocument();
  });
});
