import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdminGate from "./AdminGate";
import * as adminLib from "@/lib/admin";

vi.mock("@/lib/admin", () => ({
  adminLogin: vi.fn(),
  adminLogout: vi.fn(),
  adminToken: vi.fn(),
}));

describe("AdminGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminLib.adminToken as any).mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders password input and omits authenticator field in development", () => {
    render(
      <AdminGate title="Admin Login">
        <div>Protected Content</div>
      </AdminGate>,
    );

    expect(screen.getByText("Admin Login")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••••••")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("123456")).not.toBeInTheDocument();
    expect(screen.queryByText(/authenticator/i)).not.toBeInTheDocument();
  });

  it("submits password to adminLogin and unlocks gate on success", async () => {
    (adminLib.adminLogin as any).mockResolvedValueOnce(undefined);

    render(
      <AdminGate title="Admin Login">
        <div>Protected Content</div>
      </AdminGate>,
    );

    const passwordInput = screen.getByPlaceholderText("••••••••••••");
    fireEvent.change(passwordInput, { target: { value: "admin123" } });

    const submitBtn = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(adminLib.adminLogin).toHaveBeenCalledWith("admin123", "");
      expect(screen.getByText("Protected Content")).toBeInTheDocument();
    });
  });

  it("displays error message when login fails", async () => {
    (adminLib.adminLogin as any).mockRejectedValueOnce(new Error("invalid password"));

    render(
      <AdminGate title="Admin Login">
        <div>Protected Content</div>
      </AdminGate>,
    );

    const passwordInput = screen.getByPlaceholderText("••••••••••••");
    fireEvent.change(passwordInput, { target: { value: "wrongpass" } });

    const submitBtn = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("invalid password")).toBeInTheDocument();
    });
  });
});
