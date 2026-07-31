"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Reveal from "./Reveal";
import Magnetic from "./Magnetic";
import { profile } from "@content/resume";
import { SocialLinks } from "./journey/SocialTrail";

const schema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.email("Enter a valid email"),
  message: z.string().min(10, "A little more detail, please (10+ chars)"),
});
type FormValues = z.infer<typeof schema>;

type Status = "idle" | "sending" | "ok" | "error" | "throttled";

export default function Contact() {
  const [status, setStatus] = useState<Status>("idle");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    // Without a resolver the schema never runs, `errors` stays empty, and a bad
    // field makes submit look like a dead button. Rules mirror the Python side.
    resolver: zodResolver(schema),
    mode: "onTouched",
  });

  async function onSubmit(values: FormValues) {
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      // 429 means the backend's per-IP spam limit kicked in — tell the visitor
      // to wait rather than showing the generic "couldn't send" error.
      if (res.status === 429) {
        setStatus("throttled");
        return;
      }
      if (!res.ok) throw new Error();
      setStatus("ok");
      reset();
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="contact" id="contact">
      <div className="wrap">
        <Reveal>
          <div className="eyebrow">06 · contact</div>
        </Reveal>

        <div className="contactgrid">
          <div>
            <Reveal>
              <h2>
                Let&apos;s build something that <span className="accentword">reasons.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.05}>
              <p className="lede" style={{ margin: "18px 0 0" }}>
                {profile.openTo}
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="links">
                <Magnetic strength={0.3}>
                  <a className="btn primary" href={`mailto:${profile.email}`} data-cursor>
                    {profile.email}
                  </a>
                </Magnetic>
                <Magnetic strength={0.3}>
                  <a className="btn" href={`tel:${profile.phone.replace(/\s/g, "")}`} data-cursor>
                    {profile.phone}
                  </a>
                </Magnetic>
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="contactSocial">
                <div className="eyebrow">Find me online</div>
                <SocialLinks />
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.08} variant="scale">
            <form className="form" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div>
                <label htmlFor="name">Name</label>
                <input id="name" {...register("name")} placeholder="Your name" />
                {errors.name && <div className="err">{errors.name.message}</div>}
              </div>
              <div>
                <label htmlFor="email">Email</label>
                <input id="email" type="email" {...register("email")} placeholder="you@company.com" />
                {errors.email && <div className="err">{errors.email.message}</div>}
              </div>
              <div>
                <label htmlFor="message">Message</label>
                <textarea id="message" rows={4} {...register("message")} placeholder="What are you building?" />
                {errors.message && <div className="err">{errors.message.message}</div>}
              </div>
              <button
                className="btn primary"
                type="submit"
                disabled={status === "sending"}
                style={{ justifyContent: "center" }}
                data-cursor
              >
                {status === "sending" ? "Sending…" : "Send message →"}
              </button>
              {status === "ok" && <div className="note ok">Thanks — your message is on its way.</div>}
              {status === "throttled" && (
                <div className="note bad">
                  That&apos;s a few messages in quick succession — give it a minute, or email me
                  directly at {profile.email}.
                </div>
              )}
              {status === "error" && (
                <div className="note bad">
                  Couldn&apos;t send right now. Email me directly at {profile.email}.
                </div>
              )}
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
