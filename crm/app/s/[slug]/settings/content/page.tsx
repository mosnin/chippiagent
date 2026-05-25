import { redirect } from 'next/navigation';

export default async function ContentSettingsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/intake/customize`);
}
