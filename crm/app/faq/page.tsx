'use client';

import Link from 'next/link';
import { ArrowRight, MessageCircle, Zap } from 'lucide-react';
import { Navbar } from '@/components/navbar';
import AnimatedFooter from '@/components/ui/animated-footer';
import ScrollFAQAccordion from '@/components/ui/scroll-faqaccordion';

const faqs = [
  {
    id: 1,
    question: 'What is Chippi?',
    answer:
      'Chippi is a leasing lead workflow built for solo realtors. It helps you capture renter inquiries through a structured intake form, qualify them with AI scoring, and follow up faster from one clear command center.',
  },
  {
    id: 2,
    question: 'Who is Chippi built for?',
    answer:
      'Chippi is designed for solo agents and small teams handling renter and leasing leads who want a cleaner daily workflow without a bloated CRM setup.',
  },
  {
    id: 3,
    question: 'How does the intake link work?',
    answer:
      'You get one intake link that you share in your bio, listing replies, or email signature. Renters fill out a guided form with their budget, move-in date, neighborhood preferences, and household details. Every submission becomes a clean lead record in your dashboard instantly.',
  },
  {
    id: 4,
    question: 'What does AI scoring actually do?',
    answer:
      'AI scoring reviews the submitted context and assigns a priority score to each lead — hot, warm, cold, or unscored. Each score comes with a plain-language summary so you understand why a lead was ranked that way. It\'s assistive, not autopilot.',
  },
  {
    id: 5,
    question: 'Can I understand why a lead was scored a certain way?',
    answer:
      'Yes. Chippi keeps the supporting context visible on every lead record so prioritization is always understandable and actionable. There are no black box scores.',
  },
  {
    id: 6,
    question: 'How fast can I get set up?',
    answer:
      'Most agents can get their intake link live in minutes and start collecting structured renter data the same day. No configuration or complex onboarding required.',
  },
  {
    id: 7,
    question: 'What happens after a renter submits the intake form?',
    answer:
      'You immediately get a lead record with all the qualification details, an AI priority score, status visibility, and clear next actions for follow-up. The renter receives a confirmation that their inquiry was received.',
  },
  {
    id: 8,
    question: 'Do I need to replace my current CRM?',
    answer:
      'No. Many agents start Chippi as a leasing command center first, then decide what to keep or consolidate. Chippi is focused on leasing leads — it\'s not trying to be a bloated all-in-one tool.',
  },
  {
    id: 9,
    question: 'Does Chippi include a full CRM?',
    answer:
      'Yes. Beyond the intake and scoring workflow, Chippi includes full contact management with activity logs, email history, deal tracking, and follow-up scheduling.',
  },
  {
    id: 10,
    question: 'Can I track deals and pipeline stages?',
    answer:
      'Yes. Chippi has a kanban-style deal pipeline with customizable stages, deal values, close dates, and full activity tracking per deal. You can link deals directly to contact records.',
  },
  {
    id: 11,
    question: 'Is there analytics built in?',
    answer:
      'Yes. The analytics dashboard shows lead volume trends, qualification rates, conversion ratios, pipeline distribution, and average time-to-follow-up — all in one view.',
  },
  {
    id: 12,
    question: 'How much does Chippi cost?',
    answer:
      'Chippi is $97 per month, all features included. There are no tiers, no feature gates, and no usage limits. Every new account starts with a 7-day free trial — no credit card required.',
  },
  {
    id: 13,
    question: 'Is there a free trial?',
    answer:
      'Yes. Every account starts with a 7-day free trial so you can test the full workflow before paying. No credit card required to sign up.',
  },
  {
    id: 14,
    question: 'Can I cancel any time?',
    answer:
      'Yes. You can cancel your subscription at any time from your account settings. No lock-in period, no cancellation fees.',
  },
  {
    id: 15,
    question: 'What happens to my data if I cancel?',
    answer:
      'Your data is retained for 30 days after cancellation in case you want to reactivate. After that period it is permanently deleted from our systems.',
  },
];

const categories = [
  { label: 'Product', ids: [1, 2, 3, 4, 5] },
  { label: 'Features', ids: [6, 7, 8, 9, 10, 11] },
  { label: 'Pricing & billing', ids: [12, 13, 14, 15] },
];

export default function FAQPage() {
  return (
    <div className="min-h-svh w-full bg-background text-foreground">
      <Navbar />
      <main className="relative overflow-x-hidden">
        {/* Hero glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(20,184,166,0.1),transparent_70%)]" />

        {/* Page hero */}
        <section className="px-6 pt-36 pb-16 text-center">
          <div className="mx-auto max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
              <MessageCircle size={12} />
              Common questions
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]">
              Frequently asked questions
            </h1>
            <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
              Everything you need to know about Chippi — how it works, what&apos;s included, and how to get started.
            </p>
          </div>
        </section>

        {/* Category quick links */}
        <section className="px-6 pb-6">
          <div className="max-w-3xl mx-auto flex items-center justify-center gap-3 flex-wrap">
            {categories.map((cat) => (
              <span
                key={cat.label}
                className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {cat.label}
              </span>
            ))}
          </div>
        </section>

        {/* Full FAQ accordion */}
        <section className="px-6 py-12 border-t border-border">
          <ScrollFAQAccordion
            className="py-0"
            data={faqs}
          />
        </section>

        {/* Still have questions */}
        <section className="px-6 py-16 border-t border-border">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-border bg-card p-8 md:p-10 text-center">
              <h2 className="text-2xl font-semibold tracking-tight">Still have questions?</h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                Explore the features page for a detailed breakdown of what Chippi includes, or start your free trial and explore it hands-on.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/features"
                  className="inline-flex items-center gap-2 border border-border bg-background px-6 py-2.5 rounded-full text-sm font-medium hover:bg-muted transition-colors"
                >
                  View features <ArrowRight size={14} />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 border border-border bg-background px-6 py-2.5 rounded-full text-sm font-medium hover:bg-muted transition-colors"
                >
                  See pricing <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-6 border-t border-border">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
              <Zap size={12} />
              7-day free trial — no card required
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
              Ready to try it?
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              Get your intake link live in minutes. No credit card needed.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                Start free trial <ArrowRight size={16} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 border border-border px-8 py-3.5 rounded-full font-medium hover:bg-card transition-colors"
              >
                View pricing <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        <AnimatedFooter
          leftLinks={[
            { href: '/features', label: 'Features' },
            { href: '/pricing', label: 'Pricing' },
            { href: '/faq', label: 'FAQ' },
            { href: '/sign-up', label: 'Get started' },
          ]}
          rightLinks={[
            { href: '/legal/privacy', label: 'Privacy' },
            { href: '/legal/terms', label: 'Terms' },
            { href: '/legal/cookies', label: 'Cookies' },
            { href: '/login/realtor', label: 'Log in' },
          ]}
          copyrightText={`© ${new Date().getFullYear()} Chippi. Leasing workflow clarity for modern realtors.`}
        />
      </main>
    </div>
  );
}
