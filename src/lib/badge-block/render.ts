/** The badge block on a maker's site, and how they install it. Pure. */

const BLOCK_ID = "debutyard-badges";
/** From this many badges the block is a moving strip rather than a row. */
export const MOVING_AT = 6;

const STYLE = `#${BLOCK_ID}{width:100%;margin:48px 0;padding:0 16px;box-sizing:border-box}
#${BLOCK_ID} .debutyard-group{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center}
#${BLOCK_ID} img{max-height:54px;width:auto;height:auto}`;

const movingStyle = (
  seconds: number,
) => `#${BLOCK_ID}.debutyard-moving{overflow:hidden;padding:0;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
#${BLOCK_ID} .debutyard-track{display:flex;width:max-content;animation:debutyard-strip ${seconds}s linear infinite}
#${BLOCK_ID} .debutyard-track:hover,#${BLOCK_ID} .debutyard-track:focus-within{animation-play-state:paused}
#${BLOCK_ID}.debutyard-moving .debutyard-group{flex-wrap:nowrap;padding-right:12px}
@keyframes debutyard-strip{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){#${BLOCK_ID}.debutyard-moving{-webkit-mask-image:none;mask-image:none;padding:0 16px}
#${BLOCK_ID} .debutyard-track{animation:none;width:auto}
#${BLOCK_ID}.debutyard-moving .debutyard-group{flex-wrap:wrap;padding-right:0}
#${BLOCK_ID} .debutyard-copy{display:none}}`;

/**
 * The block's HTML. With no badges it's an empty hidden element: nothing shows,
 * but our install check can still find it in a server-rendered page. Not a
 * comment, which some build tools strip.
 */
export function blockHtml(key: string, badges: string[]): string {
  const items = badges.map((b) => b.trim()).filter(Boolean);
  if (items.length === 0) return `<div hidden style="display:none" data-debutyard-key="${key}"></div>`;
  const row = items.join("");
  if (items.length < MOVING_AT) {
    return `<div id="${BLOCK_ID}" data-debutyard-key="${key}"><style>${STYLE}</style><div class="debutyard-group">${row}</div></div>`;
  }
  // Two identical halves slide left by one half, so the loop has no visible seam.
  const copy = row.replace(/<a /g, '<a tabindex="-1" ');
  return (
    `<div id="${BLOCK_ID}" class="debutyard-moving" data-debutyard-key="${key}"><style>${STYLE}\n${movingStyle(items.length * 4)}</style>` +
    `<div class="debutyard-track"><div class="debutyard-group">${row}</div>` +
    `<div class="debutyard-group debutyard-copy" aria-hidden="true">${copy}</div></div></div>`
  );
}

/**
 * A script that puts the block right before the page's footer, or at the end of
 * the page without one, and puts it back if the page re-renders over it. It
 * stays on the page it loaded on, so a single-page app doesn't carry it around.
 * Empty when there are no badges. The block goes in the page itself, not a
 * shadow root, so tools reading the rendered page can see it.
 */
export function blockScript(html: string, hasBadges: boolean): string {
  if (!hasBadges) return "";
  // Safe to embed: JSON, with the two line separators that JSON allows and older JavaScript doesn't.
  const json = JSON.stringify(html)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `(function(){
  var path=location.pathname;
  function place(){
    var existing=document.getElementById(${JSON.stringify(BLOCK_ID)});
    if(location.pathname!==path){
      if(existing&&existing.parentNode)existing.parentNode.removeChild(existing);
      return;
    }
    if(existing)return;
    var holder=document.createElement("div");
    holder.innerHTML=${json};
    var block=holder.firstElementChild;
    var footers=document.getElementsByTagName("footer");
    var footer=footers[footers.length-1];
    if(footer&&footer.parentNode)footer.parentNode.insertBefore(block,footer);
    else document.body.appendChild(block);
  }
  function start(){
    place();
    new MutationObserver(place).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);
  else start();
})();
`;
}

export type InstallKit = { scriptTag: string; htmlUrl: string; prompt: string };

/** What a maker needs to install their block on their website, by hand or through a coding agent. */
export function installKit(base: string, key: string, websiteUrl: string): InstallKit {
  const scriptTag = `<script src="${new URL(`/badges/${key}.js`, base)}" async></script>`;
  const htmlUrl = new URL(`/badges/${key}.html`, base).toString();
  const prompt = `Add the DebutYard badge block to my website's homepage.

It shows the badges of the directories my product gets listed on. It's empty and shows nothing until the first badge arrives, then it updates by itself, so it has to stay connected to the URLs below.

Use the first option that fits this site:

1. The homepage is rendered on a server for each request (Next.js, Nuxt, SvelteKit, Remix, Astro with a server, Rails, Laravel, Django, PHP and so on): fetch this URL while rendering and output the response as raw HTML, directly before the page's <footer>:
${htmlUrl}
Don't cache the response for longer than a minute. If the fetch fails, output nothing and let the page render normally. The block must be in the HTML the server sends, so don't fetch it in the browser.

2. Anything else (a static site, a client-rendered app or a site builder): add this tag to the homepage's HTML, just before </body>:
${scriptTag}

Rules:
- Homepage only, not every page.
- Don't copy the block's contents into the code, proxy it or restyle it.
- If the site has a Content Security Policy, allow what the option you chose needs: the script's host in script-src, https: in img-src, and 'unsafe-inline' or a matching hash in style-src for the block's small style tag.

When the code is in place, check that the homepage's HTML output contains "${key}". Run the site locally if you can. If you can't, check the code and tell me you couldn't test it.

Then follow this project's usual way of shipping. Don't commit, push, merge or deploy unless I've asked you to or it's already part of how we work here.

Finish by telling me:
1. What you changed.
2. Whether you were able to test it.
3. What's left before it's live at ${websiteUrl}, such as reviewing a PR, merging or deploying. If it's already live, say so.

Once it's live at that address, I need to click "Check my site" on DebutYard. A local copy or preview link won't pass that check.`;
  return { scriptTag, htmlUrl, prompt };
}
