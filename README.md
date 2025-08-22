<p align="center">
  <a href="https://www.prokodo.com" target="_blank" rel="noopener noreferrer">
    <img src="https://cdn.prokodo.com/prokodo_logo_1a3bb7867c/prokodo_logo_1a3bb7867c.webp" alt="prokodo – UI component library for React" height="58" />
  </a>
</p>
<h1 align="center">n8n GA4 (via Service Account)</h1>
<h2 align="center">Empowering Digital Innovation</h2>

**Query Google Analytics 4 with a Service Account — plus helpers for “best time to post”, landing pages & referrers — developed by [prokodo](https://www.prokodo.com).**

[![npm](https://img.shields.io/npm/v/@prokodo/n8n-nodes-ga4?style=flat&color=3178c6&label=npm)](https://www.npmjs.com/package/@prokodo/n8n-nodes-ga4)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## ✨ Features

- 📊 **RunReport / RunRealtimeReport** (GA4 Data & Realtime APIs)
- 🧭 **Get Metadata** (dimensions & metrics for your property)
- 🕒 **Timing helpers** for scheduling:
  - **Blog Hours TopK** (pagePath filter like ```/blog```)
  - **Page Hours TopK** (arbitrary path/domain filter)
  - **Channel Hours TopK** (by **Default Channel Group**)
  - **Source Hours TopK** (by sessionSource or sessionSourceMedium)
- 🧾 **Landing Pages Top** (sessions/engagedSessions, optional domain/path filters)
- 🔗 **Referrers Top** (sessionSource / sessionMedium / defaultChannelGroup)
- 🧪 **Quota info** (optional propertyQuota in responses)
- 🌍 **Timezone aware** labels & scheduling (IANA TZ)

Internal node name: ```prokodoGa4```
In the node picker: **"prokodo (GA4)"**

## ✅ Requirements
- Node.js 18+ / 20 LTS
- n8n ≥ 1.103 (tested on 1.105+)
- A Google Service Account added to your GA4 property as Viewer or Analyst
- Your GA4 Property ID (numeric, e.g., 412345678 — not the G-XXXX ID)

Using an older n8n (e.g. 1.88)? It may still work if you align n8n-core / n8n-workflow versions. For best results, upgrade n8n.

## 📦 Install

### Option A — Install into your n8n “custom extensions” folder (recommended)

#### Local n8n (not Docker):

```bash
# choose your custom folder (default ~/.n8n)
export N8N_CUSTOM_EXTENSIONS=~/.n8n

# install the node into that folder
npm install --prefix "$N8N_CUSTOM_EXTENSIONS" @prokodo/n8n-nodes-ga4@latest

# start n8n
n8n start
```

#### Docker (example Dockerfile):

```bash
FROM n8nio/n8n:latest

ENV N8N_CUSTOM_EXTENSIONS=/home/node/.n8n
ENV NODE_PATH=/home/node/.n8n/node_modules

USER node
RUN npm install --prefix /home/node/.n8n @prokodo/n8n-nodes-ga4@latest
```

After starting n8n, search in the node picker for **“prokodo (PDF Toolkit)”**
Internal name: **prokodoPdfToolkit**

## 🛠 Dev install (build + link locally)

```bash
# in this repo
npm ci
npm run build

# make your package linkable
npm link

# link into your n8n custom extensions folder
npm link @prokodo/n8n-nodes-ga4 --prefix ~/.n8n

# start n8n with your custom folder
export N8N_CUSTOM_EXTENSIONS=~/.n8n
n8n start
```

Publish-ready tip: This package publishes compiled JS from dist/ to npm.
You don’t need to commit dist/ to Git. To support installs straight from GitHub, add:

```tsx
"scripts": {
  "prepare": "npm run build"
}
```

…and commit src/ (not dist/).

## 🔐 Credentials (Service Account)

1. In GA4 Admin → Property Access Management, add the Service Account email (from your GCP SA JSON) with Viewer or Analyst.
2. In n8n, create credentials of type Google Service Account.
3. Paste the JSON (client_email, private_key, etc.).
4. Use the numeric GA4 Property ID in the node.

## 🚀 Node usage

### Common
- **Binary Property (Input)**: name of the incoming binary property holding your PDF/image (default data).

### Run Report (generic)

Supply the raw GA4 **RunReport** body.
**Example: best hour×weekday by sessions**
```json
{
  "dateRanges": [{ "startDate": "60daysAgo", "endDate": "today" }],
  "dimensions": [{ "name": "hour" }, { "name": "dayOfWeek" }],
  "metrics": [{ "name": "sessions" }]
}
```

### Run Realtime Report

Minimal body (add dimensions if you need them):
```json
{ "metrics": [{ "name": "activeUsers" }] }
```

### Get Metadata

Returns property-scoped dimensions & metrics (handy for building requests dynamically).

### 🕒 Timing helpers (TopK)

All helpers compute (weekday × hour) “buckets” over a **lookback** window and then map them to the **upcoming horizon**.

Common options:
- **Metric for Timing**: screenPageViews, sessions, or engagedSessions
  - Note: When filtering by **Default Channel Group** or **sessionSource(_Medium)**, event-scoped screenPageViews is incompatible → the node auto-uses sessions.

- **Occurrence Mode**:
  - **First occurrence only** (one next slot per bucket)
  - **Expand within horizon (weekly)** (+ optional **maxOccurrences**)
- **Label Time Zone**: IANA TZ (e.g., ```Europe/Berlin```) for human-readable labels
- **Lookback (days), Top K Buckets, Horizon (days ahead)**

**Blog Hours TopK**
- Filters by pagePath CONTAINS /blog (configurable) and optional **Domain** (```hostName```).
- Returns:
  - ```candidates``` (ISO datetimes in UTC)
  - ```labels``` (pretty, TZ-aware)
  - ```buckets``` with ```rank```, ```dow```, ```hour```, ```score```, ```share```

**Page Hours TopK**
- Like Blog, but with customizable ```pathContains``` (e.g., ```/```, ```/academy```, ```/product```) and optional **Domain**.

**Channel Hours TopK**
- Filter by **Default Channel Group** (Organic Social, Email, Referral, …).
- Uses **session-scoped** metric (auto-switches from ```screenPageViews``` to ```sessions``` if needed).

**Source Hours TopK**
- Filter by **sessionSource** (e.g., ```linkedin```, ```t.co```, ```instagram```) or **sessionSourceMedium** (toggle).
- Great for **social timing** planning.

## 🧯 Troubleshooting

### Node doesn’t show up

Ensure N8N_CUSTOM_EXTENSIONS points to the folder where you installed the package.
Restart n8n and search for “prokodo (GA4)”.
Verify your n8n version (≥ 1.103 recommended).

### RunReport has headers but no rows

- GA4 standard reports have **ingestion delay**. Realtime shows immediately; standard may take minutes.
- Check your date range (e.g., ```today``` vs ```yesterday``` / ```last 7 days```).
- Make sure the **propertyId** is correct and **Service Account** has access.

### 403 PERMISSION_DENIED

Add your Service Account **email** as **Viewer/Analyst** at the **Property** level in GA.

### 400 INVALID_ARGUMENT: incompatible dimensions/metrics

Scope mismatch. Examples:
- ```defaultChannelGroup``` (session scoped) × ```screenPageViews``` (event scoped) ❌ → use ```sessions``` or ```engagedSessions```.
- ```sessionSource```/```sessionSourceMedium``` filters also require session-scoped metrics.

### Timezone / DST oddities

The node converts buckets to upcoming dates using IANA TZ and DST-safe math. If labels look off, confirm your **Label Time Zone**.

## 🙌 Contributing

PRs welcome!
```bash
npm ci
npm run build
```

Open a PR with what changed and how to test it.

## 📄 License
This library is published under MIT.

© 2025 prokodo.
Visit us at [prokodo.com](https://www.prokodo.com).