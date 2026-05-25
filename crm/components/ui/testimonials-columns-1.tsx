"use client";

import React from "react";
import { motion } from "motion/react";

const testimonials = [
  {
    text: "Chippi helped me stop guessing. I can see qualified renter leads first and follow up with confidence.",
    image:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&crop=faces",
    name: "Sofia Bennett",
    role: "Leasing Agent",
  },
  {
    text: "The intake form made my workflow cleaner overnight. Every application arrives with usable context.",
    image:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop&crop=faces",
    name: "Marcus Hill",
    role: "Independent Realtor",
  },
  {
    text: "I finally have one place to review budgets, move-in dates, and score signals before calling.",
    image:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop&crop=faces",
    name: "Elena Brooks",
    role: "Rental Specialist",
  },
  {
    text: "The scoring summaries are practical. I can quickly decide who needs priority follow-up each morning.",
    image:
      "https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=120&h=120&fit=crop&crop=faces",
    name: "Daniel Carter",
    role: "Broker Associate",
  },
  {
    text: "Chippi gives me a polished intake flow that clients trust, and it saves me hours every week.",
    image:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&crop=faces",
    name: "Priya Shah",
    role: "Solo Agent",
  },
  {
    text: "I used to juggle DMs and notes. Now I open one dashboard and know exactly where to start.",
    image:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=faces",
    name: "Noah Reed",
    role: "Leasing Consultant",
  },
  {
    text: "Our response times improved because applications are structured and easy to triage.",
    image:
      "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=120&h=120&fit=crop&crop=faces",
    name: "Avery Collins",
    role: "Operations Lead",
  },
  {
    text: "The product is simple in the best way. My team adopted it in a day and kept using it.",
    image:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=faces",
    name: "Ryan Foster",
    role: "Team Lead",
  },
  {
    text: "I can see high-intent applications faster and close rentals with less back-and-forth.",
    image:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&crop=faces",
    name: "Mia Alvarez",
    role: "Property Advisor",
  },
];

export const TestimonialsColumn = (props: {
  className?: string;
  testimonials: typeof testimonials;
  duration?: number;
}) => {
  return (
    <div className={props.className}>
      <motion.div
        animate={{
          translateY: "-50%",
        }}
        transition={{
          duration: props.duration || 10,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex flex-col gap-6 pb-6 bg-background"
      >
        {[
          ...new Array(2).fill(0).map((_, index) => (
            <React.Fragment key={index}>
              {props.testimonials.map(({ text, image, name, role }, i) => (
                <div
                  className="p-10 rounded-3xl border border-border bg-card text-card-foreground shadow-lg shadow-primary/10 max-w-xs w-full"
                  key={i}
                >
                  <div className="text-sm leading-relaxed text-muted-foreground">{text}</div>
                  <div className="flex items-center gap-2 mt-5">
                    <img
                      width={40}
                      height={40}
                      src={image}
                      alt={name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <div className="flex flex-col">
                      <div className="font-medium tracking-tight leading-5 text-foreground">{name}</div>
                      <div className="leading-5 text-muted-foreground tracking-tight text-sm">{role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </React.Fragment>
          )),
        ]}
      </motion.div>
    </div>
  );
};

const firstColumn = testimonials.slice(0, 3);
const secondColumn = testimonials.slice(3, 6);
const thirdColumn = testimonials.slice(6, 9);

const Testimonials = () => {
  return (
    <section className="bg-background my-20 relative" id="testimonials">
      <div className="container z-10 mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="flex flex-col items-center justify-center max-w-[540px] mx-auto"
        >
          <div className="flex justify-center">
            <div className="border border-border py-1 px-4 rounded-lg text-sm bg-card">Testimonials</div>
          </div>

          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-semibold tracking-tight mt-5 text-foreground text-center">
            Trusted by agents managing renter applications daily
          </h2>
          <p className="text-center mt-5 text-muted-foreground">
            Real feedback from teams using Chippi to qualify, score, and follow up faster.
          </p>
        </motion.div>

        <div className="flex justify-center gap-6 mt-10 [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)] max-h-[740px] overflow-hidden">
          <TestimonialsColumn testimonials={firstColumn} duration={15} />
          <TestimonialsColumn testimonials={secondColumn} className="hidden md:block" duration={19} />
          <TestimonialsColumn testimonials={thirdColumn} className="hidden lg:block" duration={17} />
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
