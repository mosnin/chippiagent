'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedGroup } from '@/components/ui/animated-group';
import { Navbar1 } from '@/components/ui/navbar-1';
import type { Variants } from 'framer-motion';

const transitionVariants: { item: Variants } = {
  item: {
    hidden: {
      opacity: 0,
      filter: 'blur(12px)',
      y: 12,
    },
    visible: {
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: {
        type: 'spring',
        bounce: 0.3,
        duration: 1.5,
      },
    },
  },
};

export function HeroSection() {
  return (
    <>
      <Navbar1 />
      <main className="overflow-hidden">
        {/* Subtle golden side glows */}
        <div
          aria-hidden
          className="z-[2] absolute inset-0 pointer-events-none isolate opacity-40 contain-strict hidden lg:block">
          <div className="w-[35rem] h-[80rem] -translate-y-[350px] absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(43,100%,60%,.07)_0,hsla(43,100%,60%,.02)_50%,transparent_80%)]" />
          <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(43,100%,60%,.05)_0,transparent_100%)] [translate:5%_-50%]" />
        </div>

        <section>
          <div className="relative pt-28 md:pt-40">
            {/* Radial fade at bottom */}
            <div
              aria-hidden
              className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,var(--background)_75%)]"
            />

            <div className="mx-auto max-w-7xl px-6">
              <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                <AnimatedGroup variants={transitionVariants}>
                  {/* Announcement pill */}
                  <Link
                    href="/features"
                    className="hover:bg-muted group mx-auto flex w-fit items-center gap-4 rounded-full border border-border bg-background p-1 pl-4 shadow-sm transition-all duration-300">
                    <span className="text-foreground text-sm">
                      Introducing AI-powered lead scoring &amp; prioritization
                    </span>
                    <span className="block h-4 w-0.5 border-l border-border bg-amber-200" />
                    <div className="bg-muted group-hover:bg-background size-6 overflow-hidden rounded-full duration-500">
                      <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3" />
                        </span>
                      </div>
                    </div>
                  </Link>

                  <h1 className="font-title mt-8 max-w-4xl mx-auto text-balance text-6xl md:text-7xl lg:mt-16 xl:text-[5.25rem] text-foreground">
                    Qualify leasing leads without the chaos
                  </h1>
                  <p className="mx-auto mt-8 max-w-2xl text-balance text-lg text-muted-foreground">
                    One intake link. Structured qualification. Practical AI
                    scoring. Follow up faster from one clean workflow.
                  </p>
                </AnimatedGroup>

                {/* CTA buttons */}
                <AnimatedGroup
                  variants={{
                    container: {
                      visible: {
                        transition: {
                          staggerChildren: 0.05,
                          delayChildren: 0.75,
                        },
                      },
                    },
                    ...transitionVariants,
                  }}
                  className="mt-12 flex flex-col items-center justify-center gap-2 md:flex-row">
                  <div className="bg-foreground/10 rounded-[14px] border border-border p-0.5">
                    <Button asChild size="lg" className="rounded-xl px-5 text-base">
                      <Link href="/sign-up">
                        <span className="text-nowrap">Start free trial</span>
                      </Link>
                    </Button>
                  </div>
                  <Button asChild size="lg" variant="ghost" className="rounded-xl px-5">
                    <Link href="/features">
                      <span className="text-nowrap">Explore features</span>
                    </Link>
                  </Button>
                </AnimatedGroup>

                <p className="mt-3 text-xs text-muted-foreground">
                  *7-day free trial · No credit card required
                </p>
              </div>
            </div>

            {/* App screenshot */}
            <AnimatedGroup
              variants={{
                container: {
                  visible: {
                    transition: {
                      staggerChildren: 0.05,
                      delayChildren: 0.75,
                    },
                  },
                },
                ...transitionVariants,
              }}>
              <div className="relative -mr-56 mt-8 overflow-hidden px-2 sm:mr-0 sm:mt-12 md:mt-20">
                <div
                  aria-hidden
                  className="bg-gradient-to-b to-background absolute inset-0 z-10 from-transparent from-35%"
                />
                <div className="ring-background bg-background relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-border p-4 shadow-lg shadow-amber-900/10 ring-1">
                  <img
                    className="bg-background aspect-15/8 relative hidden rounded-2xl dark:block"
                    src="https://tailark.com//_next/image?url=%2Fmail2.png&w=3840&q=75"
                    alt="Chippi workspace dashboard"
                    width="2700"
                    height="1440"
                  />
                  <img
                    className="z-2 border-border/25 aspect-15/8 relative rounded-2xl border dark:hidden"
                    src="https://tailark.com/_next/image?url=%2Fmail2-light.png&w=3840&q=75"
                    alt="Chippi workspace dashboard"
                    width="2700"
                    height="1440"
                  />
                </div>
              </div>
            </AnimatedGroup>
          </div>
        </section>
      </main>
    </>
  );
}
