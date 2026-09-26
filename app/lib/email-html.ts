// Sandbox for iframes that render untrusted email HTML. Scripts stay disabled;
// popups are allowed so links can open in a new tab, and they escape the sandbox
// so the destination site behaves normally.
export const EMAIL_IFRAME_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

const BASE_TAG = '<base target="_blank">';

// Opening <a> / <area> tags, tolerating `>` inside quoted attribute values.
const LINK_TAG_RE = /<(a|area)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
const TARGET_OR_REL_ATTR_RE = /\s(?:target|rel)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=[\s/>])/gi;

function forceNewTab(tag: string): string {
  const stripped = tag.replace(TARGET_OR_REL_ATTR_RE, '');
  const selfClosing = stripped.endsWith('/>');
  const end = selfClosing ? -2 : -1;
  const head = stripped.slice(0, end).replace(/\s+$/, '');
  return `${head} target="_blank" rel="noopener noreferrer"${selfClosing ? ' />' : '>'}`;
}

function injectBaseTag(html: string): string {
  // Insert after the opening <head>, <html> or doctype so the document mode is untouched.
  const anchor = /<head\b[^>]*>/i.exec(html) ?? /<html\b[^>]*>/i.exec(html) ?? /<!doctype[^>]*>/i.exec(html);
  if (!anchor) return `${BASE_TAG}${html}`;
  const at = anchor.index + anchor[0].length;
  return `${html.slice(0, at)}${BASE_TAG}${html.slice(at)}`;
}

/**
 * Prepares untrusted email HTML for rendering in a sandboxed iframe so that every
 * link opens in a new tab with no access to window.opener. Links that set their own
 * target (_self, _top, a named frame) are overridden, since navigating the email frame
 * would fail for most sites (X-Frame-Options / frame-ancestors).
 */
export function prepareEmailHtml(html: string): string {
  return injectBaseTag(html.replace(LINK_TAG_RE, forceNewTab));
}
