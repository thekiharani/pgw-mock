import { Body, Container, Head, Html, Section } from 'react-email';

export interface InvitationEmailProps {
  merchantName: string;
  role: string;
  inviterName?: string | null;
  acceptUrl: string;
  expiresInHours?: number;
}

export function InvitationEmail({
  merchantName,
  role,
  inviterName,
  acceptUrl,
  expiresInHours = 168,
}: InvitationEmailProps) {
  const who = inviterName ? `${inviterName} invited you` : 'You have been invited';
  return (
    <Html lang="en">
      <Head />
      <Body style={body}>
        <Section style={backdrop}>
          <Container style={container}>
            <Section style={card}>
              <div style={brandName}>Noria Payments</div>
              <div style={brandSub}>MOCK CONSOLE</div>
              <div style={brandDivider} />

              <div style={heading}>You’re invited to collaborate</div>
              <div style={paragraph}>
                {who} to join <strong>{merchantName}</strong> as a <strong>{role}</strong> on the
                Noria Payments console.
              </div>

              <Section style={buttonWrap}>
                <a href={acceptUrl} style={button}>
                  Accept invitation
                </a>
              </Section>

              <div style={paragraph}>
                Or paste this link into your browser:
                <br />
                <span style={link}>{acceptUrl}</span>
              </div>

              <div style={expiry}>
                This invitation expires in {Math.round(expiresInHours / 24)} days. If you weren’t
                expecting it, you can safely ignore this email.
              </div>

              <div style={divider} />
              <div style={footer}>Noria Payments Mock — a sandbox environment.</div>
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}

export default InvitationEmail;

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const body: React.CSSProperties = {
  margin: 0,
  padding: 0,
  backgroundColor: '#f4f4f5',
  fontFamily: FONT_STACK,
};

const backdrop: React.CSSProperties = { backgroundColor: '#f4f4f5', padding: '32px 12px' };

const container: React.CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  backgroundColor: '#ffffff',
  border: '1px solid #e4e4e7',
};

const card: React.CSSProperties = { padding: '40px' };

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

const buttonWrap: React.CSSProperties = { padding: '8px 0 16px' };

const button: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#18181b',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '12px 24px',
  borderRadius: '10px',
  fontFamily: FONT_STACK,
};

const link: React.CSSProperties = {
  fontSize: '13px',
  color: '#2563eb',
  wordBreak: 'break-all',
  fontFamily: '"SF Mono", ui-monospace, Menlo, Consolas, monospace',
};

const expiry: React.CSSProperties = {
  padding: '8px 0 24px',
  fontSize: '14px',
  lineHeight: '22px',
  color: '#71717a',
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
