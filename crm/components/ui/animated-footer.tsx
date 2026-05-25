'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Dot } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';

interface LinkItem {
  href: string;
  label: string;
  external?: boolean;
}

interface AnimatedFooterProps {
  leftLinks: LinkItem[];
  rightLinks: LinkItem[];
  copyrightText: string;
  barCount?: number;
}

export default function AnimatedFooter({
  leftLinks,
  rightLinks,
  copyrightText,
  barCount = 23
}: AnimatedFooterProps) {
  const waveRefs = useRef<(HTMLDivElement | null)[]>([]);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.2 }
    );

    if (footerRef.current) observer.observe(footerRef.current);

    return () => {
      if (footerRef.current) observer.unobserve(footerRef.current);
    };
  }, []);

  useEffect(() => {
    let t = 0;

    const animateWave = () => {
      let offset = 0;
      waveRefs.current.forEach((element, index) => {
        if (element) {
          offset += Math.max(0, 20 * Math.sin((t + index) * 0.3));
          element.style.transform = `translateY(${index + offset}px)`;
        }
      });

      t += 0.1;
      animationFrameRef.current = requestAnimationFrame(animateWave);
    };

    if (isVisible) {
      animateWave();
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isVisible]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer
      ref={footerRef}
      className="relative flex w-full select-none flex-col justify-between border-t border-border bg-card"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-6 px-6 pb-20 pt-10 md:flex-row">
        <div className="space-y-4">
          <BrandLogo className="h-7" alt="Chippi" />
          <ul className="flex flex-wrap gap-4">
            {leftLinks.map((link) => (
              <li key={link.label}>
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Dot className="size-3" />
            {copyrightText}
          </p>
        </div>

        <div className="space-y-4 md:text-right">
          <ul className="flex flex-wrap gap-4 md:justify-end">
            {rightLinks.map((link) => (
              <li key={link.label}>
                {link.external ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          <button
            onClick={scrollToTop}
            className="inline-flex items-center gap-1 text-sm text-foreground transition-opacity hover:opacity-80"
          >
            Back to top <ArrowUpRight className="size-4" />
          </button>
        </div>
      </div>

      <div aria-hidden="true" style={{ overflow: 'hidden', height: 160 }}>
        <div>
          {Array.from({ length: barCount }).map((_, index) => (
            <div
              key={index}
              ref={(el) => {
                waveRefs.current[index] = el;
              }}
              className="wave-segment"
              style={{
                height: `${index + 1}px`,
                backgroundColor: 'hsl(var(--foreground))',
                opacity: 0.85,
                transition: 'transform 0.1s ease',
                willChange: 'transform',
                marginTop: '-2px'
              }}
            />
          ))}
        </div>
      </div>
    </footer>
  );
}
