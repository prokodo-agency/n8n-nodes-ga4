import { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

export class GoogleServiceAccount implements ICredentialType {
  name = 'googleServiceAccount';
  displayName = 'Google Service Account';
  documentationUrl = 'https://cloud.google.com/iam/docs/service-accounts';
  icon = { light: 'file:prokodo_icon.png', dark: 'file:prokodo_icon.png' } as Icon

  properties: INodeProperties[] = [
    {
      displayName: 'Authentication',
      name: 'authType',
      type: 'options',
      options: [
        { name: 'Service Account (Email + Key)', value: 'fields' },
        { name: 'Full JSON', value: 'json' },
      ],
      default: 'fields',
    },

    // --- FIELDS MODE ---
    {
      displayName: 'Client Email',
      name: 'clientEmail',
      type: 'string',
      default: '',
      placeholder: 'my-sa@project-id.iam.gserviceaccount.com',
      description: 'Service account email',
      displayOptions: { show: { authType: ['fields'] } },
    },
    {
      displayName: 'Private Key (PEM)',
      name: 'privateKey',
      type: 'string',
      typeOptions: { rows: 8, password: true },
      default: '',
      description:
        'Paste the PEM, including -----BEGIN PRIVATE KEY----- / -----END PRIVATE KEY----- (line breaks allowed).',
      displayOptions: { show: { authType: ['fields'] } },
    },
    {
      displayName: 'Impersonate User (Optional)',
      name: 'subject',
      type: 'string',
      default: '',
      placeholder: 'user@customer-domain.com',
      description: 'Only for domain-wide delegation (not required for GA4).',
      displayOptions: { show: { authType: ['fields'] } },
    },

    // --- COMMON ---
    {
      displayName: 'Scopes',
      name: 'scopes',
      type: 'string',
      default: 'https://www.googleapis.com/auth/analytics.readonly',
    },
  ];
}
