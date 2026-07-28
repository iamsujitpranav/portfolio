import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AskResume from "./AskResume";
import { profile } from "@content/resume";

vi.mock("./Reveal", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** A ReadableStream that hands back `chunks` the way the real /api/chat does. */
function textStream(chunks: string[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c) as Uint8Array<ArrayBuffer>);
      controller.close();
    },
  });
}

function mockChat(response: Partial<Response> | Error) {
  const fn = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response as Response),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
  await user.type(screen.getByLabelText("Ask a question"), question);
  await user.click(screen.getByRole("button", { name: /Send/ }));
}

afterEach(() => vi.unstubAllGlobals());

describe("AskResume chat", () => {
  it("opens with the résumé's greeting", () => {
    render(<AskResume />);
    expect(screen.getByText(new RegExp(`I'm ${profile.name}'s résumé`))).toBeInTheDocument();
  });

  it("streams the answer into the assistant bubble", async () => {
    const user = userEvent.setup();
    mockChat({ ok: true, status: 200, body: textStream(["Sujit ", "builds ", "AI systems."]) });
    render(<AskResume />);

    await ask(user, "What do you build?");

    await waitFor(() => expect(screen.getByText("Sujit builds AI systems.")).toBeInTheDocument());
    expect(screen.getByText("What do you build?")).toBeInTheDocument();
  });

  it("sends the conversation without the seeded greeting", async () => {
    const user = userEvent.setup();
    const fetchMock = mockChat({ ok: true, status: 200, body: textStream(["ok"]) });
    render(<AskResume />);

    await ask(user, "Tell me about the stack");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/chat");
    // The greeting is UI furniture — sending it would waste input tokens and
    // put words in the user's mouth.
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [{ role: "user", content: "Tell me about the stack" }],
    });
  });

  it("explains the rate limit instead of claiming the backend is down", async () => {
    const user = userEvent.setup();
    mockChat({ ok: false, status: 429 });
    render(<AskResume />);

    await ask(user, "again and again");

    await waitFor(() =>
      expect(screen.getByText(/rate-limited to keep costs sane/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/isn't reachable right now/i)).not.toBeInTheDocument();
    expect(screen.getByText(/rate-limited to keep costs sane/i)).toHaveTextContent(profile.email);
  });

  it("falls back to the offline copy when the backend errors", async () => {
    const user = userEvent.setup();
    mockChat({ ok: false, status: 503 });
    render(<AskResume />);

    await ask(user, "hello");

    await waitFor(() =>
      expect(screen.getByText(/isn't reachable right now/i)).toBeInTheDocument(),
    );
  });

  it("falls back to the offline copy when the network throws", async () => {
    const user = userEvent.setup();
    mockChat(new Error("offline"));
    render(<AskResume />);

    await ask(user, "hello");

    await waitFor(() =>
      expect(screen.getByText(/isn't reachable right now/i)).toBeInTheDocument(),
    );
  });

  it("re-enables the input after a rate-limited answer", async () => {
    const user = userEvent.setup();
    mockChat({ ok: false, status: 429 });
    render(<AskResume />);

    await ask(user, "one more");

    await waitFor(() => expect(screen.getByLabelText("Ask a question")).toBeEnabled());
    expect(screen.getByLabelText("Ask a question")).toHaveValue("");
  });

  it("won't send an empty question", async () => {
    const user = userEvent.setup();
    const fetchMock = mockChat({ ok: true, status: 200, body: textStream(["hi"]) });
    render(<AskResume />);

    await user.type(screen.getByLabelText("Ask a question"), "   ");

    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers a suggestion chip in one click", async () => {
    const user = userEvent.setup();
    const fetchMock = mockChat({ ok: true, status: 200, body: textStream(["sure"]) });
    render(<AskResume />);

    const chip = document.querySelector(".suggest span") as HTMLElement;
    await user.click(chip);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).messages[0].content).toBe(chip.textContent);
  });
});
