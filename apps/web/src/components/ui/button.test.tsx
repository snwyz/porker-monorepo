// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoaderCircle, Save } from "lucide-react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "./sheet";
import { Slider } from "./slider";
import { Toast, ToastProvider, ToastViewport } from "./toast";

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
});

afterEach(cleanup);

function ExampleDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Table settings</DialogTitle>
        <DialogDescription>Adjust this table.</DialogDescription>
        <Button>Save</Button>
      </DialogContent>
    </Dialog>
  );
}

describe("accessible UI primitives", () => {
  it("defines the exact premium semantic palette", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(css).toContain("--background: #0d1210");
    expect(css).toContain("--surface: #151b18");
    expect(css).toContain("--felt: #0f6a4e");
    expect(css).toContain("--walnut: #3a2a20");
    expect(css).toContain("--primary: #d6b262");
    expect(css).toContain("--text: #f4ead6");
    expect(css).toContain("--muted: #9ba89f");
    expect(css).toContain("--destructive: #c95d5d");
  });

  it("returns focus to the trigger when dialog closes", async () => {
    const user = userEvent.setup();
    render(<ExampleDialog />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("cycles dialog focus forward and backward", async () => {
    const user = userEvent.setup();
    render(<ExampleDialog />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Table settings" });
    expect(dialog).toHaveAccessibleDescription("Adjust this table.");

    const first = screen.getByRole("button", { name: "Save" });
    const last = screen.getByRole("button", { name: "Close" });
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("keeps loading button text and icons while disabling interaction", () => {
    render(
      <Button loading loadingText="Saving" icon={<Save aria-hidden="true" />}>
        Save changes
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Saving")).toBeVisible();
    expect(button.querySelector("svg")).toBeInstanceOf(SVGElement);
    expect(button.querySelector(".animate-spin")).toBeInstanceOf(SVGElement);
  });

  it("preserves disabled button text and icons", () => {
    render(
      <Button disabled icon={<Save aria-hidden="true" />}>
        Save changes
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Save changes")).toBeVisible();
    expect(button.querySelector("svg")).toBeInstanceOf(SVGElement);
  });

  it("disables button and spinner motion when reduced motion is preferred", () => {
    render(<Button loading>Save changes</Button>);

    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveClass("motion-reduce:transition-none");
    expect(button.querySelector(".animate-spin")).toHaveClass(
      "motion-reduce:animate-none",
    );
  });

  it("supports keyboard interaction and labeling for a slider", async () => {
    const user = userEvent.setup();

    function ExampleSlider() {
      const [value, setValue] = useState([25]);
      return (
        <Slider
          aria-label="Table volume"
          max={100}
          onValueChange={setValue}
          step={5}
          value={value}
        />
      );
    }

    render(<ExampleSlider />);
    const slider = screen.getByRole("slider", { name: "Table volume" });
    slider.focus();
    await user.keyboard("{ArrowRight}");

    expect(slider).toHaveAttribute("aria-valuenow", "30");
    expect(slider).toHaveClass(
      "motion-reduce:transition-none",
      "motion-reduce:hover:scale-100",
    );
  });

  it("disables dialog surface motion when reduced motion is preferred", async () => {
    const user = userEvent.setup();
    render(<ExampleDialog />);

    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Table settings" });
    const overlay = Array.from(
      document.querySelectorAll<HTMLElement>("[data-state='open']"),
    ).find((element) => element.classList.contains("inset-0"));

    expect(dialog).toHaveClass(
      "motion-reduce:animate-none",
      "motion-reduce:transition-none",
    );
    expect(overlay).toHaveClass(
      "motion-reduce:animate-none",
      "motion-reduce:transition-none",
    );
  });

  it("labels the sheet and closes it with Escape", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger asChild>
          <Button>Open menu</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle>Table menu</SheetTitle>
          <SheetDescription>Choose a table action.</SheetDescription>
          <Button>Leave table</Button>
        </SheetContent>
      </Sheet>,
    );

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(
      screen.getByRole("dialog", { name: "Table menu" }),
    ).toHaveAccessibleDescription("Choose a table action.");
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Table menu" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
  });

  it("traps focus and disables surface motion in the sheet", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger asChild>
          <Button>Open menu</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle>Table menu</SheetTitle>
          <SheetDescription>Choose a table action.</SheetDescription>
          <Button>Leave table</Button>
        </SheetContent>
      </Sheet>,
    );

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const sheet = screen.getByRole("dialog", { name: "Table menu" });
    const first = screen.getByRole("button", { name: "Leave table" });
    const last = screen.getByRole("button", { name: "Close" });
    const overlay = Array.from(
      document.querySelectorAll<HTMLElement>("[data-state='open']"),
    ).find((element) => element.classList.contains("inset-0"));

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    expect(sheet).toHaveClass(
      "motion-reduce:animate-none",
      "motion-reduce:transition-none",
    );
    expect(overlay).toHaveClass(
      "motion-reduce:animate-none",
      "motion-reduce:transition-none",
    );
  });

  it("announces toast content", () => {
    render(
      <ToastProvider>
        <Toast open>
          <LoaderCircle aria-hidden="true" />
          Saved table settings
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    const toast = screen.getByRole("status");
    expect(toast).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Saved table settings")).toBeVisible();
  });

  it("announces destructive toast content assertively", () => {
    render(<Toast variant="destructive">Unable to save table settings</Toast>);

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });
});
