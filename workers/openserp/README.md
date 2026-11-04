# OpenSERP

Our own Google search for outreach research, from [OpenSERP](https://github.com/karust/openserp) running a real browser. No per-search cost.

OpenSERP has no login, and can fetch URLs and use proxies on request. So it has **no public domain**. Only the screenshot worker reaches it, over Railway's private network, and its `POST /search` accepts only a search phrase and a limit.

```
Vercel → worker POST /search (WORKER_SECRET) → openserp.railway.internal:7000
```

## Deploy on Railway

1. In the screenshot worker's Railway project, create a service from this folder (it has a `Dockerfile`). Name it `openserp`, in a US region, because results depend on where the search comes from.
2. Don't generate a public domain for it. Check **Settings → Networking** shows only the private `openserp.railway.internal`.
3. On the screenshot worker, set `OPENSERP_URL=http://openserp.railway.internal:7000` and redeploy it from `workers/screenshot`.
4. Check it from your machine:

   ```bash
   curl -X POST "$WORKER_URL/search" -H "Authorization: Bearer $WORKER_SECRET" -H "Content-Type: application/json" -d '{"text":"best invoicing software","limit":10}'
   ```

   Look for real sites under `results[].url`, with no `google.com/goto` links.

OpenSERP listens on IPv4 only. Railway environments created after October 16, 2025 resolve private names to IPv4 too. An older environment resolves them to IPv6 only and `/search` will return 502, so use a newer environment.

## When Google blocks it

Datacenter addresses get challenged. The worker passes on OpenSERP's 403, 429 and 5xx, and the app treats those, hidden links and empty results as "try again later". A business isn't rejected or marked down over them. The research run stops there and tries again on its next schedule, and the cron's result shows `searchDown`, so look for that in the logs if research goes quiet.

If it's blocked often, set a US residential proxy in `config.yaml` under `proxies.global`. Don't add another engine as a fallback: our emails say who ranks on Google.
