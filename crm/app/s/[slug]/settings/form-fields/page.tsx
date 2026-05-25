import { redirect } from 'next/navigation';

/**
 * Backwards-compatibility redirect: the form builder has moved
 * from Settings > Form Fields to its own top-level Intake Form section.
 */
export default async function FormFieldsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/intake/customize`);
}
