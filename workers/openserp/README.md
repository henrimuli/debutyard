# OpenSERP

Our own Google search for outreach research, from [OpenSERP](https://github.com/karust/openserp) running a real browser. No per-search cost.

OpenSERP has no login, and can fetch URLs and use proxies on request. So it has **no public domain**. Only the screenshot worker reaches it, over Railway's private network, and its `POST /search` accepts only a search phrase and a limit.

```
Vercel → worker POST /search (WORKER_SECRET) → openserp.railway.internal:7000
```

## Deploy on Railway

**Use the same Railway project and environment as the screenshot worker, not a new project.** Railway's private network doesn't reach outside its environment, so a separate project would need a public domain, and this service mustn't have one.

Railway's labels change from time to time, so go by what each step is for if yours look different.

1. **Add the service.** Open the project that holds the screenshot worker, and choose **New**. Pick **GitHub Repo** and this repository if it's offered. If you only see **Empty Service**, use that: it's the same thing with the source connected in step 3.
2. **Name it.** Open the new service, go to **Settings**, and change its name to `openserp`. A new service gets a random name, which you can't set while creating it.
3. **Connect the code.** Still in **Settings**:
   - Under **Service Source**, choose **Connect Repo** and pick this repository, on the `master` branch. Skip this if you started from GitHub Repo.
   - Set **Root Directory** to `/workers/openserp`, so Railway builds the `Dockerfile` in this folder.
   - Set the **region** to a US one, because Google's results depend on where the search comes from.
   - Don't add any variables. The settings are in `config.yaml`.
4. **Deploy.** Railway collects your changes as staged changes, so nothing runs yet. Choose **Deploy** at the top of the canvas and wait for the deployment to go green.
5. **Get the private address.** Go to **Settings → Networking**. Look for the private address ending in `.railway.internal`, and copy it. It's based on the service's name, so it should be `openserp.railway.internal`. If it still has the random name, edit it or use it as shown. If you can't see one yet, check that step 4 finished.
6. **Leave it private.** Don't choose **Generate Domain** on this service. The Networking section should show no public address.
7. **Point the worker at it.** On the **screenshot worker** service, add this variable using your private address from step 5, with `http://` and port `7000`, then deploy:

   ```
   OPENSERP_URL=http://openserp.railway.internal:7000
   ```

   The worker needs the `/search` route, so make sure it has deployed from the latest `master`.

8. **Test it from your machine**, using the worker's public URL and secret:

   ```bash
   curl -X POST "$WORKER_URL/search" -H "Authorization: Bearer $WORKER_SECRET" -H "Content-Type: application/json" -d '{"text":"best invoicing software","limit":10}'
   ```

   You want real sites under `results[].url`. Google often wraps them in `google.com/goto` links. The worker swaps those for the real pages, and when Google limits those lookups it uses the result's site instead, like `https://example.com/`. So some front pages are normal. A result with neither is left out, so a search can return fewer links than Google showed. No `goto` links should be left in the response.

| Response from step 8     | What it means                                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `404`                    | The worker hasn't deployed the latest code.                                                                                                                                                                                                          |
| `503`, no `OPENSERP_URL` | The variable from step 7 isn't set, or the worker wasn't deployed after setting it.                                                                                                                                                                  |
| `502`                    | The worker can't reach OpenSERP, or OpenSERP couldn't run the search. Read the `message`: a browser error means OpenSERP's Chrome won't start, so check its logs and that it has deployed the latest `master`. Otherwise check the address and port. |
| `403` or `429`           | It's all connected, and Google is refusing. See below.                                                                                                                                                                                               |

OpenSERP listens on IPv4 only. Railway environments created after October 16, 2025 resolve private names to IPv4 too. An older environment resolves them to IPv6 only and `/search` will return 502, so use a newer environment.

## When Google blocks it

Datacenter addresses get challenged. The worker passes on OpenSERP's 403, 429 and 5xx, and the app treats those, hidden links and empty results as "try again later". A business isn't rejected or marked down over them. The research run stops there and tries again on its next schedule.

A banner at the top of the outreach pages in the admin dashboard says when this happens. After three failed runs in a row it turns red. It asks for a proxy when Google is refusing, and points you at the Railway services when the error is an HTTP 5xx or the worker can't be reached. It goes away after the next run whose searches work.

To add a proxy, set a US residential one in `config.yaml` under `proxies.global`, then redeploy this service. Don't add another engine as a fallback: our emails say who ranks on Google.
