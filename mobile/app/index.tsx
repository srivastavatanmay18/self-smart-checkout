import { Redirect } from 'expo-router';
import { AuthLoading } from '@/components/AuthLoading';
import { useAuth } from '@/auth/AuthContext';
import { portalPath } from '@/auth/routes';

export default function IndexRoute() {
  const { isLoading, session } = useAuth();
  if (isLoading) return <AuthLoading />;
  return <Redirect href={session ? portalPath(session.user.role) : '/login'} />;
}
