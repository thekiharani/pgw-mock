import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { CheckCircle2, KeyRound, Loader2, Mail, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { RoleBadge } from '@/components/role-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { authClient, signIn, signOut, useSession } from '@/lib/auth-client';

export function InvitePage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const { data: session, isPending: sessionLoading } = useSession();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Team invitation</CardTitle>
          <CardDescription>Join a merchant on the Noria Payments console</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : session ? (
            <AcceptPanel token={token} sessionEmail={session.user.email} />
          ) : (
            <SignInPanel />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AcceptPanel({ token, sessionEmail }: { token: string; sessionEmail: string }) {
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.getInvitation(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => api.acceptInvitation(token),
    onSuccess: (res) => {
      toast.success('Invitation accepted');
      navigate({ to: '/merchants/$merchantId', params: { merchantId: res.merchantId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-28 w-full" />;

  if (isError) {
    return (
      <Notice
        icon={<ShieldX className="size-8 text-destructive" />}
        title="Can’t open this invitation"
        body={(error as Error).message}
      >
        <p className="text-xs text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{sessionEmail}</span>
        </p>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          Sign in with a different email
        </Button>
      </Notice>
    );
  }

  if (!data) return null;

  if (data.status === 'accepted') {
    return (
      <Notice
        icon={<CheckCircle2 className="size-8 text-success" />}
        title="Already accepted"
        body={`You’re already a collaborator on ${data.merchantName}.`}
      >
        <Button size="sm" onClick={() => navigate({ to: '/merchants' })}>
          Go to console
        </Button>
      </Notice>
    );
  }

  if (data.status === 'revoked' || data.expired) {
    return (
      <Notice
        icon={<ShieldX className="size-8 text-muted-foreground" />}
        title={data.expired ? 'Invitation expired' : 'Invitation revoked'}
        body="Ask whoever invited you to send a new one."
      >
        <Button variant="outline" size="sm" onClick={() => navigate({ to: '/merchants' })}>
          Go to console
        </Button>
      </Notice>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted-foreground">You’ve been invited to join</p>
        <p className="text-lg font-semibold">{data.merchantName}</p>
        <RoleBadge role={data.role} />
      </div>
      <p className="text-xs text-muted-foreground">
        Joining as <span className="font-medium text-foreground">{sessionEmail}</span>
      </p>
      <Button className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
        {accept.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Accept invitation
      </Button>
    </div>
  );
}

function SignInPanel() {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendOtp(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? 'Could not send the code');
      return;
    }
    toast.success(`Code sent to ${email}`);
    setStep('otp');
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    // On success useSession updates and the page swaps to the accept panel.
    const { error } = await signIn.emailOtp({ email, otp });
    setLoading(false);
    if (error) toast.error(error.message ?? 'Invalid code');
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-muted-foreground">
        Sign in with the email your invitation was sent to.
      </p>
      {step === 'email' ? (
        <form className="flex flex-col gap-3" onSubmit={sendOtp}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-signin-email">Email</Label>
            <Input
              id="invite-signin-email"
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
            Email me a code
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={verify}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-signin-otp">Verification code</Label>
            <Input
              id="invite-signin-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Sent to {email}</p>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Verify &amp; continue
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep('email')}>
            Use a different email
          </Button>
        </form>
      )}
    </div>
  );
}

function Notice({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {icon}
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}
