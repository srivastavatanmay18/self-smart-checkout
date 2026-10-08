import type { UserRole } from '@/services/auth';

export function portalPath(role: UserRole): '/customer' | '/guard' | '/admin' {
  switch (role) {
    case 'CUSTOMER': return '/customer';
    case 'GUARD': return '/guard';
    case 'SALESMAN': return '/admin';
  }
}
