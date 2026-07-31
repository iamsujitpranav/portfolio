"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { profile } from "@content/resume";

type SocialKind = "whatsapp" | "linkedin" | "github" | "gmail";

const contactSchema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.email("Enter a valid email"),
  message: z.string().min(10, "A little more detail, please (10+ chars)"),
});

type ContactValues = z.infer<typeof contactSchema>;
type ContactStatus = "idle" | "sending" | "ok" | "error" | "throttled";

const SOCIALS: { kind: SocialKind; label: string; value: string; href: string }[] = [
  {
    kind: "whatsapp",
    label: "WhatsApp",
    value: "+91 9133795317",
    href: `https://wa.me/${profile.phone.replace(/[^0-9]/g, "")}`,
  },
  {
    kind: "linkedin",
    label: "LinkedIn",
    value: profile.linkedin,
    href: profile.linkedin,
  },
  {
    kind: "github",
    label: "GitHub",
    value: profile.github,
    href: profile.github,
  },
  {
    kind: "gmail",
    label: "Gmail",
    value: profile.email,
    href: `mailto:${profile.email}`,
  },
];

function SocialLogo({ kind }: { kind: SocialKind }) {
  if (kind === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#0a66c2" />
        <path fill="#fff" d="M6.3 8.4H3.8v8.9h2.5V8.4ZM5 4.1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM8.3 8.4h2.4v1.2h.1c.3-.7 1.2-1.5 2.6-1.5 2.6 0 3.1 1.7 3.1 4v5.2H14v-4.6c0-1.1 0-2.5-1.5-2.5s-1.7 1.2-1.7 2.4v4.7H8.3V8.4Z" />
      </svg>
    );
  }

  if (kind === "github") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="#24292f" />
        <path fill="#fff" d="M12 5.2a6.8 6.8 0 0 0-2.2 13.2c.3.1.4-.1.4-.3v-1.2c-1.7.4-2.1-.8-2.1-.8-.3-.7-.7-.9-.7-.9-.6-.4 0-.4 0-.4.6 0 1 .6 1 .6.6 1 1.5.7 1.9.5.1-.4.2-.7.4-.9-1.4-.2-2.8-.7-2.8-3.1 0-.7.2-1.2.6-1.7-.1-.2-.3-.8.1-1.7 0 0 .5-.2 1.7.6a5.8 5.8 0 0 1 3.1 0c1.2-.8 1.7-.6 1.7-.6.4.9.2 1.5.1 1.7.4.5.6 1 .6 1.7 0 2.4-1.4 2.9-2.8 3.1.2.2.4.6.4 1.2v1.8c0 .2.1.4.4.3A6.8 6.8 0 0 0 12 5.2Z" />
      </svg>
    );
  }

  if (kind === "gmail") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="5" fill="#fff" />
        <path fill="#4285f4" d="M4 7.4v9.2h3.1v-6.1L12 14l4.9-3.5v6.1H20V7.4l-3.1 2.2L12 13 7.1 9.6 4 7.4Z" />
        <path fill="#ea4335" d="M4 7.4 7.1 9.6V7.2L12 10.7l4.9-3.5v2.4L20 7.4 17 5.3 12 8.8 7 5.3 4 7.4Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#25d366" />
      <path fill="#fff" d="M17.8 6.2A8.2 8.2 0 0 0 4.9 16.1L4 19.9l3.9-.9A8.2 8.2 0 0 0 17.8 6.2Zm-5.8 11a6.8 6.8 0 0 1-3.5-1l-.3-.2-2.3.5.5-2.2-.2-.3a6.8 6.8 0 0 1 10.6-8.4 6.8 6.8 0 0 1-4.8 11.6Zm3.7-5.1c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1l-.6.8c-.1.2-.3.2-.5.1a5.6 5.6 0 0 1-1.7-1 6.5 6.5 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.4-.5c.1-.1.1-.3.2-.4 0-.1 0-.3-.1-.4l-.6-1.5c-.2-.4-.3-.4-.5-.4h-.4c-.2 0-.4.1-.5.2-.2.2-.7.7-.7 1.7s.7 2  .8 2.1c.1.1 1.4 2.2 3.5 3.1.5.2.8.3 1.1.4.5.2.9.1 1.2.1.4-.1 1.2-.5 1.4-1 .2-.5.2-.9.1-1s-.2-.2-.4-.3Z" />
    </svg>
  );
}

export function SocialLinks() {
  return (
    <div className="jrnSocials">
      {SOCIALS.map((social) => (
        <a
          className="jrnSocialCard"
          href={social.href}
          key={social.kind}
          target={social.kind === "gmail" ? undefined : "_blank"}
          rel={social.kind === "gmail" ? undefined : "noreferrer"}
        >
          <span className="jrnSocialLogo"><SocialLogo kind={social.kind} /></span>
          <span className="jrnSocialCopy">
            <b>{social.label}</b>
            <span>{social.value}</span>
          </span>
          <span className="jrnSocialArrow" aria-hidden="true">↗</span>
        </a>
      ))}
    </div>
  );
}

function SocialContactForm() {
  const [status, setStatus] = useState<ContactStatus>("idle");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    mode: "onTouched",
  });

  async function onSubmit(values: ContactValues) {
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
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
    <form className="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <label htmlFor="social-trail-name">Name</label>
        <input id="social-trail-name" {...register("name")} placeholder="Your name" />
        {errors.name && <div className="err">{errors.name.message}</div>}
      </div>
      <div>
        <label htmlFor="social-trail-email">Email</label>
        <input
          id="social-trail-email"
          type="email"
          {...register("email")}
          placeholder="you@company.com"
        />
        {errors.email && <div className="err">{errors.email.message}</div>}
      </div>
      <div>
        <label htmlFor="social-trail-message">Message</label>
        <textarea
          id="social-trail-message"
          rows={4}
          {...register("message")}
          placeholder="What are you building?"
        />
        {errors.message && <div className="err">{errors.message.message}</div>}
      </div>
      <button
        className="btn primary"
        type="submit"
        disabled={status === "sending"}
        data-cursor
      >
        {status === "sending" ? "Sending…" : "Send message →"}
      </button>
      <div aria-live="polite">
        {status === "ok" && <div className="note ok">Thanks — your message is on its way.</div>}
        {status === "throttled" && (
          <div className="note bad">
            That is a few messages in quick succession — give it a minute, or email me directly
            at {profile.email}.
          </div>
        )}
        {status === "error" && (
          <div className="note bad">Could not send right now. Email me at {profile.email}.</div>
        )}
      </div>
    </form>
  );
}

export default function SocialTrail({
  embedded = false,
  showForm = true,
}: {
  embedded?: boolean;
  showForm?: boolean;
}) {
  return (
    <>
      {!embedded && (
        <>
          <div className="jrnEyebrow">The Trail · Social</div>
          <h2 className="jrnH">Social Trail</h2>
          <p className="jrnLead">Find me across the places where I build, share, and connect.</p>
        </>
      )}
      <SocialLinks />
      {showForm && (
        <div className="jrnSocialContact">
          <div className="jrnContactSocialHeading">Send me a message</div>
          <SocialContactForm />
        </div>
      )}
    </>
  );
}
