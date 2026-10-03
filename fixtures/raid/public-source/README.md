# Recorded public source inputs

These are inert, unmodified UTF-8 source inputs acquired on 2026-10-03 at approximately 03:20 UTC. Tests read them locally; they never execute scripts, fetch source resources or claim browser/pixel verification.

- `books.html`: `https://books.toscrape.com/`, 51,294 bytes, SHA-256 `9fdd63da34161ebd13408d7a85105f83ec3c9f351c5d77cd0aa578790e121c1e`
- `books.css`: the one reviewed stylesheet, `https://books.toscrape.com/static/oscar/css/styles.css`, 215,100 bytes, SHA-256 `d497d4a0d52686ccd30f5941b02867075870372cdfe37adbcb0be74fdeed94cf`
- `example.html`: `https://example.com/`, 577 bytes, SHA-256 `25ddf2c883e0d1958ea971d279a7e4f0fd446724ee3db7db19dadabd4a62e484`

Books is the public scraping practice source already allowlisted by the service. Its original stylesheet comments and licensing notices remain intact. The observed Example response (HTTP 200, `text/html; charset=utf-8`) contains only explanatory paragraph text and a script; it has no supported static combat element. This records the response received by this environment, not independent proof of an upstream site change or the response another client would receive. Its test expects `no-playable-elements`, without fabricating a heading or running the script. Being an allowlisted acquisition source does not guarantee playable static content.

The product-price/availability regression verifies inferred, approximate appearance data and exact reward identity. It is not visual acceptance or a source screenshot comparison.

The Books HTML retains upstream whitespace byte for byte so its acquisition hash remains meaningful. `.gitattributes` disables whitespace lint for this one immutable fixture only; application code and other source files still use normal whitespace checks.
