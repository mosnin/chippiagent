import { supabase } from '@/lib/supabase';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { AuditLogClient } from './audit-log-client';

export default async function AuditLogPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  // Fetch audit logs and users in parallel
  const [logsRes, usersRes] = await Promise.all([
    supabase
      .from('AuditLog')
      .select('*')
      .order('createdAt', { ascending: false })
      .limit(200),
    supabase.from('User').select('clerkId, name, email'),
  ]);

  const logs = (logsRes.data ?? []) as {
    id: string;
    clerkId: string | null;
    ipAddress: string | null;
    action: string;
    resource: string;
    resourceId: string | null;
    spaceId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }[];

  // Build a clerkId -> { name, email } map
  const userMap: Record<string, { name: string | null; email: string }> = {};
  for (const u of usersRes.data ?? []) {
    const user = u as { clerkId: string; name: string | null; email: string };
    userMap[user.clerkId] = { name: user.name, email: user.email };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Platform-wide activity log for SOC 2 compliance
        </p>
      </div>
      <AuditLogClient logs={logs} userMap={userMap} />
    </div>
  );
}
