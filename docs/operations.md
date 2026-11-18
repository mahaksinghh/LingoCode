# Operations and threat model

The Compose deployment is for local development. The database and API stay
on the Compose network, and the public entry point binds to loopback. Use
HTTPS, managed secrets, separate database roles, request rate limits and
authenticated accounts before public deployment. Run migrations as a
deployment step before starting replicas. Block access to production secrets
from generated applications and keep provider keys in the API environment.

## Access and generated content

The browser generates a random 256-bit workspace access key and stores it in
local storage. Every project API request presents this key, and PostgreSQL
stores its SHA-256 digest as the project owner. Queries check ownership
before returning or generating files. Anyone with the key can access that
workspace. Clearing browser storage loses access, and the slice has no
account recovery, key rotation or cross-device sign-in. Same-origin script
execution would expose the key. Nginx sets a same-origin content security
policy and the UI renders generated content as text.

Generated code is untrusted. This slice offers file inspection. Code
execution requires a separate sandbox with resource and network controls.

Mock mode makes no provider calls. Compatible mode sends the prompt and
output-language instructions to the configured third party. Use a trusted
HTTPS endpoint and review its retention terms. Provider failures are
recorded without storing provider exception bodies. API credentials should
stay in server-side environment variables or a deployment secrets manager.

## Retention and reliability

PostgreSQL retains project names, language settings, prompts, generation
statuses and generated files until an operator removes them. Account-level
export, deletion and automatic expiration are future work. Removing the
local Compose volume discards all local projects. Production operations
need a retention policy for primary data and backups.

Generation runs within an HTTP request. A process crash can leave an
unfinished history entry. A later iteration should add durable workers,
bounded retries and recovery. Mock output is a deterministic starter.
Compatible model output quality and format depend on the chosen endpoint.
