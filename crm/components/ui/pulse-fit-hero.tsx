import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';

interface NavigationItem {
  label: string;
  hasDropdown?: boolean;
  onClick?: () => void;
}

interface ProgramCard {
  image: string;
  category: string;
  title: string;
  onClick?: () => void;
}

interface PulseFitHeroProps {
  logo?: string;
  navigation?: NavigationItem[];
  ctaButton?: {
    label: string;
    onClick: () => void;
  };
  title: string;
  subtitle: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  disclaimer?: string;
  socialProof?: {
    avatars: string[];
    text: string;
  };
  programs?: ProgramCard[];
  className?: string;
  children?: React.ReactNode;
  showHeader?: boolean;
}

export function PulseFitHero({
  logo = 'Chippi',
  navigation = [
    { label: 'Problem' },
    { label: 'Solution' },
    { label: 'How it works' },
    { label: 'Pricing' },
    { label: 'FAQ' }
  ],
  ctaButton,
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  disclaimer,
  socialProof,
  programs = [],
  className,
  children,
  showHeader = true
}: PulseFitHeroProps) {
  return (
    <section
      className={cn('relative w-full min-h-screen flex flex-col overflow-hidden', className)}
      style={{
        background:
          'linear-gradient(180deg, hsl(var(--primary)/0.09) 0%, hsl(var(--background)) 58%, hsl(var(--background)) 100%)'
      }}
      role="banner"
      aria-label="Hero section"
    >
      {showHeader && (
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-20 flex flex-row justify-between items-center px-6 lg:px-10 py-8"
      >
        <div className="flex items-center" aria-label={logo}>
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        <nav className="hidden lg:flex flex-row items-center gap-7" aria-label="Main navigation">
          {navigation.map((item, index) => (
            <button
              key={index}
              onClick={item.onClick}
              className="flex flex-row items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.label}
              {item.hasDropdown && <ChevronDown size={15} />}
            </button>
          ))}
        </nav>

        {ctaButton && (
          <button
            onClick={ctaButton.onClick}
            className="px-5 py-2.5 rounded-full border border-border bg-background text-foreground text-sm font-semibold hover:bg-muted transition-colors"
          >
            {ctaButton.label}
          </button>
        )}
      </motion.header>

      )}

      {children ? (
        <div className="relative z-10 flex-1 flex items-center justify-center w-full">{children}</div>
      ) : (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pt-28 md:pt-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col items-center text-center max-w-4xl gap-8"
          >
            <h1 className="font-title font-bold text-4xl md:text-6xl tracking-tight leading-[1.05] text-foreground">
              {title}
            </h1>

            <p className="text-lg md:text-xl leading-relaxed text-muted-foreground max-w-2xl">{subtitle}</p>

            {(primaryAction || secondaryAction) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="flex flex-col sm:flex-row items-center gap-4"
              >
                {primaryAction && (
                  <button
                    onClick={primaryAction.onClick}
                    className="flex flex-row items-center gap-2 px-8 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
                  >
                    {primaryAction.label}
                    <ArrowRight size={18} />
                  </button>
                )}

                {secondaryAction && (
                  <button
                    onClick={secondaryAction.onClick}
                    className="px-8 py-3.5 rounded-full border border-border text-foreground font-medium hover:bg-card transition-colors"
                  >
                    {secondaryAction.label}
                  </button>
                )}
              </motion.div>
            )}

            {disclaimer && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="text-xs text-muted-foreground italic"
              >
                {disclaimer}
              </motion.p>
            )}

            {socialProof && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.7 }}
                className="flex flex-row items-center gap-3"
              >
                <div className="flex flex-row -space-x-2">
                  {socialProof.avatars.map((avatar, index) => (
                    <img
                      key={index}
                      src={avatar}
                      alt={`User ${index + 1}`}
                      className="rounded-full border-2 border-background w-10 h-10 object-cover"
                      style={{ zIndex: socialProof.avatars.length - index }}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-muted-foreground">{socialProof.text}</span>
              </motion.div>
            )}
          </motion.div>
        </div>
      )}

      {programs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="relative z-10 w-full overflow-hidden pt-14 pb-14"
        >
          <div className="absolute left-0 top-0 bottom-0 z-10 pointer-events-none w-24 bg-gradient-to-r from-background to-transparent" />
          <div className="absolute right-0 top-0 bottom-0 z-10 pointer-events-none w-24 bg-gradient-to-l from-background to-transparent" />

          <motion.div
            className="flex items-center gap-6 pl-6"
            animate={{
              x: [0, -((programs.length * 380) / 2)]
            }}
            transition={{
              x: {
                repeat: Infinity,
                repeatType: 'loop',
                duration: programs.length * 3,
                ease: 'linear'
              }
            }}
          >
            {[...programs, ...programs].map((program, index) => (
              <motion.div
                key={index}
                whileHover={{ scale: 1.04, y: -8 }}
                transition={{ duration: 0.3 }}
                onClick={program.onClick}
                className="flex-shrink-0 cursor-pointer relative overflow-hidden rounded-3xl border border-border/40 shadow-xl"
                style={{ width: '356px', height: '460px' }}
              >
                <img src={program.image} alt={program.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/70" />
                <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">
                    {program.category}
                  </span>
                  <h3 className="text-2xl font-semibold text-white leading-tight">{program.title}</h3>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      )}
    </section>
  );
}
