import Cookies from 'js-cookie';

// Returns the logged-in user, or null if not logged in.
export async function getUser() {
  if (import.meta.env.DEV) return { name: 'Local Dev User', email: 'dev@local' };
  try {
    const res = await fetch('/auth/userinfo');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const login = () => { window.location.href = '/auth/login'; };

export const logout = () => {
  window.location.href = `/auth/logout?session_hint=${Cookies.get('session_hint')}`;
};
