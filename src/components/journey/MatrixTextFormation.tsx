"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";

const MATRIX_GLYPHS = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ{}[]<>/\\|:+-=*#_";
const STATIC_SELECTOR = [
  "[data-text-static]",
  "[aria-hidden='true']",
  "button",
  "kbd",
  "input",
  "textarea",
  "select",
  "option",
  "script",
  "style",
  "svg",
  "canvas",
].join(",");

type FormingNode = {
  node: Text;
  original: string;
  parent: HTMLElement;
  seed: number;
  delay: number;
  duration: number;
};

function scrambledText(text: string, settled: number, tick: number, seed: number) {
  const characters = [...text];
  const settledCharacters = Math.floor(characters.length * settled);

  return characters
    .map((character, index) => {
      if (/\s/.test(character)) return character;
      if (index < settledCharacters) return character;
      return MATRIX_GLYPHS[(index * 17 + tick * 7 + seed * 23) % MATRIX_GLYPHS.length];
    })
    .join("");
}

function textNodesInside(root: HTMLElement): FormingNode[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const original = node.textContent ?? "";
      const parent = node.parentElement;
      if (!parent || !original.trim() || parent.closest(STATIC_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const result: FormingNode[] = [];
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const original = node.data;
    const index = result.length;
    result.push({
      node,
      original,
      parent: node.parentElement as HTMLElement,
      seed: index * 11 + original.length,
      delay: 90 + Math.min(index * 48, 1_050),
      duration: Math.min(1_750, 820 + original.length * 9),
    });
    current = walker.nextNode();
  }
  return result;
}

/**
 * Gives every immersive résumé display the Architect board's text language:
 * a scrambled silhouette, falling glyph echoes, then a left-to-right resolve.
 * Classic View never mounts this component.
 */
export default function MatrixTextFormation({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const element = root.current;
    if (!element || reduceMotion) return;

    const entries = textNodesInside(element);
    if (!entries.length) return;

    const activeByParent = new Map<HTMLElement, number>();
    for (const entry of entries) {
      entry.node.data = scrambledText(entry.original, 0, 0, entry.seed);
      activeByParent.set(entry.parent, (activeByParent.get(entry.parent) ?? 0) + 1);
      entry.parent.classList.add("jrnTextForming");
    }

    element.classList.add("is-forming");
    element.setAttribute("aria-busy", "true");

    const startedAt = performance.now();
    let frame = 0;

    const finishEntry = (entry: FormingNode) => {
      entry.node.data = entry.original;
      const remaining = (activeByParent.get(entry.parent) ?? 1) - 1;
      if (remaining <= 0) {
        activeByParent.delete(entry.parent);
        entry.parent.classList.remove("jrnTextForming");
      } else {
        activeByParent.set(entry.parent, remaining);
      }
    };

    const animate = (now: number) => {
      const elapsed = now - startedAt;
      const tick = Math.floor(elapsed / 72);
      let complete = true;

      for (const entry of entries) {
        const local = elapsed - entry.delay;
        if (local < entry.duration) complete = false;

        if (local <= 0) {
          entry.node.data = scrambledText(entry.original, 0, tick, entry.seed);
          continue;
        }

        if (local >= entry.duration) {
          if (entry.node.data !== entry.original) finishEntry(entry);
          continue;
        }

        // Keep the full scrambled silhouette briefly, then let the real copy
        // lock into place from left to right.
        const progress = local / entry.duration;
        const settled = Math.max(0, Math.min(1, (progress - 0.24) / 0.76));
        entry.node.data = scrambledText(entry.original, settled, tick, entry.seed);
      }

      if (complete) {
        element.classList.remove("is-forming");
        element.removeAttribute("aria-busy");
        return;
      }
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      for (const entry of entries) {
        entry.node.data = entry.original;
        entry.parent.classList.remove("jrnTextForming");
      }
      element.classList.remove("is-forming");
      element.removeAttribute("aria-busy");
    };
  }, [reduceMotion]);

  return (
    <div ref={root} className="jrnTextFormation">
      {children}
    </div>
  );
}
