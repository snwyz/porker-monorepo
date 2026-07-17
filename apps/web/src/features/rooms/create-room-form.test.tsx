// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { createRoom, push } = vi.hoisted(() => ({
  createRoom: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ createRoom }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { I18nProvider } from "@/i18n/provider";
import { CreateRoomForm } from "./create-room-form";

describe("CreateRoomForm", () => {
  it("uses a catalogued default room name and hides server failures", async () => {
    const user = userEvent.setup();
    createRoom.mockRejectedValueOnce(new Error("internal database hostname"));

    render(
      <I18nProvider initialLocale="en">
        <CreateRoomForm />
      </I18nProvider>,
    );

    expect(screen.getByLabelText("Room name")).toHaveValue("Heads Up");

    await user.click(screen.getByRole("button", { name: "Create table" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not create table",
      );
    });
    expect(
      screen.queryByText("internal database hostname"),
    ).not.toBeInTheDocument();
  });
});
