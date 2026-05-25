'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Bell, CalendarClock, CircleDot, Gauge, UserRound } from 'lucide-react';

const applications = [
  {
    name: 'Jordan Reyes',
    submittedAt: 'Submitted · Today, 9:12 AM',
    score: 92,
    status: 'High priority',
    icon: <Gauge className="w-4 h-4" />
  },
  {
    name: 'Maya Thompson',
    submittedAt: 'Submitted · Today, 8:44 AM',
    score: 81,
    status: 'Reviewing',
    icon: <CalendarClock className="w-4 h-4" />
  },
  {
    name: 'Ethan Cole',
    submittedAt: 'Submitted · Yesterday, 6:28 PM',
    score: 76,
    status: 'Qualified',
    icon: <Bell className="w-4 h-4" />
  },
  {
    name: 'Ava Martinez',
    submittedAt: 'Submitted · Yesterday, 3:09 PM',
    score: 68,
    status: 'Needs follow-up',
    icon: <CircleDot className="w-4 h-4" />
  },
  {
    name: 'Noah Bennett',
    submittedAt: 'Submitted · Jun 12, 11:31 AM',
    score: 55,
    status: 'Warm lead',
    icon: <UserRound className="w-4 h-4" />
  }
];

export default function FeatureSection() {
  return (
    <section className="relative w-full py-20 px-6 border-t border-border bg-background text-foreground">
      <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 items-center gap-12">
        <div className="relative w-full max-w-md">
          <Card className="overflow-hidden bg-card shadow-xl rounded-xl border-border/70">
            <CardContent className="relative h-[320px] p-0 overflow-hidden">
              <div className="relative h-full overflow-hidden">
                <motion.div
                  className="flex flex-col gap-0 absolute w-full"
                  animate={{ y: ['0%', '-50%'] }}
                  transition={{
                    repeat: Infinity,
                    repeatType: 'loop',
                    duration: 14,
                    ease: 'linear'
                  }}
                >
                  {[...applications, ...applications].map((app, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-3 border-b border-border/70"
                    >
                      <div className="flex items-center justify-between flex-1 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="bg-primary/10 text-primary w-10 h-10 rounded-xl shadow-sm flex items-center justify-center">
                            {app.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{app.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{app.submittedAt}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-primary">Score {app.score}</p>
                          <p className="text-xs text-muted-foreground">{app.status}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>

                <div className="absolute top-0 left-0 w-full h-12 bg-gradient-to-b from-card via-card/85 to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-card via-card/85 to-transparent pointer-events-none" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Badge variant="secondary" className="px-3 py-1 text-sm">
            New application activity
          </Badge>
          <h3 className="text-xl md:text-2xl font-semibold leading-relaxed text-foreground">
            See incoming renter applications update in real time — with context, timing, and a practical score your team can act on immediately.
          </h3>

          <div className="flex gap-3 flex-wrap">
            <Badge className="px-4 py-2 text-sm">Live intake feed</Badge>
            <Badge className="px-4 py-2 text-sm">Explainable scoring</Badge>
            <Badge className="px-4 py-2 text-sm">Faster follow-up</Badge>
          </div>
        </div>
      </div>
    </section>
  );
}
