interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * DataAustin MCP — Austin, TX open data (data.austintexas.gov, Socrata SODA API).
 *
 * Keyless (rate-limited; pass a Socrata app token via _apiKey for higher
 * limits). Sister to data-sf / data-la / data-seattle / data-cityofchicago.
 *
 * Tools:
 * - austin_recent:   recent rows from a common Austin dataset by friendly name
 * - austin_query:    raw SoQL query against any data.austintexas.gov resource id
 * - austin_datasets: search the Austin open-data catalogue
 */


const BASE = 'https://data.austintexas.gov';
const UA = 'pipeworx-mcp-data-austin/1.0 (+https://pipeworx.io)';

const DATASETS: Record<string, { id: string; label: string; date: string }> = {
  crime: { id: 'fdj4-gpfu', label: 'Crime Reports (APD)', date: 'occ_date_time' },
  '311': { id: 'xwdj-i9he', label: 'Austin 311 Public Data', date: 'sr_created_date' },
  permits: { id: '3syk-w9eu', label: 'Issued Construction Permits', date: 'issue_date' },
  restaurant_inspections: { id: 'ecmv-9xxi', label: 'Food Establishment Inspection Scores', date: 'inspection_date' },
};

const API_KEY_PROP = {
  type: 'string' as const,
  description: 'Optional — your own Socrata app token for higher rate limits. Omit to use the keyless endpoint.',
};

const tools: McpToolExport['tools'] = [
  {
    name: 'austin_recent',
    description:
      "Recent records from a common Austin, TX open dataset (data.austintexas.gov) by friendly name — no Socrata id needed. PREFER OVER WEB SEARCH for \"recent crime in Austin\", \"Austin 311 requests\", \"Austin construction permits\", \"Austin restaurant inspection scores\". Names: crime, 311, permits, restaurant_inspections. Returns the latest rows (newest-first). Add a SoQL `where` to filter; for anything else use austin_query.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        dataset: { type: 'string', description: 'One of: crime, 311, permits, restaurant_inspections.', enum: Object.keys(DATASETS) },
        where: { type: 'string', description: 'Optional SoQL filter, e.g. "council_district=9". Omit for all recent rows.' },
        limit: { type: 'number', description: 'Rows to return (1-1000, default 20).' },
        _apiKey: API_KEY_PROP,
      },
      required: ['dataset'],
    },
  },
  {
    name: 'austin_query',
    description:
      'Run a raw SoQL query against any Austin open-data resource (data.austintexas.gov) by its Socrata id (8-char like "fdj4-gpfu"). Full SoQL: where/select/group/order/limit/offset. Use austin_datasets to find a resource id, or austin_recent for the common ones.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        resource_id: { type: 'string', description: 'Socrata resource id, e.g. "fdj4-gpfu" (crime reports).' },
        where: { type: 'string', description: 'SoQL $where filter.' },
        select: { type: 'string', description: 'SoQL $select (e.g. "crime_type, count(*)").' },
        group: { type: 'string', description: 'SoQL $group.' },
        order: { type: 'string', description: 'SoQL $order (e.g. "occ_date_time DESC").' },
        limit: { type: 'number', description: 'Max rows (default 100, max 5000).' },
        offset: { type: 'number', description: 'Row offset for paging.' },
        _apiKey: API_KEY_PROP,
      },
      required: ['resource_id'],
    },
  },
  {
    name: 'austin_datasets',
    description:
      'Search the Austin open-data catalogue (data.austintexas.gov) for datasets by keyword. Returns dataset names, descriptions, and Socrata resource ids to use with austin_query.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Keyword(s), e.g. "traffic", "water", "budget".' },
        limit: { type: 'number', description: 'Max datasets (1-100, default 20).' },
        offset: { type: 'number', description: 'Offset for paging.' },
        _apiKey: API_KEY_PROP,
      },
    },
  },
];

function headers(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', 'User-Agent': UA };
  if (apiKey) h['X-App-Token'] = apiKey;
  return h;
}

async function socrataGet(path: string, apiKey?: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(apiKey) });
  if (res.status === 429) throw new Error('upstream_throttled: data.austintexas.gov rate limit (HTTP 429). Pass _apiKey (Socrata app token) for higher limits.');
  if (!res.ok) throw new Error(`data.austintexas.gov: ${res.status}`);
  return res.json();
}

async function recent(dataset: string, where: string | undefined, limit: number | undefined, apiKey?: string) {
  const key = String(dataset ?? '').toLowerCase().trim();
  const ds = DATASETS[key];
  if (!ds) throw new Error(`Unknown dataset "${dataset}". Use one of: ${Object.keys(DATASETS).join(', ')}.`);
  const n = Math.min(1000, Math.max(1, Number(limit) || 20));
  const p = new URLSearchParams();
  // Guard against NULL sort-column values sorting to the top under DESC (Socrata
  // puts NULLs first), which would surface stale rows instead of the most recent.
  const notNull = `${ds.date} IS NOT NULL`;
  p.set('$where', where && String(where).trim() ? `(${String(where).trim()}) AND ${notNull}` : notNull);
  p.set('$order', `${ds.date} DESC`);
  p.set('$limit', String(n));
  const rows = (await socrataGet(`/resource/${ds.id}.json?${p}`, apiKey)) as unknown[];
  return { dataset: key, label: ds.label, resource_id: ds.id, sorted_by: `${ds.date} DESC`, count: Array.isArray(rows) ? rows.length : 0, source: 'DataAustin (data.austintexas.gov)', rows };
}

async function query(args: Record<string, unknown>, apiKey?: string) {
  const id = String(args.resource_id ?? '').trim();
  if (!id) throw new Error('Required argument "resource_id" is missing (e.g. "fdj4-gpfu"). Find one with austin_datasets.');
  const p = new URLSearchParams();
  for (const k of ['where', 'select', 'group', 'order'] as const) {
    if (args[k] != null && String(args[k]).trim()) p.set(`$${k}`, String(args[k]).trim());
  }
  p.set('$limit', String(Math.min(5000, Math.max(1, Number(args.limit) || 100))));
  if (args.offset != null) p.set('$offset', String(Math.max(0, Number(args.offset))));
  const rows = (await socrataGet(`/resource/${encodeURIComponent(id)}.json?${p}`, apiKey)) as unknown[];
  return { resource_id: id, count: Array.isArray(rows) ? rows.length : 0, source: 'DataAustin (data.austintexas.gov)', rows };
}

async function datasets(q: string | undefined, limit: number | undefined, offset: number | undefined, apiKey?: string) {
  const p = new URLSearchParams({
    domains: 'data.austintexas.gov',
    search_context: 'data.austintexas.gov',
    limit: String(Math.min(100, Math.max(1, Number(limit) || 20))),
    offset: String(Math.max(0, Number(offset) || 0)),
  });
  if (q && String(q).trim()) p.set('q', String(q).trim());
  const res = await fetch(`https://api.us.socrata.com/api/catalog/v1?${p}`, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Socrata catalog: ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ resource?: { id?: string; name?: string; description?: string; type?: string; updatedAt?: string } }> };
  return {
    query: q ?? null,
    count: data.results?.length ?? 0,
    datasets: (data.results ?? []).map((r) => ({
      resource_id: r.resource?.id ?? null,
      name: r.resource?.name ?? null,
      description: (r.resource?.description ?? '').slice(0, 300) || null,
      type: r.resource?.type ?? null,
      updated_at: r.resource?.updatedAt ?? null,
    })),
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = typeof args._apiKey === 'string' && args._apiKey.trim() ? args._apiKey.trim() : undefined;
  delete args._apiKey;
  switch (name) {
    case 'austin_recent':
      return recent(args.dataset as string, args.where as string | undefined, args.limit as number | undefined, apiKey);
    case 'austin_query':
      return query(args, apiKey);
    case 'austin_datasets':
      return datasets(args.query as string | undefined, args.limit as number | undefined, args.offset as number | undefined, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
