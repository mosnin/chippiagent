"use client";

import * as React from "react";
import { motion } from "framer-motion";
import * as Accordion from "@radix-ui/react-accordion";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  icon?: string;
  iconPosition?: "left" | "right";
}

interface ScrollFAQAccordionProps {
  data?: FAQItem[];
  className?: string;
  questionClassName?: string;
  answerClassName?: string;
}

export default function ScrollFAQAccordion({
  data = [
    {
      id: 1,
      question: "What is Chippi?",
      answer:
        "Chippi is a lightweight leasing lead workflow that helps solo agents capture applications, qualify renters, and follow up faster from one clear command center."
    },
    {
      id: 2,
      question: "How quickly can I get started?",
      answer:
        "Most agents can publish their intake link in minutes and start receiving structured renter applications the same day."
    },
    {
      id: 3,
      question: "How does AI scoring work?",
      answer:
        "Chippi reviews application context and surfaces a practical lead score with summary notes so you can prioritize follow-up with confidence."
    },
    {
      id: 4,
      question: "Can I understand why a lead was scored that way?",
      answer:
        "Yes. Score labels and summaries are visible on records so prioritization remains understandable and actionable."
    },
    {
      id: 5,
      question: "Is this built for solo realtors?",
      answer:
        "Absolutely. Chippi is designed for solo operators and small teams who want cleaner intake and faster day-to-day leasing execution."
    }
  ],
  className,
  questionClassName,
  answerClassName,
}: ScrollFAQAccordionProps) {
  const [openItem, setOpenItem] = React.useState<string | null>(null);

  return (
    <div
      className={cn("max-w-4xl mx-auto text-center py-16", className)}
    >
      <h2 className="text-3xl font-semibold tracking-tight mb-2 text-foreground">
        Frequently Asked Questions
      </h2>
      <p className="text-muted-foreground mb-6">
        Answers to common questions about pricing, setup, and lead scoring workflows.
      </p>

      <Accordion.Root
        type="single"
        collapsible
        value={openItem || ""}
        onValueChange={(value) => setOpenItem(value || null)}
      >
        {data.map((item) => (
          <Accordion.Item value={item.id.toString()} key={item.id} className="mb-6">
            <Accordion.Header>
              <Accordion.Trigger className="flex w-full items-center justify-start gap-x-4 cursor-pointer">
                <div
                  className={cn(
                    "relative flex items-center space-x-2 rounded-xl p-2 transition-colors",
                    openItem === item.id.toString()
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-foreground",
                    questionClassName
                  )}
                >
                  {item.icon && (
                    <span
                      className={cn(
                        "absolute bottom-6",
                        item.iconPosition === "right" ? "right-0" : "left-0"
                      )}
                      style={{
                        transform:
                          item.iconPosition === "right"
                            ? "rotate(7deg)"
                            : "rotate(-4deg)",
                      }}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="font-medium">{item.question}</span>
                </div>

                <span
                  className={cn(
                    "text-muted-foreground",
                    openItem === item.id.toString() && "text-primary"
                  )}
                >
                  {openItem === item.id.toString() ? (
                    <Minus className="h-5 w-5" />
                  ) : (
                    <Plus className="h-5 w-5" />
                  )}
                </span>
              </Accordion.Trigger>
            </Accordion.Header>

            <Accordion.Content asChild forceMount>
              <motion.div
                initial="collapsed"
                animate={openItem === item.id.toString() ? "open" : "collapsed"}
                variants={{
                  open: { opacity: 1, height: "auto" },
                  collapsed: { opacity: 0, height: 0 },
                }}
                transition={{ duration: 0.4 }}
                className="overflow-hidden"
              >
                <div className="flex justify-end ml-7 mt-4 md:ml-16">
                  <div
                    className={cn(
                      "relative max-w-md rounded-2xl px-4 py-2 text-primary-foreground text-lg bg-primary",
                      answerClassName
                    )}
                  >
                    {item.answer}
                  </div>
                </div>
              </motion.div>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </div>
  );
}
