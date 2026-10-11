import type { Role } from '@genpath/shared';
import {
  Bot,
  BookOpen,
  Briefcase,
  ClipboardCheck,
  FlaskConical,
  Hammer,
  LayoutDashboard,
  Library,
  Route,
  Settings,
  Shield,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/path', label: 'Learning Path', icon: Route },
  { href: '/courses', label: 'Courses', icon: BookOpen },
  { href: '/labs', label: 'Interactive Labs', icon: FlaskConical },
  { href: '/mentor', label: 'AI Mentor', icon: Bot },
  { href: '/knowledge', label: 'Knowledge Base', icon: Library },
  { href: '/projects', label: 'Projects', icon: Hammer },
  { href: '/assessments', label: 'Assessments', icon: ClipboardCheck },
  { href: '/career', label: 'Career Center', icon: Briefcase },
  { href: '/settings', label: 'Settings', icon: Settings },
  {
    href: '/admin',
    label: 'Admin',
    icon: Shield,
    roles: ['platform_admin', 'org_admin', 'instructor'],
  },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
