import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { BrokerageMcpSection } from '../mcp-section';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'MCP — Broker Settings' };

export default async function BrokerSettingsMcpPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage, membership } = ctx;
  const canEdit = membership.role === 'broker_owner' || membership.role === 'broker_admin';

  if (!canEdit) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">MCP</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Brokerage MCP key management
          </p>
        </div>
        <Card>
          <CardContent className="px-5 py-5">
            <p className="text-sm text-muted-foreground">
              Only the brokerage owner or admins can manage MCP keys.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Find the broker owner's space slug for MCP key management
  const { data: ownerSpace } = await supabase
    .from('Space')
    .select('slug')
    .eq('ownerId', brokerage.ownerId)
    .maybeSingle();
  const brokerSpaceSlug = ownerSpace?.slug ?? null;

  if (!brokerSpaceSlug) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">MCP</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect external AI tools to your brokerage data via the Model Context Protocol
          </p>
        </div>
        <Card>
          <CardContent className="px-5 py-5">
            <p className="text-sm text-muted-foreground">
              MCP is not available. The brokerage owner needs a workspace to generate API keys.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">MCP</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Connect external AI tools to your brokerage data via the Model Context Protocol
        </p>
      </div>

      <BrokerageMcpSection slug={brokerSpaceSlug} />
    </div>
  );
}
