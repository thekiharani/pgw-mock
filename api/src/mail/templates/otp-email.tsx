import { Body, Container, Head, Html, Section } from 'react-email';

export interface OtpEmailProps {
  otp: string;
  /** better-auth emailOTP flow: 'sign-in' | 'email-verification' | 'forget-password' */
  type?: string;
  expiresInMinutes?: number;
}

interface Copy {
  heading: string;
  intro: string;
}

const DEFAULT_COPY: Copy = {
  heading: 'Sign in to Noria Payments',
  intro: 'Use the verification code below to finish signing in to the console.',
};

const COPY: Record<string, Copy> = {
  'sign-in': DEFAULT_COPY,
  'email-verification': {
    heading: 'Verify your email',
    intro: 'Use the verification code below to confirm your email address.',
  },
  'forget-password': {
    heading: 'Reset your password',
    intro: 'Use the verification code below to reset your password.',
  },
};

export function OtpEmail({ otp, type = 'sign-in', expiresInMinutes = 10 }: OtpEmailProps) {
  const copy = COPY[type] ?? DEFAULT_COPY;
  return (
    <Html lang="en">
      <Head />
      <Body style={body}>
        {/* Full-width background wrapper so the page colour shows even where the
            <body> background is dropped (Outlook, several webmail clients). */}
        <Section style={backdrop}>
          <Container style={container}>
            <Section style={card}>
              {/* Text blocks are plain <div>s (no margin) rather than react-email
                  <Text>/<Heading>, which inject a `margin` default that only has
                  partial support in Outlook/Gmail. Spacing is padding-only. */}
              <div style={brandName}>Noria Payments</div>
              <div style={brandSub}>MOCK CONSOLE</div>
              <div style={brandDivider} />

              <div style={heading}>{copy.heading}</div>
              <div style={paragraph}>{copy.intro}</div>

              <Section style={codeBox}>
                <div style={code}>{otp}</div>
              </Section>

              <div style={expiry}>
                This code expires in {expiresInMinutes} minutes. If you didn’t request it, you can
                safely ignore this email.
              </div>

              <div style={divider} />
              <div style={footer}>
                Noria Payments Mock — a sandbox environment. Never share this code with anyone.
              </div>
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}

export default OtpEmail;

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const body: React.CSSProperties = {
  margin: 0,
  padding: 0,
  backgroundColor: '#f4f4f5',
  fontFamily: FONT_STACK,
};

const backdrop: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  padding: '32px 12px',
};

const container: React.CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  backgroundColor: '#ffffff',
  border: '1px solid #e4e4e7',
};

const card: React.CSSProperties = {
  padding: '40px',
};

const brandName: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '18px',
  fontWeight: 700,
  color: '#18181b',
  fontFamily: FONT_STACK,
};

const brandSub: React.CSSProperties = {
  textAlign: 'center',
  padding: '2px 0 24px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#71717a',
  letterSpacing: '2px',
  fontFamily: FONT_STACK,
};

const brandDivider: React.CSSProperties = {
  borderTop: '1px solid #e4e4e7',
  fontSize: '1px',
  lineHeight: '1px',
};

const heading: React.CSSProperties = {
  padding: '24px 0 12px',
  fontSize: '22px',
  fontWeight: 600,
  color: '#18181b',
  fontFamily: FONT_STACK,
};

const paragraph: React.CSSProperties = {
  padding: '0 0 16px',
  fontSize: '15px',
  lineHeight: '24px',
  color: '#3f3f46',
  fontFamily: FONT_STACK,
};

const codeBox: React.CSSProperties = {
  backgroundColor: '#18181b',
  borderRadius: '10px',
  padding: '20px',
};

const code: React.CSSProperties = {
  textAlign: 'center',
  fontSize: '34px',
  lineHeight: '40px',
  fontWeight: 700,
  letterSpacing: '8px',
  color: '#ffffff',
  fontFamily: '"SF Mono", ui-monospace, Menlo, Consolas, monospace',
};

const expiry: React.CSSProperties = {
  padding: '24px 0',
  fontSize: '15px',
  lineHeight: '24px',
  color: '#3f3f46',
  fontFamily: FONT_STACK,
};

const divider: React.CSSProperties = {
  borderTop: '1px solid #e4e4e7',
  fontSize: '1px',
  lineHeight: '1px',
};

const footer: React.CSSProperties = {
  padding: '16px 0 0',
  fontSize: '12px',
  lineHeight: '18px',
  color: '#a1a1aa',
  fontFamily: FONT_STACK,
};
