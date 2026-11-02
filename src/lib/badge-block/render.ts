/** The badge block a maker's site shows. Pure. */

const BLOCK_ID = "debutyard-badges";
const BLOCK_STYLE = "display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;margin:48px auto";

/** The block's HTML, or nothing at all when there are no badges, so an empty block never shows. */
export function blockHtml(badges: string[]): string {
  const items = badges.map((b) => b.trim()).filter(Boolean);
  if (items.length === 0) return "";
  return `<div id="${BLOCK_ID}" style="${BLOCK_STYLE}">${items.join("")}</div>`;
}

/**
 * A script that puts the block right before the site's footer, or at the end of
 * the page without one. Empty when there are no badges. The block goes in the
 * page itself, not a shadow root, so tools reading the rendered page can see it.
 */
export function blockScript(html: string): string {
  if (!html) return "";
  // Safe to embed: JSON, with the two line separators that JSON allows and older JavaScript doesn't.
  const json = JSON.stringify(html)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `(function(){
  function place(){
    if(document.getElementById(${JSON.stringify(BLOCK_ID)}))return;
    var holder=document.createElement("div");
    holder.innerHTML=${json};
    var block=holder.firstChild;
    var footers=document.getElementsByTagName("footer");
    var footer=footers[footers.length-1];
    if(footer&&footer.parentNode)footer.parentNode.insertBefore(block,footer);
    else document.body.appendChild(block);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",place);
  else place();
})();
`;
}
