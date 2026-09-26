import { EMAIL_IFRAME_SANDBOX, prepareEmailHtml } from '@/lib/email-html';

describe('EMAIL_IFRAME_SANDBOX', () => {
  const tokens = EMAIL_IFRAME_SANDBOX.split(' ');

  test('allows popups and lets them escape the sandbox', () => {
    expect(tokens).toContain('allow-popups');
    expect(tokens).toContain('allow-popups-to-escape-sandbox');
  });

  test('keeps same-origin so the frame height can be measured', () => {
    expect(tokens).toContain('allow-same-origin');
  });

  test('never allows scripts', () => {
    expect(tokens).not.toContain('allow-scripts');
  });
});

describe('prepareEmailHtml', () => {
  test('adds target and rel to links', () => {
    const out = prepareEmailHtml('<p><a href="https://example.com">x</a></p>');
    expect(out).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>');
  });

  test('overrides existing target and rel values', () => {
    const out = prepareEmailHtml('<a target="_top" href="https://e.com" rel="opener">x</a>');
    expect(out).not.toContain('_top');
    expect(out).not.toContain('opener"');
    expect(out.match(/target=/g)).toHaveLength(2); // one on the tag, one on <base>
    expect(out).toContain('target="_blank" rel="noopener noreferrer">x</a>');
  });

  test('overrides single-quoted and unquoted target values', () => {
    expect(prepareEmailHtml("<a href='https://e.com' target='_self'>x</a>")).not.toContain('_self');
    expect(prepareEmailHtml('<a href=https://e.com target=_parent>x</a>')).not.toContain('_parent');
  });

  test('handles links with > inside a quoted attribute value', () => {
    const out = prepareEmailHtml('<a title="a > b" href="https://e.com">x</a>');
    expect(out).toContain('<a title="a > b" href="https://e.com" target="_blank" rel="noopener noreferrer">x</a>');
  });

  test('is case-insensitive for tag and attribute names', () => {
    const out = prepareEmailHtml('<A HREF="https://e.com" TARGET="_top">x</A>');
    expect(out).not.toContain('_top');
    expect(out).toContain('target="_blank" rel="noopener noreferrer"');
  });

  test('handles image-map <area> links', () => {
    const out = prepareEmailHtml('<map><area href="https://e.com" target="_top"></map>');
    expect(out).toContain('<area href="https://e.com" target="_blank" rel="noopener noreferrer">');
  });

  test('handles self-closing area tags', () => {
    const out = prepareEmailHtml('<area href="https://e.com" />');
    expect(out).toContain('<area href="https://e.com" target="_blank" rel="noopener noreferrer" />');
  });

  test('does not touch other elements whose names start with a', () => {
    const html = '<abbr title="x">a</abbr><address>b</address><article>c</article>';
    const out = prepareEmailHtml(html);
    expect(out).not.toContain('rel=');
    expect(out).toContain(html);
  });

  test('does not touch target or rel on non-link elements', () => {
    const out = prepareEmailHtml('<form target="_top"><link rel="stylesheet" href="x.css"></form>');
    expect(out).toContain('<form target="_top">');
    expect(out).toContain('<link rel="stylesheet" href="x.css">');
  });

  test('prepends a base tag to a fragment', () => {
    expect(prepareEmailHtml('<p>hi</p>')).toBe('<base target="_blank"><p>hi</p>');
  });

  test('inserts the base tag inside head when present', () => {
    const out = prepareEmailHtml('<!DOCTYPE html><html><head><title>t</title></head><body></body></html>');
    expect(out).toContain('<head><base target="_blank"><title>');
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  test('inserts the base tag after <html> when there is no head', () => {
    const out = prepareEmailHtml('<html lang="en"><body>x</body></html>');
    expect(out).toBe('<html lang="en"><base target="_blank"><body>x</body></html>');
  });

  test('keeps the doctype first when there is no html or head tag', () => {
    const out = prepareEmailHtml('<!DOCTYPE html><p>x</p>');
    expect(out).toBe('<!DOCTYPE html><base target="_blank"><p>x</p>');
  });

  test('leaves html without links otherwise unchanged', () => {
    expect(prepareEmailHtml('')).toBe('<base target="_blank">');
  });

  test('is idempotent for link attributes', () => {
    const once = prepareEmailHtml('<a href="https://e.com">x</a>');
    const twice = prepareEmailHtml(once);
    expect(twice.match(/rel="noopener noreferrer"/g)).toHaveLength(1);
    expect(twice.match(/<a [^>]*>/g)?.[0].match(/target=/g)).toHaveLength(1);
  });
});
