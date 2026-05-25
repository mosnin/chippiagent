import { requireAdmin } from '@/lib/admin';
import { AdminShell } from './components/admin-shell';

export const metadata = { title: 'Admin — Chippi' };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side admin check — redundant with middleware but defense in depth
  await requireAdmin();

  return <AdminShell>{children}</AdminShell>;
}
