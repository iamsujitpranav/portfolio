import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Contact from "./Contact";
import { profile } from "@content/resume";

// Reveal/Magnetic are framer-motion presentation wrappers; render their
// children directly so the test is about the form, not the animation.
vi.mock("./Reveal", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./Magnetic", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function mockFetch(response: Partial<Response> | Error) {
  const fn = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response as Response),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(
    screen.getByLabelText("Message"),
    "I would like to talk about an engineering role.",
  );
  await user.click(screen.getByRole("button", { name: /Send message/ }));
}

afterEach(() => vi.unstubAllGlobals());

describe("Contact form", () => {
  it("submits a valid lead and confirms it was sent", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ ok: true, status: 200 });
    render(<Contact />);

    await fillAndSubmit(user);

    await waitFor(() =>
      expect(screen.getByText(/your message is on its way/i)).toBeInTheDocument(),
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/contact");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      message: "I would like to talk about an engineering role.",
    });
  });

  it("shows the wait-a-minute copy when the backend rate-limits it", async () => {
    const user = userEvent.setup();
    mockFetch({ ok: false, status: 429 });
    render(<Contact />);

    await fillAndSubmit(user);

    await waitFor(() =>
      expect(screen.getByText(/a few messages in quick succession/i)).toBeInTheDocument(),
    );
    // A 429 must NOT read as a broken backend...
    expect(screen.queryByText(/Couldn't send right now/i)).not.toBeInTheDocument();
    // ...and it still offers the direct route.
    expect(screen.getByText(/a few messages in quick succession/i)).toHaveTextContent(
      profile.email,
    );
  });

  it("shows the generic failure copy for a server error", async () => {
    const user = userEvent.setup();
    mockFetch({ ok: false, status: 502 });
    render(<Contact />);

    await fillAndSubmit(user);

    await waitFor(() =>
      expect(screen.getByText(/Couldn't send right now/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/quick succession/i)).not.toBeInTheDocument();
  });

  it("shows the generic failure copy when the network is down", async () => {
    const user = userEvent.setup();
    mockFetch(new Error("offline"));
    render(<Contact />);

    await fillAndSubmit(user);

    await waitFor(() =>
      expect(screen.getByText(/Couldn't send right now/i)).toBeInTheDocument(),
    );
  });

  it("validates client-side before hitting the network", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ ok: true, status: 200 });
    render(<Contact />);

    await user.type(screen.getByLabelText("Name"), "A");
    await user.type(screen.getByLabelText("Email"), "nope");
    await user.type(screen.getByLabelText("Message"), "short");
    await user.click(screen.getByRole("button", { name: /Send message/ }));

    await waitFor(() => expect(screen.getByText("Please enter your name")).toBeInTheDocument());
    expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText(/10\+ chars/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the form after a successful send", async () => {
    const user = userEvent.setup();
    mockFetch({ ok: true, status: 200 });
    render(<Contact />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue(""));
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("keeps what the visitor typed when the send was throttled", async () => {
    const user = userEvent.setup();
    mockFetch({ ok: false, status: 429 });
    render(<Contact />);

    await fillAndSubmit(user);

    await waitFor(() => expect(screen.getByText(/quick succession/i)).toBeInTheDocument());
    // Retyping the whole message after a rate-limit would be a miserable UX.
    expect(screen.getByLabelText("Name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Message")).toHaveValue(
      "I would like to talk about an engineering role.",
    );
  });
});
