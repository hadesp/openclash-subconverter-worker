# hadesp OpenClash converter on Workers

This repository contains an independent TypeScript converter, public Full templates and fictional test fixtures. Conversion runs in the user's Cloudflare Worker. It does not delegate conversion to public services, run GitHub Actions as an online server, or install software on a router.

**Deployment acceptance remains closed until the release report says otherwise.** `/version` reports the exact release and acceptance state. Do not replace the OpenClash backend with a test deployment.

The target tested locally is official Mihomo **v1.19.33**. OpenClash **0.48.002** directly appends `?target=clash...` to `convert_address`; its service field must contain the complete `/k/<private-key>/sub` endpoint. A query parameter appended to the service address would interfere with this construction. The private key belongs in the Cloudflare `ACCESS_KEY` secret, never in this repository. Both root `/version` and the authenticated path prefix's `/version` work with the OpenClash version detector and return fewer than 220 characters.

The only router edits in the intended flow are the conversion service endpoint and the remote INI URL:

```
https://raw.githubusercontent.com/hadesp/Custom_OpenClash_Rules/main/cfg/Custom_Clash_Full.ini
```

The companion YAML is a public example with an invalid provider placeholder. It must not be imported as a replacement router configuration or filled by exporting existing subscriptions.

## Conversion behavior

- Executes all ruleset and custom_proxy_group entries in this Full template, including ordered GeoSite/GeoIP rules and remote domain/classical/IP providers. More than 64 rulesets is an explicit error; group count has a separate limit.
- Preserves native proxy fields recursively. Accepts `proxies:` native/Provider YAML, URI lines, Base64 URI subscriptions and up to eight sources merged through OpenClash's URL parameter.
- Renames nodes and updates unambiguous native dialer references; include/exclude, sort, UDP, TFO and explicit certificate-skip requests are handled. URI parameters that cannot be interpreted losslessly are rejected. Native `skip-cert-verify` values are not silently enabled.
- Materializes node membership in the Worker. High multiplier detection is shared between the automatic and high-cost groups; it is not applied to the subscription globally. Manual selection retains high-cost nodes. Empty test groups contain a visible `REJECT` sentinel, with an unavailable-group count response header.
- Retains all upstream 63 groups and adds one high-cost group. The resulting template has 64 groups and 64 rulesets.
- Separates Scholar from 550 deduplicated overseas academic rules. Academic defaults to direct and can be switched manually. See the rules repository's `docs/academic-audit.json` for candidates and exclusions. Two unverified CloudFront names remain quarantined.

## Limits and explicit exclusions

This is a Full-template-compatible backend, not an implementation of every SubConverter output target, arbitrary JavaScript/QuickJS templates, every PCRE extension, or every unstandardized share-link dialect. Unknown options fail explicitly. Only the published hadesp Full template URL is accepted. Nested `proxy-providers` in input configurations currently fail explicitly; native `proxies:` and Provider payload YAML are supported. Force-TLS1.3 is not mapped because that is not a general native Mihomo outbound option. No compatibility claim is made for those excluded paths.

Input is capped at 2 MB per source, 2,000 merged nodes, eight sources, three redirects and 16 KB request URLs. HTTP(S) default ports only. Free Workers CPU and request limits still apply. A successful `-t` checks configuration syntax and initialization, not node connectivity, TLS handshakes, UDP relay, bandwidth or QUIC interoperability.

## Privacy and network security

Cloudflare necessarily processes subscription URLs and returned node data. Tokens do leave the router for this service. Runtime code does not log original requests, subscriptions, upstream bodies or node configurations, does not forward incoming headers, does not use KV/R2/D1, and returns private/no-store cache headers. Observability is disabled. Cloudflare's network/platform and the subscription origin can still process or retain information independently of application code.

The network guard rejects private, loopback, link-local, special-purpose, metadata, malformed/encoded IP and invalid host destinations; validates A/AAAA results; checks every manual redirect; and caps response bytes and time. **DNS preflight is not DNS pinning.** Production acceptance requires a documented decision on DNS rebinding and edge egress enforcement; unit tests alone do not establish that property. The acceptance gate is intentional. The rate limiter is approximately 20 conversions/minute per Cloudflare location, not a strict global counter. Its key is a constant label, not a subscription or IP address.

Direct routing and bypassing the Mihomo kernel are different. `cnki.net`, `wanfangdata.com.cn`, `edu.cn`, `ac.cn` and other Chinese academic domains rely on the router's existing mainland-bypass/DNS/IP conditions. These two subscription fields cannot enable that setting. No router bypass setting was changed by this project.

## Verification and maintenance

`npm ci`, `npm test`, `npm run check`, `npm run build`, and `node scripts/scan-public.mjs` run the self-contained checks. Full binary validation uses `scripts/validate-mihomo.ts`, official Mihomo v1.19.33, pinned upstream source fixtures and GeoSite/GeoIP databases. Reports state source SHAs, binary version, fixture results and unverified connectivity separately.

The rules fork retains its upstream association and CC BY-SA license. Before syncing upstream, merge on a maintenance branch, rerun `scripts/prepare-rules.mjs` and `scripts/static-yaml.ts`, inspect the academic audit and counts, then run both repositories' CI. Do not overwrite the personalized template with an upstream force sync.

Cloudflare Git integration should build only `main`, run the project tests/type check/public scan before `wrangler deploy`, and keep `ACCESS_KEY` in runtime Secrets. Repository source contains no Cloudflare API token. Release and deployment IDs are recorded in the acceptance report. Roll back using `wrangler rollback <previous-version-id>` against `hadesp-subconverter`; then revert or fix the main commit so the next automatic deployment does not restore the regression. Rollback does not rotate secrets.

## Attribution and licenses

Worker code: GPL-3.0-only; `LICENSE` contains the license. Protocol/API behavior was checked against [Mihomo](https://github.com/MetaCubeX/mihomo), [OpenClash](https://github.com/vernesong/OpenClash), and [SubConverter-Extended](https://github.com/Aethersailor/SubConverter-Extended). No native service or CGO bridge is claimed to run in Workers.

Full template assets under `templates/`: adapted from [Aethersailor/Custom_OpenClash_Rules](https://github.com/Aethersailor/Custom_OpenClash_Rules), CC BY-SA 4.0, with hadesp academic and multiplier modifications. Domain-list data: [v2fly/domain-list-community](https://github.com/v2fly/domain-list-community), MIT. These separate data assets retain their respective licenses; see `docs/licenses/`.
