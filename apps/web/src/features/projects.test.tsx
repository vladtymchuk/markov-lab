import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectForm } from "./projects";

afterEach(cleanup);

describe("ProjectForm", () => {
  it("validates the title, submits cleaned input, then closes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn();
    render(<ProjectForm onSave={save} close={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Створити проєкт" }));
    expect(await screen.findByText("Введіть назву.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Назва проєкту"), {
      target: { value: " Модель " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Створити проєкт" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        { name: "Модель", description: "" },
        undefined,
      ),
    );
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
});
