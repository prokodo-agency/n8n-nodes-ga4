import type { INodeTypeDescription } from 'n8n-workflow';

export const NODE_DESCRIPTION: INodeTypeDescription = {
  displayName: 'prokodo (GA4)',
  name: 'prokodoGa4',
  group: ['transform'],
  version: 1,
  icon: 'file:prokodo_icon.png',
  iconColor: 'blue',
  description:
    'Query Google Analytics 4 (Data API) with a Service Account. Includes helpers for best post times and quick lists (landing pages, referrers).',
  defaults: { name: 'GA4 (Service Account)' },
  inputs: ['main'],
  outputs: ['main'],
  credentials: [{ name: 'googleServiceAccount', required: true }],
  properties: [
    // --- Core ---
    {
      displayName: 'Operation',
      name: 'operation',
      type: 'options',
      options: [
        {
          name: 'Run Report',
          value: 'runReport',
          description:
            'Generic GA4 Data API report. You provide the full RunReport body (dimensions, metrics, dateRanges, filters, etc.).',
        },
        {
          name: 'Run Realtime Report',
          value: 'runRealtimeReport',
          description: 'Realtime report (e.g., activeUsers). Uses GA4 Realtime API.',
        },
        {
          name: 'Get Metadata',
          value: 'getMetadata',
          description: 'Fetch available dimensions and metrics for your property.',
        },
        {
          name: 'Blog Hours TopK (Helper)',
          value: 'blogHoursTopK',
          description:
            'Heuristic: find the best hours×weekday buckets for blog traffic, then map them into the next N days (Berlin time).',
        },
        {
          name: 'Channel Hours TopK (Helper)',
          value: 'channelHoursTopK',
          description:
            'Heuristic: best hours×weekday for a Default Channel Group (e.g., Organic Social), then map to next N days.',
        },
        {
          name: 'Page Hours TopK (Helper)',
          value: 'pageHoursTopK',
          description:
            'Heuristic: best hours×weekday for page traffic filtered by path substring/domain (not limited to /blog).',
        },
        {
          name: 'Landing Pages Top',
          value: 'landingPagesTop',
          description: 'Top landing pages by a metric (sessions or engagedSessions), optional path/domain filter.',
        },
        {
          name: 'Referrers Top',
          value: 'referrersTop',
          description: 'Top referrers (source/medium/channelGroup) by sessions in the lookback window.',
        },
        {
          name: 'Source Hours TopK (Helper)',
          value: 'sourceHoursTopK',
          description: 'Best hours×weekday for specified session sources (e.g., linkedin, t.co, instagram).',
        },
      ],
      default: 'runReport',
    },
    {
      displayName: 'Property ID',
      name: 'propertyId',
      type: 'string',
      default: '',
      placeholder: '412345678',
      required: true,
      description:
        'Numeric GA4 Property ID (from Admin → Property Settings). Not the Measurement ID (G-XXXX). Example: 412345678',
    },

    // --- Generic runReport ---
    {
      displayName: 'Report Body (JSON)',
      name: 'reportBody',
      type: 'string',
	    typeOptions: { rows: 12 },
      default: `{
        "dateRanges": [{ "startDate": "60daysAgo", "endDate": "today" }],
        "dimensions": [{ "name": "hour" }, { "name": "dayOfWeek" }],
        "metrics": [{ "name": "sessions" }]
      }`,
      description:
        'Exact GA4 RunReport request body. See GA4 Data API docs. You can pass filters, orderBys, limit, metric aggregations, etc.',
      displayOptions: { show: { operation: ['runReport'] } },
    },
    {
      displayName: 'Return Property Quota',
      name: 'returnQuota',
      type: 'boolean',
      default: true,
      description:
        'If enabled, GA4 will return propertyQuota (remaining tokens). Helpful to monitor API usage.',
      displayOptions: {
        show: {
          operation: [
            'runReport',
            'blogHoursTopK',
            'channelHoursTopK',
            'pageHoursTopK',
            'landingPagesTop',
            'referrersTop',
            'sourceHoursTopK',
          ],
        },
      },
    },
    {
      displayName: 'Session Sources (comma-separated)',
      name: 'sessionSources',
      type: 'string',
      default: 'linkedin, t.co, instagram, facebook',
      description: 'Matches GA4 “sessionSource”. Case-insensitive. You can pass hostnames like t.co, l.instagram.com, lnkd.in.',
      displayOptions: { show: { operation: ['sourceHoursTopK'] } },
    },
    {
      displayName: 'Use Source/Medium',
      name: 'useSourceMedium',
      type: 'boolean',
      default: false,
      description: 'If enabled, match “sessionSourceMedium” instead of “sessionSource” (e.g., linkedin / referral).',
      displayOptions: { show: { operation: ['sourceHoursTopK'] } },
    },

	  // --- Helpers: extra controls ---
    {
      displayName: 'Metric for Timing',
      name: 'timingMetric',
      type: 'options',
      options: [
        { name: 'Page Views', value: 'screenPageViews' },
        { name: 'Sessions', value: 'sessions' },
        { name: 'Engaged Sessions', value: 'engagedSessions' },
      ],
      default: 'screenPageViews',
      description: 'Metric aggregated by hour×weekday when computing best time buckets. Note: With “Channel Hours TopK”, Page Views is incompatible with Default Channel Group and will auto-switch to Sessions.',
      displayOptions: { show: { operation: ['blogHoursTopK', 'channelHoursTopK', 'pageHoursTopK', 'sourceHoursTopK'] } },
    },
    {
      displayName: 'Label Time Zone (IANA)',
      name: 'timeZone',
      type: 'string',
      default: 'Europe/Berlin',
      description: 'Time zone used for human-readable labels of suggested slots.',
      displayOptions: { show: { operation: ['blogHoursTopK', 'channelHoursTopK', 'pageHoursTopK', 'sourceHoursTopK'] } },
    },
    {
      displayName: 'Occurrence Mode',
      name: 'occurrenceMode',
      type: 'options',
      options: [
        { name: 'First occurrence only', value: 'first' },
        { name: 'Expand within horizon (weekly)', value: 'expand' },
      ],
      default: 'first',
      description: 'Return only the next slot per top bucket, or repeat weekly within the horizon.',
      displayOptions: { show: { operation: ['blogHoursTopK', 'channelHoursTopK', 'pageHoursTopK', 'sourceHoursTopK'] } },
    },
    {
      displayName: 'Max Occurrences per Bucket',
      name: 'maxOccurrences',
      type: 'number',
      default: 9,
      typeOptions: { minValue: 1, maxValue: 50 },
      description: 'When using “Expand within horizon”, cap the number of weekly repeats per time bucket.',
      displayOptions: { show: { operation: ['blogHoursTopK', 'channelHoursTopK', 'pageHoursTopK', 'sourceHoursTopK'] } },
    },

    // --- Realtime ---
    {
      displayName: 'Realtime Body (JSON)',
      name: 'realtimeBody',
      type: 'string',
      typeOptions: { rows: 8 },
      default: `{
        "metrics": [{ "name": "activeUsers" }]
      }`,
      description:
        'Exact GA4 Realtime request body. Typically just metrics (e.g., activeUsers) and optional dimensions.',
      displayOptions: { show: { operation: ['runRealtimeReport'] } },
    },

    // --- Metadata ---
    {
      displayName: 'Metadata Type',
      name: 'metaWhat',
      type: 'options',
      options: [{ name: 'Dimensions & Metrics', value: 'dimensionsMetrics' }],
      default: 'dimensionsMetrics',
      description: 'Returns the schema of dimensions/metrics supported by your property.',
      displayOptions: { show: { operation: ['getMetadata'] } },
    },

    // --- Helpers: shared params ---
    {
      displayName: 'Lookback (days)',
      name: 'lookbackDays',
      type: 'number',
      default: 60,
      typeOptions: { minValue: 7, maxValue: 365 },
      description:
        'How far back the helper should aggregate sessions (or traffic) to find good time buckets or top lists.',
      displayOptions: {
        show: {
          operation: [
            'blogHoursTopK',
            'channelHoursTopK',
            'pageHoursTopK',
            'landingPagesTop',
            'referrersTop',
            'sourceHoursTopK',
          ],
        },
      },
    },
    {
      displayName: 'Top K Buckets',
      name: 'topK',
      type: 'number',
      default: 3,
      description:
        'For Hours×Weekday helpers: how many top (weekday,hour) buckets to return (e.g., 3 best time slots).',
      displayOptions: { show: { operation: ['blogHoursTopK', 'channelHoursTopK', 'pageHoursTopK', 'sourceHoursTopK'] } },
    },
    {
      displayName: 'Horizon (days ahead)',
      name: 'horizonDays',
      type: 'number',
      default: 14,
      description:
        'Maps the best (weekday,hour) buckets into actual upcoming ISO datetimes over the next N days.',
      displayOptions: { show: { operation: ['blogHoursTopK', 'channelHoursTopK', 'pageHoursTopK', 'sourceHoursTopK'] } },
    },

    // --- Blog/Page helpers: filters ---
    {
      displayName: 'Domain (hostName filter)',
      name: 'domain',
      type: 'string',
      default: '',
      placeholder: 'www.example.com',
      description:
        'Optional hostName filter to avoid merging multiple domains. Leave empty if you only track one host.',
      displayOptions: {
        show: { operation: ['blogHoursTopK', 'pageHoursTopK', 'landingPagesTop'] },
      },
    },
    {
      displayName: 'Path Contains',
      name: 'pathContains',
      type: 'string',
      default: '/blog',
      description:
        'Substring filter on pagePath (e.g., /blog). For Page Hours helper, set to “/” or a category slug as needed.',
      displayOptions: {
        show: { operation: ['blogHoursTopK', 'pageHoursTopK', 'landingPagesTop'] },
      },
    },

    // --- Channel helper ---
    {
      displayName: 'Default Channel Group',
      name: 'defaultChannelGroup',
      type: 'options',
      options: [
        { name: 'Organic Search', value: 'Organic Search' },
        { name: 'Organic Social', value: 'Organic Social' },
        { name: 'Paid Social', value: 'Paid Social' },
        { name: 'Direct', value: 'Direct' },
        { name: 'Email', value: 'Email' },
        { name: 'Referral', value: 'Referral' },
      ],
      default: 'Organic Social',
      description:
        'Which GA4 Default Channel Group to optimize for (used to filter sessions by channel).',
      displayOptions: { show: { operation: ['channelHoursTopK'] } },
    },

    // --- Landing pages & referrers ---
    {
      displayName: 'Limit',
      name: 'limit',
      type: 'number',
      default: 10,
      description: 'How many rows to return (top N).',
      displayOptions: { show: { operation: ['landingPagesTop', 'referrersTop'] } },
    },
    {
      displayName: 'Exclude “localhost”',
      name: 'excludeLocalhost',
      type: 'boolean',
      default: true,
      description: 'Exclude dev/test hits with hostName “localhost” when no Domain filter is provided.',
      displayOptions: { show: { operation: ['landingPagesTop'] } },
    },
    {
      displayName: 'Metric',
      name: 'metricName',
      type: 'options',
      options: [
        { name: 'Sessions', value: 'sessions' },
        { name: 'Engaged Sessions', value: 'engagedSessions' },
      ],
      default: 'sessions',
      description:
        'Which metric to rank landing pages by. “engagedSessions” is stricter than “sessions”.',
      displayOptions: { show: { operation: ['landingPagesTop'] } },
    },
  ],
};
