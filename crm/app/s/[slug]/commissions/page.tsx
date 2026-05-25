import { redirect } from 'next/navigation';

export default async function CommissionsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/properties/commissions`);
}
