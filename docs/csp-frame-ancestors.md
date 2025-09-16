# Why the browser warns about `frame-ancestors` in a meta Content-Security-Policy

Modern browsers intentionally ignore the `frame-ancestors` directive when it
is delivered via an HTML `<meta http-equiv="Content-Security-Policy">` tag.
`frame-ancestors` is only honored when it is shipped in the HTTP
`Content-Security-Policy` response header, because the directive controls
whether the entire document can be embedded in an iframe. When the policy is
set via markup an attacker that successfully injects HTML into the page could
just remove or alter the tag, so browsers deprecate and ignore the meta form of
`frame-ancestors` ([Chromium tracking issue](https://chromestatus.com/feature/5579556305502208)).

If you see the console warning:

```
The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.
```

it means the page tried to advertise `frame-ancestors` inside HTML. To enforce
framing restrictions you must serve the directive from the origin server. A few
options:

* **Cloudflare Pages / Workers:** add
  `Content-Security-Policy: frame-ancestors 'none';` (or the appropriate allow
  list) in the worker script or Pages Functions response headers.
* **Netlify:** place an `_headers` file in the published folder containing a
  rule such as `/*\n  Content-Security-Policy: frame-ancestors 'none'`.
* **Any other static host or CDN:** configure the platform’s HTTP response
  headers so every HTML page includes the CSP header with the `frame-ancestors`
  directive.

The front-end now includes a JavaScript frame-busting fallback so the page
refuses to render when embedded, but you should still configure the HTTP header
policy for defense in depth and to satisfy modern browser requirements.
