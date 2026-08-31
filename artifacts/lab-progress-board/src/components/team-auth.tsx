import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ClerkProvider, SignIn, UserButton, useAuth, useOrganizationList, useUser } from '@clerk/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { clearProtectedCache, accountCacheKey } from '../lib/session-cache';

type Team = { isAdmin: boolean; userId: string; orgId: string };
const TeamContext = createContext<Team>({ isAdmin: false, userId: '', orgId: '' });
export const useTeam = () => useContext(TeamContext);

export function TeamUser() {
  const { user } = useUser();
  const { isAdmin } = useTeam();
  return <><UserButton /><div className="min-w-0"><div className="truncate text-xs font-semibold">{user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Team member'}</div><div className="text-[10px] text-muted-foreground">{isAdmin ? 'Team admin' : 'Team member'}</div></div></>;
}

function OrganizationChoice() {
  const { isLoaded, userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });
  return <div className="mt-4 space-y-2"><p>Select your invited Tori organization.</p>
    {isLoaded && userMemberships.data?.map(({ organization }) => <button className="block rounded border px-4 py-2" key={organization.id} onClick={() => void setActive?.({ organization: organization.id })}>{organization.name}</button>)}
    {userMemberships.hasNextPage && <button onClick={() => void userMemberships.fetchNext()}>More organizations</button>}
    {isLoaded && !userMemberships.data?.length && <p>Ask the team owner for an organization invitation.</p>}
    <UserButton />
  </div>;
}

function TeamGate({ children }: { children: ReactNode }) {
  const session = useQuery({ queryKey: ['team-session'], queryFn: async ({ signal }): Promise<Team> => {
    const response = await fetch('/api/session', { signal, headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Team access could not be verified.');
    return data;
  }, retry: false });
  if (session.isPending) return <p className="p-8">Checking team access…</p>;
  if (session.isError) return <div className="p-8" role="alert"><p>{session.error.message}</p><OrganizationChoice /><button className="mt-4 underline" onClick={() => void session.refetch()}>Check access again</button></div>;
  return <TeamContext.Provider value={session.data}>{children}</TeamContext.Provider>;
}

// A different user/session/organization mounts an entirely new client before any board renders.
// Cancel and clear the old client as well, so in-flight responses cannot repopulate shared caches.
export function AccountCache({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => () => clearProtectedCache(client), [client]);
  return <QueryClientProvider client={client}><TeamGate>{children}</TeamGate></QueryClientProvider>;
}

function SignedInTeam({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, sessionId, orgId, orgRole } = useAuth();
  if (!isLoaded) return <p className="p-8">Loading sign-in…</p>;
  if (!isSignedIn) return <div className="grid min-h-screen place-items-center"><SignIn routing="hash" /></div>;
  if (!orgId) return <div className="p-8"><OrganizationChoice /></div>;
  return <AccountCache key={accountCacheKey(userId, sessionId, orgId, orgRole)}>{children}</AccountCache>;
}

export function TeamAuth({ children }: { children: ReactNode }) {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) return <p className="p-8" role="alert">Team sign-in is not configured. Set VITE_CLERK_PUBLISHABLE_KEY and restart the frontend.</p>;
  return <ClerkProvider publishableKey={publishableKey}><SignedInTeam>{children}</SignedInTeam></ClerkProvider>;
}
