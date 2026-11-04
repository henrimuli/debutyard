# Cloudflare Turnstile for the Domain Rating checker

The checker at `/tools/dr-checker` runs an invisible Cloudflare Turnstile check before every lookup, and the server verifies the token with Cloudflare. Visitors never see a puzzle. Without the keys, production refuses every check, so set them up before deploying.

Turnstile is free, and debutyard.com doesn't need to use Cloudflare for DNS.

## 1. Create the widget

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com). Any Cloudflare account works, including a new free one.
2. In the left sidebar, open **Turnstile**. If you don't see it, use the search box at the top and type "Turnstile".
3. Click **Add widget**.
4. Fill in the form:
   - **Widget name:** `DebutYard Domain Rating checker`. Only you see this.
   - **Hostnames:** add `debutyard.com` and `www.debutyard.com`. Tokens are only valid on the hostnames listed here.
   - **Widget mode:** choose **Invisible**. Cloudflare requires sites using Invisible mode to link the Turnstile Privacy Addendum from their privacy policy; ours does, under "Bot protection" at `/privacy`.
   - **Pre-clearance:** leave it at **No**.
5. Click **Create**.
6. Cloudflare shows two keys. Keep this page open for the next section.
   - **Site Key**, which is public and goes in the page.
   - **Secret Key**, which is private and stays on the server.

## 2. Add the keys to Vercel

1. In Vercel, open the DebutYard project, then go to **Settings → Environment Variables**.
2. Add the two variables:

   | Name | Value | Environments |
   | --- | --- | --- |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the Site Key | Production |
   | `TURNSTILE_SECRET_KEY` | the Secret Key | Production |

3. Optional: add `DR_DAILY_PROVIDER_CAP` to change the site-wide daily limit on score lookups. It defaults to `300`.
4. Redeploy production. Go to **Deployments**, open the menu (**⋯**) on the latest production deployment, and choose **Redeploy**. `NEXT_PUBLIC_…` values are built into the page, so a redeploy is needed for them to take effect.

### Preview deployments

Preview URLs (`*.vercel.app`) aren't on the widget's hostname list, so real keys fail there. Use Cloudflare's test keys for the **Preview** environment instead. These pass every time and are safe to share:

| Name | Preview value |
| --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` |

Local development needs nothing. Leave both variables empty in `.env.local` and the check is skipped.

## 3. Check that it works

1. Open `https://debutyard.com/tools/dr-checker` in a private window and check any domain.
2. You should get a score, and under it a line saying how many checks you have left this hour and today.
3. In Cloudflare, open **Turnstile**, then your widget. The analytics show the challenges solved. They can take a few minutes to appear.

## If checks are refused

The checker says "We couldn't confirm you're not a bot":

- **The hostname isn't listed.** The site's domain must be in the widget's **Hostnames**. Edit the widget in Cloudflare to add it.
- **The keys are swapped.** The Site Key goes in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the Secret Key in `TURNSTILE_SECRET_KEY`.
- **No redeploy since adding the keys.** Redeploy production.
- **A key is missing.** If either variable is empty in production, every check is refused on purpose.
- **Rotating the secret.** In Cloudflare, open the widget's settings and choose **Rotate Secret Key**. Update `TURNSTILE_SECRET_KEY` in Vercel, then redeploy.

## Limits, for reference

| Who | Per hour | Per day |
| --- | --- | --- |
| Signed out, per IP | 5 | 15 |
| Signed in, per account | 15 | 40 |
| Signed in, per IP (all accounts and visitors on it) | 15 | 40 |
| Everyone: provider lookups for scores not already cached | n/a | 300 (`DR_DAILY_PROVIDER_CAP`) |

The API (`POST /api/v1/tools/dr`) and MCP (`check_dr`) skip Turnstile but need an API token, and get the signed-in limits.
