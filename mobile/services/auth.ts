import { apiRequest } from './api';

export type UserRole = 'CUSTOMER' | 'GUARD' | 'SALESMAN';
export type AuthUser = { id: string; name: string; email: string; role: UserRole; shopId?: string };
export type AuthSession = { token: string; user: AuthUser };

export const authApi = {
  register(name: string, email: string, password: string) {
    return apiRequest<AuthSession>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  },
  login(email: string, password: string) {
    return apiRequest<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  me(token: string) {
    return apiRequest<{ user: AuthUser }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  logout(token: string) {
    return apiRequest<void>('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  },
  checkPortal(token: string, role: UserRole) {
    const route = role === 'CUSTOMER' ? 'customer' : role === 'GUARD' ? 'guard' : 'admin';
    return apiRequest<{ portal: UserRole; userId: string }>(`/api/portals/${route}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};
