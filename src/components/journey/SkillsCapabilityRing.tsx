"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { SkillGroup } from "@content/resume";

function wrap(index: number, total: number) {
  return (index + total) % total;
}

function ringOffset(index: number, active: number, total: number) {
  let offset = index - active;
  if (offset > total / 2) offset -= total;
  if (offset < -total / 2) offset += total;
  return offset;
}

export default function SkillsCapabilityRing({ groups }: { groups: SkillGroup[] }) {
  const [active, setActive] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const activeNodes = useRef<HTMLSpanElement | null>(null);
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const lastWheel = useRef(0);
  const wheelDelta = useRef(0);
  const ring = useRef<HTMLElement>(null);
  const total = groups.length;

  const rotate = (direction: -1 | 1) => {
    setActive((current) => wrap(current + direction, total));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      rotate(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      rotate(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(total - 1);
    }
  };

  useEffect(() => {
    const element = ring.current;
    if (!element) return;

    // Keep vertical wheel gestures native so the surrounding blueprint panel
    // can scroll when the ring is taller than the available display. Only a
    // genuinely horizontal trackpad gesture belongs to the carousel.
    const onWheel = (event: globalThis.WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;

      event.preventDefault();
      event.stopPropagation();
      wheelDelta.current += event.deltaX;
      const now = performance.now();
      if (Math.abs(wheelDelta.current) < 24 || now - lastWheel.current < 180) return;
      const direction = wheelDelta.current > 0 ? 1 : -1;
      wheelDelta.current = 0;
      lastWheel.current = now;
      setActive((current) => wrap(current + direction, total));
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [total]);

  // The node list scrolls when a group has more skills than the card can show.
  // Track that so the card can render a "more below" affordance instead of
  // silently cropping the tail of the list.
  useEffect(() => {
    const element = activeNodes.current;
    if (!element) return;

    const measure = () => setOverflowing(element.scrollHeight - element.clientHeight > 2);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragStart.current = event.clientX;
    dragged.current = false;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (dragStart.current === null) return;
    const movement = event.clientX - dragStart.current;
    if (Math.abs(movement) > 6) dragged.current = true;
    setDragX(Math.max(-100, Math.min(100, movement)));
  };

  const finishDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragStart.current === null) return;
    const movement = event.clientX - dragStart.current;
    if (Math.abs(movement) > 48) rotate(movement < 0 ? 1 : -1);
    dragStart.current = null;
    setDragX(0);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      ref={ring}
      className="jrnCapabilityRing"
      aria-label="Skill capability carousel"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="jrnCapabilityReadout">
        <span>HOLOGRAPHIC CAPABILITY INDEX</span>
        <b>{String(active + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</b>
      </div>

      <div
        className="jrnCapabilityViewport"
        data-dragging={dragging ? "1" : undefined}
        style={{ "--ring-drag": `${dragX}px` } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div className="jrnCapabilityHalo" aria-hidden="true"><i /><i /><i /></div>
        <div className="jrnCapabilityCards">
          {groups.map((group, index) => {
            const offset = ringOffset(index, active, total);
            const visible = Math.abs(offset) <= 2;
            const selected = offset === 0;
            const skillCount = (group.star?.length ?? 0) + group.skills.length;
            return (
              <button
                type="button"
                className="jrnCapabilityCard"
                data-slot={visible ? String(offset) : "far"}
                data-active={selected ? "1" : undefined}
                aria-current={selected ? "true" : undefined}
                aria-label={`${group.title}, ${skillCount} skills${selected ? ", selected" : ""}`}
                tabIndex={visible ? 0 : -1}
                key={group.title}
                onClick={() => {
                  if (!dragged.current) setActive(index);
                  dragged.current = false;
                }}
              >
                <span className="jrnCapabilityCardTop">
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <em>{selected ? "ACTIVE MODULE" : "ROTATE TO OPEN"}</em>
                  <small>{skillCount} NODES</small>
                </span>
                <strong>{group.title}</strong>
                <span className="jrnCapabilityCardLine" aria-hidden="true"><i /></span>
                <span className="jrnCapabilityCardBody" data-overflow={selected && overflowing ? "1" : undefined}>
                  <span className="jrnCapabilityNodes" ref={selected ? activeNodes : undefined}>
                    {(group.star ?? []).map((skill, node) => (
                      <span className="jrnCapabilityNode star" key={skill} style={{ animationDelay: `${node * 45}ms` }}>
                        <i aria-hidden="true" />{skill}<em>CORE</em>
                      </span>
                    ))}
                    {group.skills.map((skill, node) => (
                      <span
                        className="jrnCapabilityNode"
                        key={skill}
                        style={{ animationDelay: `${((group.star?.length ?? 0) + node) * 45}ms` }}
                      >
                        <i aria-hidden="true" />{skill}
                      </span>
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="jrnCapabilityControls">
        <button type="button" onClick={() => rotate(-1)} aria-label="Previous skill category">←</button>
        <div className="jrnCapabilityTabs" role="tablist" aria-label="Skill categories">
          {groups.map((group, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={index === active}
              className="jrnCapabilityTab"
              data-active={index === active ? "1" : undefined}
              key={group.title}
              onClick={() => setActive(index)}
              title={group.title}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => rotate(1)} aria-label="Next skill category">→</button>
      </div>
      <p className="jrnCapabilityHint">Drag sideways, swipe, or use ← → to rotate the capability ring</p>
      <span className="jrnSrOnly" aria-live="polite">{groups[active]?.title} selected</span>
    </section>
  );
}
