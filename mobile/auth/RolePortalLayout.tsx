import { Redirect, Stack } from 'expo-router';
import { AuthLoading } from '@/components/AuthLoading';
import { useAuth } from './AuthContext';
import { portalPath } from './routes';
import type { UserRole } from '@/services/auth';

export function RolePortalLayout({ role }: { role: UserRole }) {
  const { isLoading, session } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (!session) return <Redirect href="/login" />;
  if (session.user.role !== role) return <Redirect href={portalPath(session.user.role)} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
