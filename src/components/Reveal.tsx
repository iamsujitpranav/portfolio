"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

type Variant = "up" | "fade" | "mask" | "scale";

const VARIANTS: Record<Variant, Variants> = {
  up: {
    hidden: { opacity: 0, y: 26 },
    show: { opacity: 1, y: 0 },
  },
  fade: {
    hidden: { opacity: 0 },
    show: { opacity: 1 },
  },
  mask: {
    hidden: { opacity: 0, y: 40, filter: "blur(6px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)" },
  },
  scale: {
    hidden: { opacity: 0, scale: 0.94 },
    show: { opacity: 1, scale: 1 },
  },
};

/** Scroll-into-view reveal. Defaults to a soft rise; pass `variant` for more. */
export default function Reveal({
  children,
  delay = 0,
  variant = "up",
  className,
  amount = 0.2,
}: {
  children: ReactNode;
  delay?: number;
  variant?: Variant;
  className?: string;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={VARIANTS[variant]}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      transition={{ duration: 0.7, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Container that staggers its direct <RevealItem> children. */
export function RevealGroup({
  children,
  className,
  stagger = 0.08,
  amount = 0.2,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      variants={{ show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
  variant = "up",
}: {
  children: ReactNode;
  className?: string;
  variant?: Variant;
}) {
  return (
    <motion.div
      className={className}
      variants={VARIANTS[variant]}
      transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
