'use server';

import { auth } from '@clerk/nextjs/server';
import { redis } from '@/lib/redis';
import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { getSpaceForUser } from '@/lib/space';

export async function deleteSlugAction(
  prevState: any,
  formData: FormData
) {
  const { userId } = await auth();
  if (!userId) return { error: 'Unauthorized' };

  const slug = formData.get('slug') as string;

  const { data: space, error } = await supabase
    .from('Space')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) return { error: 'Database error' };
  if (!space) return { error: 'Space not found' };

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) return { error: 'Forbidden' };

  await redis.del(`slug:${slug}`).catch(() => null);
  const { error: deleteError } = await supabase.from('Space').delete().eq('slug', slug);
  if (deleteError) return { error: 'Failed to delete space' };
  revalidatePath('/admin');
  return { success: 'Space deleted successfully' };
}
