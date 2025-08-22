import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
  IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import fetch from 'node-fetch';
import { getAccessToken } from '../../utils/ga4Auth';
import { nextIsoWithinHorizon, label } from '../../utils/time';
import { NODE_DESCRIPTION } from './Ga4Tools.const';

type RunReportRow = { dimensionValues: { value: string }[]; metricValues: { value: string }[] };
type GA4Response = {
  rows?: RunReportRow[];
  propertyQuota?: IDataObject;
  [key: string]: any;
};

function readJsonParamOrThrow(
  ctx: IExecuteFunctions,
  name: string,
  itemIndex: number,
  fallback?: IDataObject,
): IDataObject {
  const raw = ctx.getNodeParameter(name, itemIndex) as unknown;
  if (raw == null) {
    return fallback ?? {};
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return fallback ?? {};
    try {
      return JSON.parse(s) as IDataObject;
    } catch (e: any) {
      throw new NodeOperationError(ctx.getNode(), `Invalid JSON in "${name}": ${e.message || String(e)}`, { itemIndex });
    }
  }
  if (typeof raw === 'object') return raw as IDataObject;
  return fallback ?? {};
}

/**
 * Accept a domain *or* full URL and return tolerant host variants.
 * Example: "example.com" -> ["example.com","www.example.com"]
 *          "https://www.example.com/" -> ["www.example.com","example.com"]
 */
function normalizeDomainInput(input: string): string[] {
  if (!input) return [];
  try {
    const u = new URL(input.includes('://') ? input : `https://${input}`);
    input = u.hostname;
  } catch {}
  const host = (input || '').trim().toLowerCase();
  if (!host) return [];
  const variants = new Set<string>([host]);
  if (host.startsWith('www.')) variants.add(host.slice(4));
  else variants.add('www.' + host);
  return [...variants];
}

export class Ga4Tools implements INodeType {
	description = NODE_DESCRIPTION;

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// credentials once (token will be cached by google-auth-library client)
		const creds = await this.getCredentials('googleServiceAccount');
		const token = await getAccessToken(creds as IDataObject);

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const propertyId = this.getNodeParameter('propertyId', i) as string;
				if (!propertyId) throw new NodeOperationError(this.getNode(), 'Property ID is required', { itemIndex: i });
				const base = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}`;

				if (operation === 'runReport') {
					const body = readJsonParamOrThrow(
            this,
            'reportBody',
            i,
            {
              dateRanges: [{ startDate: '60daysAgo', endDate: 'today' }],
              dimensions: [{ name: 'hour' }, { name: 'dayOfWeek' }],
              metrics: [{ name: 'sessions' }],
            } as IDataObject,
          );
					if (this.getNodeParameter('returnQuota', i) as boolean) body.returnPropertyQuota = true;

					const resp = await fetch(`${base}:runReport`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					});
					if (!resp.ok) {
						const text = await resp.text();
						if (resp.status === 403) {
							const sa = ((creds as IDataObject).clientEmail as string) || '(unknown SA)';
							throw new NodeOperationError(this.getNode(),
								`403 PERMISSION_DENIED for property ${propertyId} using SA ${sa}. Ensure the SA has Viewer/Analyst on that property. Raw: ${text}`,
								{ itemIndex: i });
						}
						throw new NodeOperationError(this.getNode(), `${resp.status} ${text}`, { itemIndex: i });
					}
					const json = (await resp.json()) as IDataObject;
          returnData.push({ json });
					continue;
				}

				if (operation === 'runRealtimeReport') {
					const body = readJsonParamOrThrow(
            this,
            'realtimeBody',
            i,
            { metrics: [{ name: 'activeUsers' }] } as IDataObject,
          );
					const resp = await fetch(`${base}:runRealtimeReport`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					});
					if (!resp.ok) {
						const text = await resp.text();
						if (resp.status === 403) {
							const sa = ((creds as IDataObject).clientEmail as string) || '(unknown SA)';
							throw new NodeOperationError(this.getNode(),
								`403 PERMISSION_DENIED for property ${propertyId} using SA ${sa}. Ensure the SA has Viewer/Analyst on that property. Raw: ${text}`,
								{ itemIndex: i });
						}
						throw new NodeOperationError(this.getNode(), `${resp.status} ${text}`, { itemIndex: i });
					}
					const json = (await resp.json()) as IDataObject;
          returnData.push({ json });
					continue;
				}

				if (operation === 'getMetadata') {
					const resp = await fetch(`${base}/metadata`, {
						method: 'GET',
						headers: { Authorization: `Bearer ${token}` },
					});
					if (!resp.ok) {
						const text = await resp.text();
						if (resp.status === 403) {
							const sa = ((creds as IDataObject).clientEmail as string) || '(unknown SA)';
							throw new NodeOperationError(this.getNode(),
								`403 PERMISSION_DENIED for property ${propertyId} using SA ${sa}. Ensure the SA has Viewer/Analyst on that property. Raw: ${text}`,
								{ itemIndex: i });
						}
						throw new NodeOperationError(this.getNode(), `${resp.status} ${text}`, { itemIndex: i });
					}
					const json = (await resp.json()) as IDataObject;
          returnData.push({ json });
					continue;
				}

				// Helpers (Timing & Insights)
				if (['blogHoursTopK', 'channelHoursTopK', 'pageHoursTopK', 'sourceHoursTopK'].includes(operation)) {
					const lookbackDays = this.getNodeParameter('lookbackDays', i) as number;
					const topK = this.getNodeParameter('topK', i) as number;
					const horizonDays = this.getNodeParameter('horizonDays', i) as number;
					const includeQuota = this.getNodeParameter('returnQuota', i) as boolean;
          const timingMetricCfg = (this.getNodeParameter('timingMetric', i, 'screenPageViews') as string) || 'screenPageViews';
					let timeZone = (this.getNodeParameter('timeZone', i, '') as string) || '';
          const occurrenceMode = (this.getNodeParameter('occurrenceMode', i, 'first') as string) || 'first';
          const maxOccurrences = (this.getNodeParameter('maxOccurrences', i, 9) as number) || 9;

					// build dimensionFilter
					let dimensionFilter: any = undefined;

          if (operation === 'sourceHoursTopK') {          
            const listRaw = (this.getNodeParameter('sessionSources', i, '') as string) || '';
            const useSourceMedium = (this.getNodeParameter('useSourceMedium', i, false) as boolean) || false;
            const values = listRaw.split(',').map(s => s.trim()).filter(Boolean);
            if (!values.length) throw new NodeOperationError(this.getNode(), 'Please provide at least one session source', { itemIndex: i });
          
            const fieldName = useSourceMedium ? 'sessionSourceMedium' : 'sessionSource';
            const localFilter = { filter: { fieldName, inListFilter: { values, caseSensitive: false } } };
            // sessionSource(_Medium) is session-scoped → force a session-scoped metric if needed
            const metricForSource =
              (timingMetricCfg === 'screenPageViews') ? 'sessions' : timingMetricCfg;
          
            const reportBody: any = {
              dateRanges: [{ startDate: `${lookbackDays}daysAgo`, endDate: 'today' }],
              dimensions: [{ name: 'hour' }, { name: 'dayOfWeek' }],
              metrics: [{ name: metricForSource }],
              dimensionFilter: localFilter,
              returnPropertyQuota: includeQuota,
            };
          
            const resp = await fetch(`${base}:runReport`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(reportBody),
            });
            if (!resp.ok) {
              const text = await resp.text();
              throw new NodeOperationError(this.getNode(), `${resp.status} ${text}`, { itemIndex: i });
            }
            const data = (await resp.json()) as GA4Response;
            if (!timeZone) timeZone = (data as any)?.metadata?.timeZone || 'Europe/Berlin';
          
            // === same scoring + buckets + expand logic you already use ===
            const rows: RunReportRow[] = data.rows || [];
            const score: Record<string, number> = {};
            for (const r of rows) {
              const hour = Number(r.dimensionValues[0].value);
              const dow = Number(r.dimensionValues[1].value);
              const s = Number(r.metricValues[0].value);
              const k = `${dow}|${hour}`;
              score[k] = (score[k] ?? 0) + s;
            }
            const allBuckets = Object.entries(score)
              .map(([k, s]) => { const [dow, hour] = k.split('|').map(Number); return { dow, hour, score: s }; })
              .sort((a, b) => b.score - a.score);
            const totalScore = allBuckets.reduce((acc, b) => acc + b.score, 0);
            const buckets = allBuckets.slice(0, topK).map((b, idx) => ({
              rank: idx + 1, dow: b.dow, hour: b.hour, score: b.score, share: totalScore ? b.score / totalScore : 0,
            }));
          
            const expandOccurrences = (dow:number, hour:number, hd:number, tz:string, cap:number): string[] => {
              const first = nextIsoWithinHorizon(dow, hour, hd, tz); if (!first) return [];
              const out = [first]; let cursor = new Date(first);
              const end = new Date(); end.setUTCDate(end.getUTCDate() + hd);
              while (out.length < cap) { cursor = new Date(cursor.getTime() + 7*24*3600*1000); if (cursor > end) break; out.push(cursor.toISOString()); }
              return out;
            };
          
            const candidatesRaw = buckets.flatMap(({ dow, hour }) =>
              occurrenceMode === 'expand'
                ? expandOccurrences(dow, hour, horizonDays, timeZone, Math.max(1, maxOccurrences))
                : [nextIsoWithinHorizon(dow, hour, horizonDays, timeZone)],
            ).filter(Boolean) as string[];
          
            const candidates = Array.from(new Set(candidatesRaw)).sort((a,b)=>+new Date(a)-+new Date(b));
            const labels = candidates.map(iso => label(iso, timeZone));
          
            returnData.push({ json: {
              operation,
              candidates, labels, buckets,
              reportUsedMetric: metricForSource,
              lookbackDays, horizonDays, timeZone, occurrenceMode, topK,
              propertyQuota: data.propertyQuota ?? null,
              raw: data,
            }});
            continue;
          }

					if (operation === 'blogHoursTopK') {
						const domain = (this.getNodeParameter('domain', i) as string) || '';
						const pathContains = (this.getNodeParameter('pathContains', i) as string) || '/blog';
						const expressions: any[] = [];
            const hosts = normalizeDomainInput(domain);
            if (hosts.length) {
              expressions.push({
                filter: { fieldName: 'hostName', inListFilter: { values: hosts, caseSensitive: false } },
              });
            }
            const isHomepage = pathContains === '/';
            expressions.push({
              filter: {
                fieldName: 'pagePath',
                stringFilter: {
                  matchType: isHomepage ? 'EXACT' : 'CONTAINS',
                  value: pathContains,
                  caseSensitive: false,
                },
              },
            });
            dimensionFilter = expressions.length === 1 ? expressions[0] : { andGroup: { expressions } };
					}

					if (operation === 'pageHoursTopK') {
						const domain = (this.getNodeParameter('domain', i) as string) || '';
						const pathContains = (this.getNodeParameter('pathContains', i) as string) || '/';
						const expressions: any[] = [];
            const hosts = normalizeDomainInput(domain);
            if (hosts.length) {
              expressions.push({
                filter: { fieldName: 'hostName', inListFilter: { values: hosts, caseSensitive: false } },
              });
            }
            const isHomepage = pathContains === '/';
            expressions.push({
              filter: {
                fieldName: 'pagePath',
                stringFilter: {
                  matchType: isHomepage ? 'EXACT' : 'CONTAINS',
                  value: pathContains,
                  caseSensitive: false,
                },
              },
            });
            dimensionFilter = expressions.length === 1 ? expressions[0] : { andGroup: { expressions } };
					}

					if (operation === 'channelHoursTopK') {
						const group = this.getNodeParameter('defaultChannelGroup', i) as string;
						dimensionFilter = {
							filter: { fieldName: 'defaultChannelGroup', stringFilter: { matchType: 'EXACT', value: group } },
						};
					}

          // Metric compatibility:
          // defaultChannelGroup is session-scoped, so screenPageViews (event-scoped) is incompatible.
          const metricForHelper =
            operation === 'channelHoursTopK' && timingMetricCfg === 'screenPageViews'
              ? 'sessions'
              : timingMetricCfg;
          const reportUsedMetric = metricForHelper;
					const reportBody: any = {
						dateRanges: [{ startDate: `${lookbackDays}daysAgo`, endDate: 'today' }],
						dimensions: [{ name: 'hour' }, { name: 'dayOfWeek' }],
						metrics: [{ name: metricForHelper }],
						returnPropertyQuota: includeQuota,
					};
					if (dimensionFilter) reportBody.dimensionFilter = dimensionFilter;

					const resp = await fetch(`${base}:runReport`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
						body: JSON.stringify(reportBody),
					});
					if (!resp.ok) {
						const text = await resp.text();
						if (resp.status === 403) {
							const sa = ((creds as IDataObject).clientEmail as string) || '(unknown SA)';
							throw new NodeOperationError(this.getNode(),
								`403 PERMISSION_DENIED for property ${propertyId} using SA ${sa}. Ensure the SA has Viewer/Analyst on that property. Raw: ${text}`,
								{ itemIndex: i });
						}
						throw new NodeOperationError(this.getNode(), `${resp.status} ${text}`, { itemIndex: i });
					}
					const data = (await resp.json()) as GA4Response;
          if (!timeZone) timeZone = (data as any)?.metadata?.timeZone || 'Europe/Berlin';

					// score buckets → topK → map to next horizon ISO dates
					const rows: RunReportRow[] = data.rows || [];
          const score: Record<string, number> = {};
          for (const r of rows) {
            const hour = Number(r.dimensionValues[0].value);
            const dow = Number(r.dimensionValues[1].value); // 0..6 (Sun..Sat)
            const s = Number(r.metricValues[0].value);
            const k = `${dow}|${hour}`;
            score[k] = (score[k] ?? 0) + s;
          }
          // Build ranked buckets and keep topK
          const allBuckets = Object.entries(score)
            .map(([k, s]) => {
              const [dow, hour] = k.split('|').map(Number);
              return { dow, hour, score: s };
            })
            .sort((a, b) => b.score - a.score);
          const totalScore = allBuckets.reduce((acc, b) => acc + b.score, 0);
          const buckets = allBuckets.slice(0, topK).map((b, idx) => ({
            rank: idx + 1,
            dow: b.dow,
            hour: b.hour,
            score: b.score,
            share: totalScore ? b.score / totalScore : 0,
          }));
          // Expand occurrences across the horizon (optional)
          const expandOccurrences = (
            dow: number,
            hour: number,
            horizonDays: number,
            timeZone: string,
            cap: number,
          ): string[] => {
            const first = nextIsoWithinHorizon(dow, hour, horizonDays, timeZone);
            if (!first) return [];
            const out = [first];
            let cursor = new Date(first);
            const horizonEnd = new Date();
            horizonEnd.setUTCDate(horizonEnd.getUTCDate() + horizonDays);
            while (out.length < cap) {
              cursor = new Date(cursor.getTime() + 7 * 24 * 3600 * 1000); // +7 days
              if (cursor > horizonEnd) break;
              out.push(cursor.toISOString());
            }
            return out;
          };

					const candidatesRaw: string[] = buckets
            .flatMap(({ dow, hour }) =>
              occurrenceMode === 'expand'
                ? expandOccurrences(dow, hour, horizonDays, timeZone, Math.max(1, maxOccurrences))
                : [nextIsoWithinHorizon(dow, hour, horizonDays, timeZone)],
            )
            .filter((x): x is string => Boolean(x));

					const candidates = Array.from(new Set(candidatesRaw))
						.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
					const labels = candidates.map((iso) => label(iso, timeZone));

					returnData.push({
						json: {
							operation,
							candidates,
							labels: labels,
              buckets,
              reportUsedMetric,
              lookbackDays,
              horizonDays,
              timeZone,
              occurrenceMode,
              topK,
							propertyQuota: data.propertyQuota ?? null,
							raw: data, // optional debugging
						},
					});
					continue;
				}

				if (operation === 'landingPagesTop') {
					const lookbackDays = this.getNodeParameter('lookbackDays', i) as number;
					const limit = this.getNodeParameter('limit', i) as number;
					const metricName = this.getNodeParameter('metricName', i) as string;
					const includeQuota = this.getNodeParameter('returnQuota', i) as boolean;
					const pathContains = (this.getNodeParameter('pathContains', i) as string) || '';
					const domain = (this.getNodeParameter('domain', i) as string) || '';
          const excludeLocalhost = (this.getNodeParameter('excludeLocalhost', i, true) as boolean) ?? true;

					const expressions: any[] = [];
          const hosts = normalizeDomainInput(domain);
          if (hosts.length) {
            expressions.push({
              filter: { fieldName: 'hostName', inListFilter: { values: hosts, caseSensitive: false } },
            });
          } else if (excludeLocalhost) {
            expressions.push({
              notExpression: {
                filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: 'localhost' } },
              },
            });
          }
          if (pathContains) {
            const isHomepage = pathContains === '/';
            expressions.push({
              filter: {
                fieldName: 'pagePath',
                stringFilter: {
                  matchType: isHomepage ? 'EXACT' : 'CONTAINS',
                  value: pathContains,
                  caseSensitive: false,
                },
              },
            });
          }
          const filter = expressions.length
            ? (expressions.length === 1 ? expressions[0] : { andGroup: { expressions } })
            : undefined;

					const body: any = {
						dateRanges: [{ startDate: `${lookbackDays}daysAgo`, endDate: 'today' }],
						dimensions: [{ name: 'landingPage' }, { name: 'hostName' }],
						metrics: [{ name: metricName }],
						orderBys: [{ metric: { metricName }, desc: true }],
						limit,
						returnPropertyQuota: includeQuota,
					};
					if (filter) body.dimensionFilter = filter;

					const resp = await fetch(`${base}:runReport`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					});
					if (!resp.ok) {
						const text = await resp.text();
						if (resp.status === 403) {
							const sa = ((creds as IDataObject).clientEmail as string) || '(unknown SA)';
							throw new NodeOperationError(this.getNode(),
								`403 PERMISSION_DENIED for property ${propertyId} using SA ${sa}. Ensure the SA has Viewer/Analyst on that property. Raw: ${text}`,
								{ itemIndex: i });
						}
						throw new NodeOperationError(this.getNode(), `${resp.status} ${text}`, { itemIndex: i });
					}
					const data = (await resp.json()) as GA4Response;

					const rows: RunReportRow[] = data.rows || [];
					const list = rows.map((r) => ({
						host: r.dimensionValues[1]?.value || '',
						path: r.dimensionValues[0]?.value || '',
						[metricName]: Number(r.metricValues[0]?.value || 0),
					}));

					returnData.push({ json: { operation, list, propertyQuota: data.propertyQuota ?? null } });
					continue;
				}

				if (operation === 'referrersTop') {
					const lookbackDays = this.getNodeParameter('lookbackDays', i) as number;
					const limit = this.getNodeParameter('limit', i) as number;
					const includeQuota = this.getNodeParameter('returnQuota', i) as boolean;

					const body: any = {
						dateRanges: [{ startDate: `${lookbackDays}daysAgo`, endDate: 'today' }],
						dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }, { name: 'defaultChannelGroup' }],
						metrics: [{ name: 'sessions' }],
						orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
						limit,
						returnPropertyQuota: includeQuota,
					};

					const resp = await fetch(`${base}:runReport`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
						body: JSON.stringify(body),
					});
					if (!resp.ok) {
						const text = await resp.text();
						if (resp.status === 403) {
							const sa = ((creds as IDataObject).clientEmail as string) || '(unknown SA)';
							throw new NodeOperationError(this.getNode(),
								`403 PERMISSION_DENIED for property ${propertyId} using SA ${sa}. Ensure the SA has Viewer/Analyst on that property. Raw: ${text}`,
								{ itemIndex: i });
						}
						throw new NodeOperationError(this.getNode(), `${resp.status} ${text}`, { itemIndex: i });
					}
					const data = (await resp.json()) as GA4Response;

					const rows: RunReportRow[] = data.rows || [];
					const list = rows.map((r) => ({
						source: r.dimensionValues[0]?.value || '',
						medium: r.dimensionValues[1]?.value || '',
						channelGroup: r.dimensionValues[2]?.value || '',
						sessions: Number(r.metricValues[0]?.value || 0),
					}));

					returnData.push({ json: { operation, list, propertyQuota: data.propertyQuota ?? null } });
					continue;
				}

				throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, { itemIndex: i });
			} catch (err: any) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: err.message || String(err) }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), err.message || String(err), { itemIndex: i });
			}
		}

		return [returnData];
	}
}
