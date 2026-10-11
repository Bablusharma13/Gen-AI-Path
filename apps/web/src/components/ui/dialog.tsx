'use client';

import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  side,
  ...props
}: ComponentProps<typeof D.Content> & { side?: 'left' | 'right' }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
      <D.Content
        className={cn(
          'fixed z-50 border bg-popover text-popover-foreground shadow-lg focus:outline-none',
          side
            ? cn(
                'inset-y-0 w-[min(20rem,85vw)] p-4',
                side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
              )
            : 'left-1/2 top-1/2 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl p-6',
          className,
        )}
        {...props}
      >
        {children}
        <D.Close
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

export function DialogHeader({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-4 space-y-1 pr-6">
      <D.Title className="text-lg font-semibold">{title}</D.Title>
      {description ? (
        <D.Description className="text-sm text-muted-foreground">{description}</D.Description>
      ) : (
        <D.Description className="sr-only">{title}</D.Description>
      )}
    </div>
  );
}
