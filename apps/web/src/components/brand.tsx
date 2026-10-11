import Link from 'next/link';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8', className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M9 22.5c0-4 3-5.5 7-5.5s7-1.5 7-5.5"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        className="stroke-primary-foreground"
      />
      <circle cx="9" cy="22.5" r="2.4" className="fill-primary-foreground" />
      <circle cx="23" cy="11.5" r="2.4" className="fill-primary-foreground" />
    </svg>
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}
    >
      <LogoMark className="size-7" />
      <span>
        GenPath <span className="text-primary">AI</span>
      </span>
    </Link>
  );
}
