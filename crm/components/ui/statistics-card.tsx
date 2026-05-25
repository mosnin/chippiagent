"use client";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";

const candyBgStyle = `
.stats-candy-bg {
  background-color: hsl(var(--muted));
  background-image: linear-gradient(
    135deg,
    hsl(var(--muted-foreground) / 0.06) 25%,
    transparent 25.5%,
    transparent 50%,
    hsl(var(--muted-foreground) / 0.06) 50.5%,
    hsl(var(--muted-foreground) / 0.06) 75%,
    transparent 75.5%,
    transparent
  );
  background-size: 10px 10px;
}`;

const bars = [
  { value: 34, label: "Manual DMs",    delay: 0.2 },
  { value: 28, label: "Listing forms", delay: 0.4 },
  { value: 91, label: "Chippi",        highlight: true, delay: 0.6 },
  { value: 41, label: "Spreadsheets",  delay: 0.8 },
];

export function Stats() {
  return (
    <section id="problem" className="py-20 px-6 border-t border-border">
      <style>{candyBgStyle}</style>
      <div className="max-w-5xl mx-auto">
        <div className="rounded-2xl border border-border bg-card shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="grid md:grid-cols-2 gap-0">

            {/* Left — text */}
            <div className="flex flex-col justify-center px-8 py-10 md:px-10 border-b md:border-b-0 md:border-r border-border">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">The problem</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight leading-tight">
                Leasing inquiries move fast.<br />Most workflows&nbsp;don&apos;t.
              </h2>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Leads arrive through DMs, listing sites, texts, and forms. Important
                  context gets lost, follow-up order gets fuzzy, and every day starts
                  with cleanup.
                </p>
                <p>
                  Chippi gives you one clean intake path and one command center so you
                  can act faster with less manual chaos.
                </p>
              </div>
              <ul className="mt-6 space-y-2.5">
                {[
                  'Leads scattered across DMs, texts & forms',
                  'No consistent qualification process',
                  'Follow-up order is always unclear',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — bar chart */}
            <div className="flex items-end px-8 py-10 md:px-10">
              <div className="relative flex h-64 w-full items-end justify-center gap-3">
                {bars.map((bar, i) => (
                  <motion.div
                    key={bar.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.12, type: "spring", damping: 14 }}
                    className="h-full w-full"
                  >
                    <BarChart {...bar} />
                  </motion.div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}

function BarChart({
  value,
  label,
  highlight = false,
  delay = 0,
}: {
  value: number;
  label: string;
  highlight?: boolean;
  delay?: number;
}) {
  return (
    <div className="group relative h-full w-full">
      <div className="stats-candy-bg relative h-full w-full overflow-hidden rounded-2xl border border-border">
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: `${value}%` }}
          transition={{ duration: 0.6, type: "spring", damping: 18, delay }}
          className={cn(
            "absolute bottom-0 w-full rounded-2xl p-2",
            highlight
              ? "bg-primary text-primary-foreground"
              : "bg-muted-foreground/20 text-foreground"
          )}
        >
          <div className="relative flex h-10 w-full items-center justify-center rounded-full bg-background/15 text-xs font-semibold tabular-nums tracking-tight">
            <NumberFlow value={value} suffix="%" />
          </div>
        </motion.div>
      </div>

      {highlight && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: delay + 0.3 }}
          className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-md"
        >
          Best conversion rate
          <svg
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-primary"
            width="10" height="7" viewBox="0 0 10 7" fill="none"
          >
            <path d="M3.84 6.41C4.44 7.45 5.94 7.45 6.54 6.41L9.66 1.01C10.26 -0.03 9.51 -1.32 8.31 -1.32H2.07C0.87 -1.32 0.12 -0.03 0.72 1.01L3.84 6.41Z" fill="currentColor" />
          </svg>
        </motion.div>
      )}

      <p className="mx-auto mt-2 w-fit text-center text-[11px] text-muted-foreground/70 tracking-tight">
        {label}
      </p>
    </div>
  );
}
