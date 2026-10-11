'use client';

import { ROLE_LABELS, type PublicUser } from '@genpath/shared';
import { LogOut, Menu, Settings, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState, type ReactNode } from 'react';
import { Logo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useLogout, useMe, useProfile } from '@/lib/auth';
import { applyAccessibility, useUpdatePreferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';
import { isActive, NAV_ITEMS } from './nav';

function NavLinks({ user, onNavigate }: { user: PublicUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <item.icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function UserMenu({ user }: { user: PublicUser }) {
  const router = useRouter();
  const logout = useLogout();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block text-sm font-medium text-foreground">{user.name}</span>
          <span className="block truncate">{user.email}</span>
          <span className="block">{ROLE_LABELS[user.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=profile">
            <UserRound aria-hidden /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
        >
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Applies stored preferences (theme, font scale, reduced motion) once the profile loads. */
function PreferencesSync() {
  const profile = useProfile();
  const { setTheme } = useTheme();
  const prefs = profile.data?.preferences;
  useEffect(() => {
    if (!prefs) return;
    setTheme(prefs.theme);
    applyAccessibility(prefs);
  }, [prefs, setTheme]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const updatePrefs = useUpdatePreferences();
  const user = me.data;

  useEffect(() => {
    if (me.isPending || me.isError) return;
    if (user === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (user && !user.onboardingCompleted) router.replace('/onboarding');
  }, [me.isPending, me.isError, user, pathname, router]);

  if (me.isError) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <ErrorState message="We could not load your account." onRetry={() => void me.refetch()} />
      </div>
    );
  }
  if (!user || !user.onboardingCompleted) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-64 border-r p-4 lg:block">
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <PreferencesSync />
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card/40 lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo href="/dashboard" />
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-2">
          <NavLinks user={user} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent side="left">
              <DialogHeader title={<Logo href="/dashboard" />} />
              <nav aria-label="Primary">
                <NavLinks user={user} onNavigate={() => setMobileOpen(false)} />
              </nav>
            </DialogContent>
          </Dialog>
          <div className="lg:hidden">
            <Logo href="/dashboard" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle onChange={(theme) => updatePrefs.mutate({ theme })} />
            <UserMenu user={user} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
