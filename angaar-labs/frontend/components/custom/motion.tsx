"use client";

import { LayoutGroup, LazyMotion, MotionConfig, domAnimation, m, useReducedMotion } from "motion/react";
import { Children, cloneElement, isValidElement } from "react";

// The one door to the motion library. Components import `m` from here, never `motion`:
// LazyMotion is strict, so a stray `motion.div` throws at once instead of silently loading the full bundle.

export { m, LayoutGroup };

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Mounted once in components/providers.tsx. Honours the system's reduced-motion setting. */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/** `dur(220)` is 220ms, or 0 when the person asked for less motion. */
export function useMotionSafe() {
  const reduced = useReducedMotion() ?? false;
  return { reduced, dur: (ms: number) => (reduced ? 0 : ms) };
}

type RevealProps = { as?: "div" | "section" | "li" | "tr" | "span"; delay?: number; y?: number; className?: string; children: React.ReactNode };

/** Fades a block in with a small rise. Runs once per mount; never on refetch. */
export function Reveal({ as = "div", delay = 0, y = 6, className, children }: RevealProps) {
  const { dur } = useMotionSafe();
  const Tag = m[as];
  return (
    <Tag initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur(220) / 1000, delay, ease: EASE }} className={className}>
      {children}
    </Tag>
  );
}

/** Reveals each child a little after the one before; children past `max` land at once. */
export function Stagger({ step = 35, max = 12, as, y, className, children }: { step?: number; max?: number; as?: RevealProps["as"]; y?: number; className?: string; children: React.ReactNode }) {
  return (
    <>
      {Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child;
        if (index >= max) return child;
        return (
          <Reveal as={as} y={y} delay={(index * step) / 1000} className={className}>
            {cloneElement(child)}
          </Reveal>
        );
      })}
    </>
  );
}
