// src/utils/ga4Auth.ts
import { JWT } from 'google-auth-library';
import type { IDataObject } from 'n8n-workflow';

function normalizePrivateKey(key: string): string {
  if (!key) return key;
  // Convert escaped \n to real newlines if the user pasted a single-line key
  const k = key.includes('\\n') && !key.includes('\n') ? key.replace(/\\n/g, '\n') : key;
  // Ensure BEGIN/END markers exist (user might paste without headers) – optional soft guard:
  if (!/-----BEGIN [A-Z ]+-----/.test(k)) return `-----BEGIN PRIVATE KEY-----\n${k}\n-----END PRIVATE KEY-----\n`;
  return k;
}

export async function getAccessToken(creds: IDataObject): Promise<string> {
  const scopes = (creds.scopes as string) || 'https://www.googleapis.com/auth/analytics.readonly';
  let email = (creds.clientEmail as string) || '';
  let key   = (creds.privateKey as string) || '';
  const subject = (creds.subject as string) || undefined;

  // Auto: JSON versehentlich im Key-Feld
  const t = (key || '').trim();
  if (t.startsWith('{') && t.endsWith('}')) {
    try {
      const parsed = JSON.parse(t);
      email = email || parsed.client_email || '';
      key   = parsed.private_key || '';
    } catch {}
  }

  key = normalizePrivateKey(key);
  if (!email || !key) throw new Error('Service Account: client email or private key missing.');

  const client = new JWT({ email, key, scopes, subject });
  const { access_token } = await client.authorize();
  const bearer = access_token;
  if (!bearer) throw new Error('GA4 (SA): Unable to obtain access token');
  return bearer;
}

