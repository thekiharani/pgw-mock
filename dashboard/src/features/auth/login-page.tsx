import { useNavigate } from '@tanstack/react-router';
import { KeyRound, Loader2, Mail } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient, signIn } from '@/lib/auth-client';

export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    const { error } = await signIn.social({ provider: 'google', callbackURL: '/merchants' });
    if (error) {
      toast.error(error.message ?? 'Google sign-in is unavailable');
      setLoading(false);
    }
  }

  async function handleSendOtp(event: React.FormEvent) {
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

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const { error } = await signIn.emailOtp({ email, otp });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? 'Invalid code');
      return;
    }
    navigate({ to: '/merchants' });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Noria Payments Console</CardTitle>
          <CardDescription>Sign in to manage merchants and credentials</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button variant="outline" onClick={handleGoogle} disabled={loading}>
            <GoogleIcon />
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          {step === 'email' ? (
            <form className="flex flex-col gap-3" onSubmit={handleSendOtp}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" />
                )}
                Email me a code
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={handleVerify}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="otp">Verification code</Label>
                <Input
                  id="otp"
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
                Verify &amp; sign in
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('email')}
                disabled={loading}
              >
                Use a different email
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
