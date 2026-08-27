# Dependency audit, 2026-08

Read on 2026-08-27. Nothing was upgraded, installed into, or removed from any project
environment. Every version claim below is a measurement, and every measurement names the
command or file it came from.

## Method and exact invocations

Two throwaway virtual environments were created outside the repository, under the session
scratchpad, and neither `backend/.venv` nor `frontend/node_modules` was written to.

| What | Where | Why |
| --- | --- | --- |
| `auditvenv` | Python 3.12.10, `pip install pip-audit` | runs `pip-audit` and the PyPI/OSV/GitHub queries |
| `resolve313` | Python 3.13.12, empty | `pip install --dry-run` resolution probes on the CI/production Python minor |

Backend vulnerability scan, against the **pinned file**, not against anything installed:

```
<scratchpad>/auditvenv/Scripts/python.exe -m pip_audit \
  -r C:/Users/marlo/GitHub/deepscroll/backend/requirements.txt \
  --no-deps --desc --format json
```

`pip-audit` version 2.10.1, the version pinned in `backend/requirements-dev.txt`. `--no-deps`
audits exactly the 69 lines in the file rather than re-resolving them; `pip-audit` confirmed
`packages audited: 69`, matching the 69 pins the file claims. The run without `--no-deps` was
also performed and produced the identical finding set.

This is not the same as auditing what is installed. `backend/.venv` on this laptop currently
has `cryptography 48.0.0` (pin says `48.0.1`) and `google-auth 2.57.0` (pin says `2.56.2`),
measured with `backend/.venv/Scripts/python.exe -c "import cryptography; print(...)"` and
`.venv/Lib/site-packages/google_auth-2.57.0.dist-info/`. The local venv predates the pinning
commit and was never reinstalled. Auditing it would have reported a different, wrong answer.

Frontend:

```
cd frontend && npm audit --json          # full tree, npm 11.13.0, node v24.16.0
cd frontend && npm audit --omit=dev      # production subset
cd frontend && npm outdated --json
cd frontend && npm ls <pkg> --all        # to attribute each finding to a dependency path
```

Distance-from-current for the backend came from the PyPI JSON API (`/pypi/<name>/json`,
`info.version`) for all 69 pins. Severities are the GitHub Security Advisory qualitative
ratings read from OSV (`https://api.osv.dev/v1/vulns/<GHSA>`, `database_specific.severity`),
because `pip-audit` does not report severity.

---

## 1. Known vulnerabilities, backend

`pip-audit` reported **32 findings in 6 packages**. Those 32 are **23 distinct advisories**:
the tool emits some advisories twice (Pillow 7 of them, `pyasn1` 1, `starlette` 1) because
the same vulnerability is carried in more than one source database. The table below is the
23 distinct ones.

**None of the 23 requires a major version bump.** Every fix is available inside the current
major, or in `cryptography`'s case a two-major bump is *available* but only one of the three
`cryptography` findings actually needs it. That split is in section 1b.

### 1a. Findings, no major bump required

| Package | Pinned | Advisory | Severity | What it is | Min fixed |
| --- | --- | --- | --- | --- | --- |
| pillow | 12.2.0 | PYSEC-2026-3493 / CVE-2026-54058 | HIGH | McIdas AREA plugin builds memory-mapped row pointers without checking `stride >= xsize*pixelsize`, giving an out-of-bounds read of the mapping | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-3494 / CVE-2026-59198 | MODERATE | TGA RLE encoder reads past the packed row buffer when saving a mode `"1"` image, copying adjacent heap bytes into the output file | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-3495 / CVE-2026-59200 | HIGH | `PdfParser.PdfStream.decode()` passes the PDF `Length` field to `zlib.decompress(bufsize=...)` with no output cap, so ~950 KB inflates to 1 GB | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-3496 / CVE-2026-59204 | HIGH | JPEG2000 decoder accumulates `total_component_width` across tiles instead of per tile, growing the buffer to a full image per small tile | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-3451 / CVE-2026-59199 | HIGH | `Image.paste()`, `Image.crop()` and `Image.alpha_composite()` write out of bounds on coordinates near the signed 32-bit limit | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-3452 / CVE-2026-59203 | MODERATE | EPS parser accepts a negative byte count in `%%BeginBinary`, seeking backwards forever on `Image.open()` | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-3453 / CVE-2026-59205 | HIGH | `ImageCms.ImageCmsTransform.apply(im, imOut)` corrupts the native heap when the output image mode does not match the transform | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-3454 / CVE-2026-59197 | HIGH | `ImageFilter.RankFilter` expands before validating filter size, and `ImagingExpand()` computes dimensions with unchecked signed int arithmetic | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-2253 / CVE-2026-54059 | HIGH | PCF font `_load_bitmaps()` passes METRICS glyph dimensions to `Image.frombytes()` with no decompression-bomb check | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-2254 / CVE-2026-54060 | HIGH | `FontFile.compile()` allocates the combined glyph bitmap with no decompression-bomb check | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-2255 / CVE-2026-55379 | HIGH | BDF font `bdf_char()` passes attacker-controlled BBX width/height to `Image.new()` with no bomb check | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-2256 / CVE-2026-55380 | HIGH | `GdImageFile._open()` takes dimensions from the GD 2.x header with no bomb check | 12.3.0 |
| pillow | 12.2.0 | PYSEC-2026-2257 / CVE-2026-55798 | MODERATE | `WindowsViewer.get_command()` interpolates a path into a `cmd.exe` string passed to `Popen(shell=True)` | 12.3.0 |
| starlette | 1.2.1 | PYSEC-2026-249 / CVE-2026-54283 | HIGH | `request.form()`'s `max_fields` / `max_part_size` limits are enforced for multipart but silently ignored for `application/x-www-form-urlencoded` | 1.3.1 |
| starlette | 1.2.1 | PYSEC-2026-248 / CVE-2026-54282 | LOW | a request path not starting with `/` moves the authority boundary when `request.url` is re-parsed, so `request.url.hostname` becomes attacker-controlled | 1.3.0 |
| pyasn1 | 0.6.3 | PYSEC-2026-3455 / CVE-2026-59884 | HIGH | BER long-form tag parsing accumulates continuation octets unbounded; quadratic CPU and an unhandled `ValueError` on 3.11+ | 0.6.4 |
| pyasn1 | 0.6.3 | PYSEC-2026-3456 / CVE-2026-59885 | HIGH | OBJECT IDENTIFIER / RELATIVE-OID decode and encode are quadratic in the number of arcs | 0.6.4 |
| pyasn1 | 0.6.3 | PYSEC-2026-3457 / CVE-2026-59886 | HIGH | `univ.Real` converts mantissa/base/exponent with exact big-integer exponentiation, so a few bytes hang `str()`, comparison or `float()` | 0.6.4 |
| h2 | 4.3.0 | PYSEC-2026-3628 / CVE-2026-71554 | MODERATE | accepts and forwards more than one `Host` header, a request-smuggling primitive (CWE-444) once downgraded to HTTP/1.1 | 4.4.1 |
| cryptography | 48.0.1 | PYSEC-2026-3553 / CVE-2026-69249 | HIGH | `build_chain_inner` does not de-duplicate candidates, so duplicate self-signed certs in an invalid chain cause exponential blowup (>5 s to reject) | 49.0.0 |
| cryptography | 48.0.1 | PYSEC-2026-3554 / CVE-2026-69248 | MODERATE | a leaf SAN of `*.example.com` is accepted under an intermediate constrained to `foo.example.com`, escaping the name constraint | 49.0.0 |
| ecdsa | 0.19.2 | PYSEC-2026-1325 / CVE-2024-23342 | HIGH | Minerva timing attack on P-256: timing `SigningKey.sign_digest()` leaks the nonce and can recover the private key. Affects ECDSA signing, key generation and ECDH; verification is unaffected | **none** |

`ecdsa` is the one finding with no fix version at all. The project states side-channel
attacks are out of scope and there is no planned fix. This is already recorded as accepted in
`backend/requirements.txt`, and section 5 strengthens that argument with a measurement the
existing comment does not make.

### 1b. Findings that require a major version bump

One, and only one:

| Package | Pinned | Advisory | Severity | What it is | Min fixed |
| --- | --- | --- | --- | --- | --- |
| cryptography | 48.0.1 | PYSEC-2026-3552 / CVE-2026-69247 | HIGH | `pkcs7_decrypt_der` / `_pem` / `_smime` reported distinguishable errors and timing when unwrapping a `RecipientInfo`'s `encryptedKey`, one variant disclosing the recovered RSA length: a Bleichenbacher oracle for callers that decrypt untrusted `EnvelopedData` | **50.0.0** |

Source: `cryptography` `CHANGELOG.rst`, entry `50.0.0 - 2026-07-31`, marked `**SECURITY
ISSUE**`, "Introduced in 44.0.0. Fixed in 50.0.0."

So the `cryptography` picture is: two of its three findings are fixed by 49.0.0, one needs
50.0.0. All three concern PKCS#7 decryption and X.509 path validation. Section 5 establishes
that this codebase calls neither.

### Reachability, measured rather than assumed

The count above is the advisory count, not the exposure. Where user-controlled bytes reach
these libraries was checked by reading the call sites.

**Pillow.** The only path from a request body to Pillow is `validate_image()` in
`backend/app/sanitize.py:83`. It applies a magic-byte allowlist *before* Pillow is touched:
`_MAGIC` at `backend/app/sanitize.py:69-74` admits only `\xff\xd8\xff` (JPEG), `\x89PNG`,
`GIF87a`, `GIF89a`, plus a `RIFF....WEBP` check at line 107-109; anything else raises
`"Unknown or invalid file type"` at line 110. Pillow selects its plugin from the same header
bytes, so a file that clears this gate is handled by the JPEG, PNG, GIF or WebP plugin.

That excludes, by header, the plugins named in nine of the thirteen Pillow advisories: PCF
(2253), BDF (2255), the generic `FontFile.compile` path (2254), GD (2256), EPS (3452),
PDF (3495), JPEG2000 (3496), McIdas (3493) and the Windows viewer (2257). PYSEC-2026-3493
additionally requires `Image.open` on a *filename*, and every call in `validate_image` uses
`Image.open(BytesIO(file_bytes))` (`sanitize.py:114`, `sanitize.py:139`).

The remaining four are geometry and filtering APIs the code does call:
`background.paste(...)` at `sanitize.py:34`, and in the thumbnail renderer
`image.paste`/`crop`/`alpha_composite` (`app/thumbnails/render.py:545,576,721,849-851`,
`app/thumbnails/concept.py:342,474`, `app/thumbnails/figures.py:312-314`) and
`ImageFilter.MaxFilter` at `app/thumbnails/render.py:837`. Their triggers are coordinates near
the signed 32-bit limit (3451) and a very large odd filter size (3454). In `validate_image`
the pixel count is capped at `MAX_IMAGE_PIXELS = 30_000_000` (`sanitize.py:15,122`) before
decode and the image is then thumbnailed to 2048x2048 (`sanitize.py:145,152,159,165`); in the
thumbnail pipeline the coordinates and filter sizes are computed from internal layout, not
from a request. The TGA advisory (3494) needs `save(format="TGA")`, which appears nowhere.

Conclusion: thirteen Pillow advisories, none of them presently reachable from a request. That
is a reason to treat the Pillow bump as cheap hygiene rather than urgent, not a reason to skip
it: the gate is one `_MAGIC` edit away from admitting a new format.

**starlette.** Both findings are unreachable as written.
`grep -rnE "request\.url|\.url\.hostname|\.url\.netloc" backend/app` returns nothing, so
CVE-2026-54282 has no consumer. `grep -rnE "\.form\(|max_fields|max_part_size"` also returns
nothing: the three upload endpoints (`app/routers/auth.py:443`, `app/routers/uploads.py:19`,
`app/routers/uploads.py:53`) use FastAPI's `UploadFile = File(...)`, which is multipart, and
multipart is the half where the limits *are* enforced. The urlencoded hole is the unenforced
half.

**h2.** Pulled in by `httpx[http2]`, required by `supabase-auth 2.31.0`
(`Requires-Dist: httpx[http2]<0.29,>=0.26`). It is a client-side HTTP/2 stack talking to
Supabase; the advisory is about a server accepting duplicate `Host` headers from a client. The
backend's own HTTP/2 termination is not h2.

**pyasn1.** Decodes untrusted ASN.1 only inasmuch as `rsa`/`pyasn1_modules` parse Google's
signing certificates during Google sign-in. Those certificates come from
`https://www.googleapis.com/oauth2/v1/certs` over TLS, not from the caller.

---

## 2. Known vulnerabilities, frontend

`npm audit` on `frontend/package-lock.json`: **7 vulnerabilities, 1 moderate and 6 high**,
across a tree of 555 packages (114 prod, 406 dev, 112 optional). `npm audit --omit=dev`
reports **5**.

That 7-versus-5 split is npm's, and it is not the split that matters. npm counts `postcss` and
`nanoid` as production because `next` depends on them, but both run only at build time. The
grouping below is the one to read.

### Shipped to the browser

| Package | Installed | Advisory | Severity | What it is | Min fixed |
| --- | --- | --- | --- | --- | --- |
| next | 16.2.6 | GHSA-q8wf-6r8g-63ch | HIGH | Denial of service in the Image Optimization API using SVGs | 16.2.11 |
| next | 16.2.6 | GHSA-955p-x3mx-jcvp | HIGH | Unauthenticated disclosure of internal Server Function endpoints | 16.2.11 |
| next | 16.2.6 | GHSA-p9j2-gv94-2wf4 | HIGH | SSRF in rewrites via an attacker-controlled destination hostname | 16.2.11 |
| next | 16.2.6 | GHSA-89xv-2m56-2m9x | HIGH | SSRF in Server Actions on custom servers | 16.2.11 |
| next | 16.2.6 | GHSA-68g3-v927-f742 | HIGH | Cache confusion of response bodies for requests with bodies | 16.2.11 |
| next | 16.2.6 | GHSA-4633-3j49-mh5q | HIGH | Cache confusion for request bodies containing invalid UTF-8 | 16.2.11 |
| next | 16.2.6 | GHSA-4c39-4ccg-62r3 | HIGH | Unbounded Server Action payload in the Edge runtime | 16.2.11 |
| next | 16.2.6 | GHSA-m99w-x7hq-7vfj | HIGH | Denial of service in the App Router using Server Actions | 16.2.11 |
| next | 16.2.6 | GHSA-6gpp-xcg3-4w24 | HIGH | Middleware / proxy bypass in App Router apps using Turbopack with a single locale | 16.2.11 |
| protobufjs | 7.6.4 | GHSA-j3f2-48v5-ccww | MODERATE (CVSS 5.3) | infinite loop parsing `.proto` options | 7.6.5 |
| sharp | 0.34.5 | GHSA-f88m-g3jw-g9cj | HIGH | inherited libvips issues CVE-2026-33327, -33328, -35590, -35591 | 0.35.0 |

`next` is a direct dependency. `sharp@0.34.5` is `next`'s image optimizer
(`npm ls sharp --all`: `frontend -> next@16.2.6 -> sharp@0.34.5`). `protobufjs@7.6.4` arrives
via `frontend -> @diffusionstudio/vits-web@1.0.3 -> onnxruntime-web@1.18.0 -> protobufjs@7.6.4`
and is genuinely shipped: `src/lib/readAloud/piper.ts:21` does
`await import("@diffusionstudio/vits-web")` in the browser.

Of the nine `next` advisories, six describe surface this app does not have.
`grep -rn "'use server'" src/` returns nothing, so the four Server Action / Server Function
advisories have no consumer. There is no `src/middleware.ts` and no `rewrites` in
`next.config.ts` (checked by reading the whole file), which removes the middleware-bypass and
the rewrite SSRF. The one that clearly does apply is the Image Optimization SVG DoS:
`next.config.ts` enables the optimizer in production (`unoptimized:` is true only in
development) with `remotePatterns` for `**.supabase.co`, `commons.wikimedia.org`,
`upload.wikimedia.org` and `http://localhost`. That is also the path `sharp` sits on.

Note the frontend is deployed on Vercel, which runs its own image optimization rather than the
`sharp` in this lockfile. Whether the `sharp` advisory reaches production therefore depends on
the platform, and I did not verify what Vercel runs (see the closing section).

### Build-time and development only

| Package | Installed | Advisory | Severity | What it is | Min fixed | Reached via |
| --- | --- | --- | --- | --- | --- | --- |
| postcss | 8.5.16 | GHSA-fxqj-rqcc-2cmp | HIGH | incomplete fix of GHSA-6g55-p6wh-862q: an attacker-controlled `sourceMappingURL` reads arbitrary `.map` files when `from` is unset | >8.5.22 | `next` and `@tailwindcss/postcss`, both build-time |
| postcss | 8.5.16 | GHSA-r28c-9q8g-f849 | HIGH (CVSS 7.5) | path traversal in previous-source-map auto-loading, disclosing arbitrary `.map` files | >8.5.17 | as above |
| nanoid | 3.3.12 | GHSA-2v37-7h3g-55p8 | HIGH (CVSS 5.9) | custom generators loop indefinitely when size is zero | 3.3.18 | `@tailwindcss/postcss -> postcss -> nanoid` |
| nanoid | 3.3.12 | GHSA-28wg-ghj8-5hjv | HIGH (CVSS 5.9) | non-secure generators loop indefinitely with a negative size | 3.3.16 | as above |
| js-yaml | 4.3.0 | GHSA-5p4m-2wfm-xmqj | HIGH (CVSS 7.5) | quadratic CPU in `!!omap` resolution; the CVE-2026-59870 fix was not backported | 4.3.1 | `eslint@9.39.4 -> @eslint/eslintrc -> js-yaml` |
| brace-expansion | 1.1.15 / 5.0.6 | GHSA-rgw5-rvv9-x895 | HIGH (CVSS 7.5) | DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation | 1.1.18 / 5.0.9 | `eslint -> minimatch@3.1.5`; `eslint-config-next -> typescript-eslint -> minimatch@10.2.5` |
| brace-expansion | 1.1.15 / 5.0.6 | GHSA-mh99-v99m-4gvg | HIGH (CVSS 7.5) | DoS via unbounded expansion length causing an OOM crash | 1.1.17 / 5.0.8 | as above |
| brace-expansion | 1.1.15 | GHSA-3jxr-9vmj-r5cp | MODERATE (CVSS 5.3) | DoS via exponential-time expansion of consecutive non-expanding `{}` groups | 1.1.16 | as above |

Every one of these takes as input a file the repository itself supplies: a stylesheet, an
ESLint config, a glob. There is no untrusted input, so these are hygiene items, not exposure.
`brace-expansion` and `js-yaml` reach the tree only through `eslint`, which per the CI notes
is deliberately not a gate and does not run in `frontend-checks` at all.

Two of these already have an `overrides` entry in `frontend/package.json`
(`"js-yaml": "^4.1.2"`, `"postcss": "^8.5.10"`) and are still vulnerable, because both
overrides are caret ranges whose floor is below the fix and the lockfile resolved to
`js-yaml@4.3.0` (fix is 4.3.1) and `postcss@8.5.16` (fix is >8.5.22). The overrides work; the
floors are stale.

---

## 3. How far behind is each package

### Backend, 69 pins against PyPI `info.version` on 2026-08-27

**Major** (2):

| Package | Pinned | Latest | Note |
| --- | --- | --- | --- |
| cryptography | 48.0.1 | 50.0.1 | two majors; see section 4 |
| websockets | 15.0.1 | 17.1 | two majors, and **blocked**; see section 4 |

**Minor** (17):

| Package | Pinned | Latest | Note |
| --- | --- | --- | --- |
| fastapi | 0.136.3 | 0.141.1 | 0.x, so a minor bump is a breaking bump by that project's own convention |
| uvicorn | 0.49.0 | 0.52.4 | same 0.x caveat |
| starlette | 1.2.1 | 1.6.0 | security-relevant: fixes at 1.3.0 and 1.3.1 |
| Pillow | 12.2.0 | 12.3.0 | security-relevant: fixes all 13 findings |
| h2 | 4.3.0 | 4.4.1 | security-relevant; requires hpack |
| hpack | 4.1.0 | 4.2.0 | only needed as h2's floor |
| google-auth | 2.56.2 | 2.57.0 | |
| anyio | 4.13.0 | 4.14.2 | |
| cffi | 2.0.0 | 2.1.1 | |
| charset-normalizer | 3.4.9 | 3.5.1 | |
| click | 8.4.1 | 8.5.0 | |
| certifi | 2026.5.20 | 2026.7.22 | CA bundle; date-versioned |
| idna | 3.18 | 3.19 | |
| packaging | 26.2 | 26.3 | |
| typing_extensions | 4.15.0 | 4.16.0 | |
| annotated-types | 0.7.0 | 0.8.0 | |
| pydantic_core | 2.46.4 | 2.48.0 | **not a real gap**: `pydantic 2.13.4` declares `pydantic-core==2.46.4` exactly, and 2.13.4 is the latest pydantic. 2.48.0 belongs to an unreleased pydantic. Do not bump this row. |

**Patch-only** (8), as one line: `annotated-doc 0.0.4 -> 0.0.5`, `greenlet 3.5.1 -> 3.5.5`,
`lxml 6.1.1 -> 6.1.2`, `pyasn1 0.6.3 -> 0.6.4` (security), `python-dotenv 1.2.2 -> 1.2.3`,
`sqlalchemy 2.0.50 -> 2.0.52`, `typing-inspection 0.4.2 -> 0.4.4`, `yarl 1.24.2 -> 1.24.5`.

**Already current** (42): bcrypt, contourpy, cycler, defusedxml, deprecation, dnspython,
ecdsa, email-validator, fonttools, h11, httpcore, httptools, httpx, hyperframe, kiwisolver,
matplotlib, multidict, numpy, postgrest, propcache, psycopg2-binary, pyasn1_modules, pycparser,
pydantic, PyJWT, pyparsing, python-dateutil, python-jose, python-multipart, PyYAML, realtime,
requests, rsa, six, storage3, StrEnum, supabase, supabase-auth, supabase-functions, urllib3,
uvloop, watchfiles.

So: 2 major, 17 minor of which 1 is illusory, 8 patch, 42 already current. Sixty-one percent of
the pinned set is at head. The freeze captured a set that was mostly recent.

### Verdict on `cryptography`, since that was the specific ask

Two majors behind on the library that does the encryption sounds worse than it is here, for a
reason worth stating precisely rather than hand-waving.

`cryptography` is not a direct dependency of this backend. `grep -rn "import.*cryptograph"` over
all non-`.venv` Python returns **nothing**. It is present because `python-jose[cryptography]`
requests it and because `supabase-auth` requires `pyjwt[crypto]`. Both declare
`cryptography>=3.4.0` with no upper bound (read from
`.venv/Lib/site-packages/python_jose-3.5.0.dist-info/METADATA` and
`pyjwt-2.13.0.dist-info/METADATA`).

What this backend actually uses it for is HMAC-SHA256, and only that. With `cryptography`
installed, `jose/backends/__init__.py` binds `HMACKey` to `CryptographyHMACKey` rather than the
pure-Python fallback, and `jose/jwk.py:34-35` routes `HS256` (in `ALGORITHMS.HMAC`, defined at
`jose/constants.py:52`) to that class. `CryptographyHMACKey` at
`.venv/Lib/site-packages/jose/backends/cryptography_backend.py:519-525` maps HS256/384/512 to
`hashes.SHA256/384/512`. The RSA verification on the Google sign-in path also goes through it,
via `google.auth.crypt.RSAVerifier`.

All three `cryptography` findings are in PKCS#7 decryption (CVE-2026-69247) and X.509 path
validation, name constraints and chain building (CVE-2026-69248, CVE-2026-69249). None of them
touches HMAC or RSA signature verification. **Two majors behind, and zero of the three findings
is reachable.** The bump is worth doing, but it is hygiene, not a fire, and it should be argued
that way rather than on the version number.

### Frontend, direct dependencies

`npm outdated` lists only what is behind; a direct dependency absent from its output is at
latest. Absent, and therefore current: `@diffusionstudio/vits-web`, `d3-geo`,
`react-force-graph-2d`, `topojson-client`, `world-atlas`, `@types/katex`,
`@types/react-test-renderer`, `@types/topojson-client`, `@tailwindcss/postcss` (dev),
`eslint` (dev, within its range).

**Major:**

| Package | Installed | Latest | Kind |
| --- | --- | --- | --- |
| typescript | 5.9.3 | 7.0.2 | dev |
| @types/node | 20.19.41 | 26.4.0 | dev |
| eslint | 9.39.4 | 10.9.1 | dev |

**Minor:**

| Package | Installed | Latest | Kind |
| --- | --- | --- | --- |
| katex | 0.17.0 | 0.18.4 | prod, shipped |
| recharts | 3.8.1 | 3.10.1 | prod, shipped |
| swr | 2.4.1 | 2.5.1 | prod, shipped |
| next | 16.2.6 | 16.3.3 | prod, shipped; carries the security fixes |
| eslint-config-next | 16.2.6 | 16.3.3 | dev; moves with next |

**Patch-only:** `react 19.2.4 -> 19.2.8`, `react-dom 19.2.4 -> 19.2.8`,
`react-test-renderer 19.2.4 -> 19.2.8` (dev), `@tailwindcss/postcss 4.3.0 -> 4.3.3` (dev),
`tailwindcss 4.3.0 -> 4.3.3` (dev), `tsx 4.23.0 -> 4.23.12` (dev),
`@types/d3-geo 3.1.0 -> 3.1.1` (dev), `@types/react 19.2.15 -> 19.2.18` (dev),
`@types/react-dom 19.2.3 -> 19.2.5` (dev).

All three frontend majors are development tooling. Nothing shipped to the browser is a major
behind.

---

## 4. What would actually break

Two backend packages are at least one major behind. Both were checked against the upstream
changelog and then grepped for in this codebase.

### cryptography 48.0.1 -> 50.0.1

Source: `CHANGELOG.rst` on `pyca/cryptography` `main`, entries `49.0.0 - 2026-06-12` and
`50.0.0 - 2026-07-31`. `50.0.1 - 2026-08-25` is a wheel rebuild against OpenSSL 4.0.2 with no
code change.

`49.0.0` carries five items marked `**BACKWARDS INCOMPATIBLE:**`:

| Breaking change | Affects this codebase? |
| --- | --- |
| x86_64 macOS wheels removed; arm64 only | No. Targets are the Pi (Linux aarch64), CI (`ubuntu-24.04`, x86_64) and a 64-bit Windows laptop. |
| 32-bit Windows support removed | No. The laptop is 64-bit. |
| Deprecated aliases `PUBLIC_KEY_TYPES`, `PRIVATE_KEY_TYPES`, `CERTIFICATE_PRIVATE_KEY_TYPES`, `CERTIFICATE_ISSUER_PUBLIC_KEY_TYPES`, `CERTIFICATE_PUBLIC_KEY_TYPES` removed | No. `grep -rn "PUBLIC_KEY_TYPES\|PRIVATE_KEY_TYPES"` over non-`.venv` Python returns nothing, and there is no `cryptography` import to hold one. |
| `ChaCha20` now treats the first 4 nonce bytes as an RFC 7539 block counter and raises `ValueError` on overflow | No. No ChaCha20 anywhere; the only cipher use is HMAC-SHA256. |
| Loading an X.509 certificate whose ECDSA/DSA `AlgorithmIdentifier` carries encoded NULL parameters now raises `ValueError` | Not in our code, but see below. |

`50.0.0` adds no `**BACKWARDS INCOMPATIBLE:**` entry. It deprecates finite-field
Diffie-Hellman (deprecation, not removal) and tightens several parsers: SCT lists with trailing
bytes, `BIT STRING`s declaring non-zero unused bits, `InvalidityDate` in non-DER
`GeneralizedTime`, OCSP requests/responses with a version other than v1, and DH public keys
under 512 bits. All are rejections of malformed input.

The parser-tightening items and the ECDSA/DSA NULL-parameters item are the only ones with any
theoretical bearing, because the Google sign-in path does load X.509 certificates: Google's
signing certs, fetched from `https://www.googleapis.com/oauth2/v1/certs` and parsed by
`google.auth.crypt.RSAVerifier.from_string`. Those are RSA certs issued by Google, not ECDSA or
DSA, and they are well-formed DER. The risk is that Google emits something the stricter parser
rejects, which is a Google-side change we would notice as a broken sign-in, not a change this
bump introduces.

Verdict: **a cheap upgrade.** No affected surface. And it resolves:

```
resolve313/Scripts/python.exe -m pip install --dry-run -r <pins with cryptography==50.0.1>
```

resolved cleanly on Python 3.13.12, leaving every other pin unchanged. `cryptography 50.0.1`
publishes `manylinux_2_28_aarch64`, `manylinux_2_34_aarch64` and `manylinux_2_31_armv7l`
wheels (read from the PyPI file list), so the Pi installs a wheel rather than compiling. This
was resolved, not installed anywhere.

### websockets 15.0.1 -> 17.1

This one does not need a changelog verdict, because it cannot be done.

`realtime==2.31.0`, a transitive dependency of `supabase`, declares `websockets<16,>=11` (PyPI
metadata for `realtime 2.31.0`). `websockets 15.0.1` is the highest release below 16 (PyPI: the
15.x line is `15.0` and `15.0.1` only). **The pin is already at its ceiling.** A dry-run
confirms:

```
resolve313/Scripts/python.exe -m pip install --dry-run -r <pins with websockets==17.1>
-> ERROR: ResolutionImpossible
```

`supabase 2.31.0` is itself the latest release, so there is no supabase bump that lifts the
constraint. Nothing to do here until upstream moves.

For completeness, had it been possible: `websockets 17.0` requires Python >= 3.11 (fine, the Pi
is on 3.13), makes several boolean arguments keyword-only, renames `socket` to `sock` in the
threading implementation, and changes handshake header encoding to ISO-8859-1. None of that
would have touched this codebase anyway: `grep` for `import websockets` over non-`.venv` Python
returns nothing. The package is present only as `uvicorn[standard]`'s WebSocket protocol
implementation. The arena and chat code uses Starlette's `WebSocket`
(`app/routers/arena.py:11`, `tests/chat_test.py:22`), which sits above it.

### Groups that must move together, measured by dry-run

| Group | Why | Result |
| --- | --- | --- |
| `h2 4.4.1` + `hpack 4.2.0` | `h2 4.4.1` requires `hpack<5,>=4.2`. `h2==4.4.1` alone: `ResolutionImpossible`, conflict reported against `hpack==4.1.0`. With `hpack==4.2.0`: resolves. | must pair |
| `pydantic` + `pydantic_core` | `pydantic 2.13.4` requires `pydantic-core==2.46.4` exactly, and 2.13.4 is latest. | `pydantic_core` cannot move at all |
| `starlette` | `fastapi 0.136.3` requires only `starlette>=0.46.0`, no upper bound. `starlette==1.3.1` and `starlette==1.6.0` each resolve cleanly against the frozen `fastapi 0.136.3`. | independent of fastapi |
| `uvicorn` | `uvicorn 0.52.4` requires `websockets>=13.0`, satisfied by the pinned 15.0.1. | independent of websockets |
| `next` + `eslint-config-next` | both pinned to `16.2.6`, and `eslint-config-next` tracks the Next major/minor | must pair |

A combined dry-run of `cryptography==50.0.1` + `starlette==1.3.1` + `Pillow==12.3.0` +
`pyasn1==0.6.4` + `h2==4.4.1` + `hpack==4.2.0` against the remaining pins resolves cleanly on
Python 3.13.12. Resolved only. Nothing was installed into any project environment.

Two caveats on that resolution result. It ran on Windows, where the `uvloop` marker
(`sys_platform != "win32"`) excludes that pin, so uvloop's compatibility with the bumped set is
untested. And a successful resolve says the versions are mutually installable, not that the
test suite passes.

---

## 5. The two JWT libraries

Both are installed. They are not two ways of doing the same thing, and neither is a leftover in
the usual sense. Established by reading imports, not by inferring from package names.

### What imports what

`grep -rn "^\s*(import|from)\s.*(jwt|jose)" --include="*.py"` over the backend, excluding
`.venv`, returns exactly **one** line:

```
backend/app/auth.py:9:from jose import JWTError, jwt
```

There is no `import jwt` anywhere in this codebase. PyJWT is not called by any line we wrote.

But it is loaded. Probing the existing venv without changing it:

```
backend/.venv/Scripts/python.exe -c "import sys, supabase; print('jwt' in sys.modules)"
-> True
```

The chain is `supabase` -> `supabase_auth` -> `_async/gotrue_client.py:13`, which does
`from jwt import get_algorithm_by_name` at module level. `supabase-auth 2.31.0` declares
`pyjwt[crypto]>=2.12.0` as a hard requirement, not an extra. `backend/app/upload_config.py:29`
calls `create_client(...)`, so importing the app imports PyJWT.

So PyJWT is a **required transitive dependency that our code never calls**. It is not dead
weight that can be deleted (removing the pin breaks `supabase-auth`'s declared requirement),
and it is not a second token implementation of ours either.

### Are tokens encoded or decoded two different ways in two places?

Yes, but not by two of our code paths. There are two token systems, and each uses exactly one
library. They are not the same tokens and they never meet.

**Path A: our own session tokens, python-jose, HS256.**

- Signs: `create_access_token` at `backend/app/auth.py:66-69` calls
  `jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)` with `ALGORITHM = "HS256"`
  (`auth.py:38`). Payload is `{"sub": str(user_id), "exp": ..., "ver": token_version}`,
  30-day expiry (`auth.py:39`).
- Verifies: `decode_access_token` at `auth.py:72-95` calls
  `jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])`.
- Algorithm restriction: **explicit and enforced.** `algorithms=["HS256"]` is passed, and
  python-jose checks it before any key work:
  `.venv/Lib/site-packages/jose/jws.py:253-258`,
  `if algorithms is not None and alg not in algorithms: raise JWSError("The specified alg value is not allowed")`.
  A token with `alg: none` is rejected there, even though `ALGORITHMS.NONE = "none"` exists in
  `jose/constants.py:6`, because `"none"` is not in the passed list.
- Claim validation: `jose/jwt.py:136` sets `"verify_exp": True` by default and
  `_validate_claims` at `jose/jwt.py:496` acts on it, so the 30-day expiry is actually checked.
- Key: a single shared symmetric secret from the environment, with startup guards rejecting an
  absent, placeholder or under-32-character secret (`auth.py:21-36`).
- Where used: every authenticated request, through `get_current_user`, `get_optional_user`,
  `get_optional_user_strict`, `get_optional_user_id` (`auth.py:103-183`).

**Path B: Google ID tokens, google-auth's own JWT code, RS256.**

- Signs: Google. We never mint these.
- Verifies: `backend/app/routers/auth.py:220` and `:284` call
  `google_id_token.verify_oauth2_token(body.credential, _google_transport, GOOGLE_CLIENT_ID)`.
- Which library: **neither python-jose nor PyJWT.** `verify_oauth2_token` passes
  `certs_url=_GOOGLE_OAUTH2_CERTS_URL`, which is `"https://www.googleapis.com/oauth2/v1/certs"`
  (`.venv/Lib/site-packages/google/oauth2/id_token.py:72`, used at `:203`). That endpoint
  returns `{key id: x509 PEM}`, not a JWK Set, so the `if "keys" in certs:` branch at
  `id_token.py:139` is false and the PyJWT block behind it (`id_token.py:141-168`) does not
  run. Control falls to `google.auth.jwt.decode` at `id_token.py:171-176`, which verifies via
  `google.auth.crypt.verify_signature` and, through it, `cryptography`.

  This is the one place worth being exact about, because the PyJWT block is right there in the
  file and it would be easy to read the import at `id_token.py:142` and conclude PyJWT is on
  the Google path. It is not, at this `certs_url`. It would be on the Firebase path
  (`verify_firebase_token`, `certs_url=_GOOGLE_APIS_CERTS_URL`, `id_token.py:237`), which this
  codebase does not call.
- Algorithm restriction: **implicit, and weaker in form than Path A.** `google.auth.jwt.decode`
  reads `alg` from the token header and looks it up in `_ALGORITHM_TO_VERIFIER_CLASS`
  (`google/auth/jwt.py:269`), which is `{"RS256": crypt.RSAVerifier}` plus `"ES256"` and
  `"ES384"` when the ES backend is importable (`google/auth/jwt.py:68-73`). There is no
  caller-supplied allowlist; the caller cannot pin RS256. An unknown `alg`, including `none`,
  raises `InvalidValue("Unsupported signature algorithm ...")`.
- Why that is nonetheless not an algorithm-confusion hole: the key material is not
  attacker-supplied. The verifier is constructed from Google's x509 certificates over TLS, and
  `verify_signature` calls `verifier_cls.from_string(cert)` on them. A token claiming
  `alg: ES256` would select `EsVerifier` and then fail to load an RSA certificate as an EC key.
  The classic confusion attack needs the *same* key bytes reinterpreted under a different
  family; here the family is fixed by what Google publishes.
- Issuer and audience: `verify_oauth2_token` checks `iss` against `_GOOGLE_ISSUERS` after
  decoding (`id_token.py:207-212`), and `audience=GOOGLE_CLIENT_ID` is checked inside `decode`.
  The call site then additionally requires `email_verified` (`routers/auth.py:227-231`).

**Do the two agree on algorithm restriction?** They restrict differently, and both restrict
adequately for what they verify. Path A restricts to an explicit single-element allowlist
supplied by the caller. Path B restricts to a fixed three-algorithm map the caller cannot
narrow, but with a key source that cannot be swapped. There is no path where a token verified
under Path B's rules is accepted as a Path A session token: `get_current_user` only ever calls
`decode_access_token`, which only ever calls `jose.jwt.decode` with `algorithms=["HS256"]` and
the local secret. A Google ID token presented as a bearer token fails signature verification.

**Summary of the three libraries:**

| Library | Pinned | Called by our code | Role |
| --- | --- | --- | --- |
| python-jose | 3.5.0 | Yes, `app/auth.py:9` | signs and verifies our session tokens, HS256 |
| google-auth | 2.56.2 | Yes, `app/routers/auth.py:9-10` | verifies Google ID tokens, RS256, using its own JWT code |
| PyJWT | 2.13.0 | No | required by `supabase-auth`; imported at startup, never invoked by us |

### A measurement that strengthens the accepted `ecdsa` risk

The comment in `backend/requirements.txt` justifies accepting PYSEC-2026-1325 on the grounds
that "we sign JWTs with HS256 (HMAC) and never touch an ECDSA code path". That is correct, and
there is a second, independent reason it does not reach us, which the comment does not make.

Because `python-jose[cryptography]` is what is pinned, `jose/backends/__init__.py` binds
`ECKey` to `CryptographyECKey` and falls back to `ecdsa_backend.ECDSAECKey` only on
`ImportError`. With `cryptography` installed, python-jose would not use the `ecdsa` package for
EC operations even if this codebase started doing them. `ecdsa` remains in the tree only as an
unconditional `Requires-Dist: ecdsa!=0.15` in python-jose's metadata.

### python-jose: actual release history and security posture

Reported from PyPI and OSV rather than from reputation.

**Release history** (PyPI `releases`, first-file upload time):

| Version | Released |
| --- | --- |
| 3.2.0 | 2020-07-30 |
| 3.3.0 | 2021-06-05 |
| 3.4.0 | 2025-02-18 |
| 3.5.0 | 2025-05-28 |

Three releases in six years, with a **3 year 8 month gap** between 3.3.0 and 3.4.0. The pinned
3.5.0 is the latest release and is 15 months old as of today.

**Repository activity** (GitHub API, `mpdavis/python-jose`): not archived, 1756 stars,
`open_issues_count: 120`. `pushed_at` is `2026-04-14`, so branches have moved since 3.5.0, but
the five most recent commits on the default branch are all dated `2025-05-28`, the 3.5.0
release day. Nothing has landed on `master` in 15 months.

**Advisory record** (OSV, ecosystem PyPI, package `python-jose`): four distinct CVEs in the
project's lifetime.

| CVE | Advisory | Fixed in | Summary |
| --- | --- | --- | --- |
| CVE-2016-7036 | GHSA-w799-prg3-cx77 | 1.3.2 | HMAC keys not compared in constant time |
| CVE-2024-33663 | GHSA-6c5p-j8vq-pqhj | 3.4.0 | algorithm confusion with OpenSSH ECDSA keys |
| CVE-2024-33664 | GHSA-cjwg-qfpm-7377 | 3.4.0 | denial of service via compressed JWE content |
| CVE-2024-29370 | GHSA-h4pw-wxh7-4vjj | last affected 3.3.0 | |

**The pinned 3.5.0 has zero open advisories.** `pip-audit` did not flag it, and none of the
four ranges includes it. The two 2024 CVEs were disclosed in April 2024 and fixed in February
2025: **ten months** unfixed, and the algorithm-confusion one is exactly the class of bug that
matters most in a JWT library.

**For contrast, PyJWT** (OSV, same query): 19 advisory records, several disclosed in 2026,
including `GHSA-jq35-7prp-9v3f` "Algorithm allow-list bypass when decoding with PyJWK /
PyJWKClient keys" and `GHSA-xgmm-8j9v-c9wx` "Public-key JWK accepted as HMAC secret enables
forged HS256 tokens" - both fixed in 2.13.0, the version pinned here, released 2026-05-21.

Read that contrast carefully, because the naive reading is backwards. PyJWT's higher CVE count
is a symptom of *being looked at*: five advisories disclosed and fixed in one 2026 batch, each
with a release behind it. python-jose's clean current record sits alongside a codebase nobody
has shipped a fix for in 15 months. Zero open advisories on an unmaintained library is a
statement about who is looking, not about what is there.

What the evidence supports: python-jose is currently free of known vulnerabilities, has a
documented ten-month response time on its most serious one, and has been dormant for 15 months.
What the evidence does not support is a claim that it is presently vulnerable. It is not.

---

## 6. Ranked upgrade order

Ranked by risk removed per unit of breakage introduced. Not by how far behind.

1. **`next` 16.2.6 -> 16.3.3, with `eslint-config-next` 16.2.6 -> 16.3.3.** Nine advisories on
   the only package here that serves attacker-reachable code, and the image-optimizer SVG DoS
   is confirmed applicable to this configuration. A minor bump within Next 16.
2. **`Pillow` 12.2.0 -> 12.3.0.** Clears thirteen advisories, minor bump, resolves cleanly, and
   the single biggest reduction in advisory count for one line. Below `next` only because none
   of the thirteen is presently reachable past the `_MAGIC` gate.
3. **`starlette` 1.2.1 -> 1.3.1.** Fixes CVE-2026-54283, the urlencoded form-limit bypass, the
   one backend finding an unauthenticated caller could plausibly aim at if any endpoint ever
   takes a urlencoded body. Resolves cleanly against the frozen `fastapi 0.136.3`, which has no
   upper bound on starlette. 1.3.1 rather than 1.6.0 keeps the change to the security floor.
4. **`pyasn1` 0.6.3 -> 0.6.4.** Three HIGH advisories cleared by a patch bump with no API
   change; it sits under the Google sign-in certificate parsing.
5. **`cryptography` 48.0.1 -> 50.0.1.** Two majors, zero affected surface: no direct import, no
   ChaCha20, no removed alias, and the removed platforms are not ours. Clears three advisories
   including the CVE-2026-69247 Bleichenbacher oracle. Fifth because none of the three is
   reachable, so its value is removing a scanner finding and a growing gap, not exposure.
6. **`h2` 4.3.0 -> 4.4.1 together with `hpack` 4.1.0 -> 4.2.0.** Must move as a pair; `h2 4.4.1`
   requires `hpack>=4.2`. A MODERATE smuggling primitive in a client-side stack talking only to
   Supabase, so genuinely low value, but the pair is cheap and mechanical.
7. **`protobufjs` 7.6.4 -> 7.6.5.** Shipped to the browser via `onnxruntime-web`, but reached
   only by `.proto` files the TTS runtime loads.
8. **`postcss` and `nanoid`, by raising the `postcss` override floor from `^8.5.10` to
   `^8.5.23`.** Build-time only, no untrusted input; `nanoid` comes along with `postcss`.
9. **`js-yaml` override floor `^4.1.2` -> `^4.3.1`, and `brace-expansion`.** ESLint's tree only,
   and ESLint is not a CI gate here. Pure tidiness.
10. **The remaining patch drift** (`sqlalchemy`, `lxml`, `greenlet`, `yarl`, `python-dotenv`,
    `typing-inspection`, `annotated-doc`) **and the non-security minors** (`anyio`, `cffi`,
    `click`, `charset-normalizer`, `idna`, `packaging`, `typing_extensions`, `annotated-types`,
    `google-auth`, `certifi`). No advisories; this is the "stay near head so the next jump is
    small" category. `certifi` is the one with a real reason to move on its own, being a CA
    bundle.

**Not on the list, deliberately:**

- **`websockets`.** Blocked by `realtime==2.31.0` requiring `websockets<16`, confirmed by a
  failing dry-run. `websockets 15.0.1` is already the ceiling.
- **`pydantic_core` 2.46.4 -> 2.48.0.** `pydantic 2.13.4` requires `pydantic-core==2.46.4`
  exactly and is itself the latest pydantic. The gap is an artifact of reading version numbers
  without reading constraints.
- **`ecdsa`.** No fix exists, and section 5 gives a second reason it is unreachable.
- **`fastapi` 0.136.3 -> 0.141.1 and `uvicorn` 0.49.0 -> 0.52.4.** No advisories, and both are
  0.x, where a minor bump is the project's breaking bump. `fastapi` is also the package the CI
  notes record as having caused the behaviour drift that motivated pinning in the first place
  (`len(app.routes)` 57 versus 23). Moving it is a deliberate decision with its own
  verification, not part of a security sweep.
- **`typescript` 5.9.3 -> 7.0.2, `eslint` 9 -> 10, `@types/node` 20 -> 26.** Development majors
  with no advisories. `eslint` in particular is not a CI gate here and already reports 88
  errors.

**Groups that must move together:** (`h2`, `hpack`), (`next`, `eslint-config-next`),
(`postcss`, `nanoid`). (`pydantic`, `pydantic_core`) is a group that must *not* move.

---

## What contradicts what was said in the brief

1. **"`pip-audit` sits in `requirements-dev.txt` ... and nothing has ever run it."** The comment
   in `requirements-dev.txt` states "The one remaining finding, ecdsa PYSEC-2026-1325
   (CVE-2024-23342), is a known accepted item". That sentence is a scan result, so `pip-audit`
   was run at least once, at M135. It is now false: there are 23 distinct findings across 6
   packages, not one. Under the CLAUDE.md rule about documentation a change makes false, that
   comment needs correcting whenever the first upgrade lands. It is already false today.

2. **"`cryptography` is at 48.0.1 while 50.0.1 resolves today. Two major versions behind on the
   library that does the encryption."** Accurate on the numbers. But `cryptography` is not "the
   library that does the encryption" in the sense implied: no line of this codebase imports it.
   It does HMAC-SHA256 underneath python-jose and RSA verification underneath google-auth, and
   all three of its advisories are in PKCS#7 and X.509 code neither path calls. The gap is real;
   the exposure is nil.

3. **"Frontend findings only in build or development dependencies are routinely
   over-weighted."** Agreed, and the correction cuts both ways here: `npm audit --omit=dev`
   reports 5 rather than 7, but that production count still includes `postcss` and `nanoid`,
   which run only at build time. The honest split is three shipped packages (`next`,
   `protobufjs`, `sharp`) and four build-or-dev (`postcss`, `nanoid`, `js-yaml`,
   `brace-expansion`) - and `sharp` is uncertain because Vercel may not use it at all.

4. **"That set was never chosen: it is what pip happened to resolve on the Pi on some past
   day."** True as history, but 42 of the 69 pins are at the latest published version today, and
   a further 8 are one patch behind. The frozen set is closer to head than "some past day"
   suggests.

5. **A premise in `requirements.txt` that is now weaker than written.** The `python-jose` comment
   says the ecdsa advisory is unreachable because "we sign JWTs with HS256 (HMAC) and never touch
   an ECDSA code path". Correct, but it understates the case: with the `[cryptography]` extra
   pinned, python-jose would not route EC operations through the `ecdsa` package even if the code
   did start doing them. Not a contradiction, a stronger version of the same claim.

---

## What could not be determined, and what would settle it

1. **Whether the `sharp` advisory reaches production.** `sharp@0.34.5` is in the lockfile as
   `next`'s image optimizer, and the optimizer is enabled in production builds. But the frontend
   deploys on Vercel, which supplies its own image optimization. I made no call to Vercel, per
   the brief. **Settled by:** checking whether the Vercel build output includes `sharp`, or
   reading Vercel's current documentation on image optimization for Next 16.

2. **Whether the bumped set passes the test suite.** Every resolution result above is
   `pip install --dry-run` in a throwaway environment. That proves mutual installability and
   nothing about behaviour. **Settled by:** installing the candidate set in a throwaway venv and
   running `backend/tests/*_test.py` through the same per-file subprocess loop CI uses. I did not
   do this because the loop needs `JWT_SECRET` and a database, and standing that up is a change
   to the environment rather than a read.

3. **`uvloop` compatibility with any bumped set.** Every dry-run ran on Windows, where the
   `sys_platform != "win32"` marker excludes `uvloop==0.22.1` from resolution entirely. The Pi
   and CI both install it. **Settled by:** re-running the same dry-runs on Linux, which for these
   purposes means a CI job or the Pi.

4. **Whether `app.openapi()["paths"]` stays at 45 under the bumped set.** `starlette` is the
   package the CI boot guard's count is sensitive to, and I did not import the app under a
   bumped starlette. **Settled by:** the existing app-boot step in `backend-checks.yml`, on a
   branch carrying the bump.

5. **The exact `next` version that first carries all nine fixes.** Every advisory reports its
   fixed range as `>=16.0.0 <16.2.11`, so 16.2.11 clears all nine, but `npm audit` proposes
   16.3.3 and `npm outdated` reports 16.3.3 as latest. I did not establish what 16.3.x changes
   beyond the security content. **Settled by:** reading the Next.js 16.3 release notes for
   breaking changes between 16.2 and 16.3.

6. **Whether python-jose's 120 open GitHub issues include unfixed security reports.** The GitHub
   API reports zero repository-published security advisories and OSV reports none open against
   3.5.0, but `open_issues_count` is a raw total and I did not read the issues. **Settled by:**
   listing open issues labelled security, or searching the tracker for reports filed after
   2025-05-28.

7. **Whether the laptop's `backend/.venv` drift matters.** It holds `cryptography 48.0.0` and
   `google-auth 2.57.0` against pins of `48.0.1` and `2.56.2`. CI verifies the pins; nothing
   verifies the laptop. This audit read that venv's files as evidence for what upstream packages
   contain, which is safe, but it means local test runs are not running the pinned set.
   **Settled by:** `pip install -r requirements.txt -r requirements-dev.txt` in that venv, which
   is a change to a project environment and therefore out of scope here.
