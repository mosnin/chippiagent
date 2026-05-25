import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Building2, AlertTriangle } from 'lucide-react';
import { JoinCodeAcceptButton } from './join-code-accept-button';

type Params = { params: Promise<{ code: string }> };

export default async function JoinWithCodePage({ params }: Params) {
  const { code } = await params;

  const { userId } = await auth();
  if (!userId) {
    redirect(`/login/realtor?redirect_url=/join/${code}`);
  }

  const normalizedCode = code.trim().toUpperCase();

  const { data: brokerage } = await supabase
    .from('Brokerage')
    .select('id, name, status, logoUrl')
    .eq('joinCode', normalizedCode)
    .maybeSingle();

  const isInvalid = !brokerage;
  const isSuspended = brokerage?.status === 'suspended';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="bg-foreground px-6 py-5">
            <div className="flex items-center gap-2.5">
              {brokerage?.logoUrl ? (
                <img src={brokerage.logoUrl} alt="" className="h-6 max-w-[80px] object-contain rounded" />
              ) : (
                <Building2 size={20} className="text-background/70" />
              )}
              <p className="text-background font-semibold text-base">
                {brokerage?.name ?? 'Chippi'}
              </p>
            </div>
            <p className="mt-1 text-background/60 text-sm">Brokerage invite code</p>
          </div>

          <div className="px-6 py-6 space-y-4">
            {isInvalid ? (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <p className="text-sm">This invite code is invalid or has been revoked. Ask your broker for a new one.</p>
              </div>
            ) : isSuspended ? (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <p className="text-sm">This brokerage is currently suspended and not accepting new members.</p>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm text-foreground leading-relaxed">
                    You&apos;ve been invited to join{' '}
                    <span className="font-semibold">{brokerage.name}</span> as a{' '}
                    <span className="font-semibold">Realtor Member</span>.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    You&apos;ll keep your own workspace, leads, and pipeline — this just adds you to the brokerage network.
                  </p>
                </div>
                <JoinCodeAcceptButton code={normalizedCode} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
