import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  alt?: string;
}

export function BrandLogo({ className, alt = 'Chippi logo' }: BrandLogoProps) {
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <img src="/logo-black.png" alt={alt} width={512} height={171} loading="eager" decoding="async" className="block h-full w-auto dark:hidden" />
      <img src="/logo-white.png" alt={alt} width={512} height={171} loading="eager" decoding="async" className="hidden h-full w-auto dark:block" />
    </span>
  );
}
