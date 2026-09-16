# Public objects API

First server component. Hosts collections, profiles, and boards. Zero runtime dependencies, plain Node HTTP.

## Run

```
XMEM_API_KEYS=key-one,key-two PORT=8787 node dist-server/main.js
```

Build the server with `tsc -p server/tsconfig.json`. Keys come only from the environment. Reads are public with a shared rate limit. Writes need a bearer key with their own limit.

## Routes

- `GET /health`
- `PUT /v1/collections/:id` plus `GET`
- `PUT /v1/profiles/:id` plus `GET`
- `PUT /v1/boards/:id` plus `GET`
- `DELETE /v1/:kind/:id` for owners only, keyed by publish key hash
- `POST /v1/reports` plus `GET` for abuse reports with reporter credit

Bodies cap at 256KB. Shapes validate strictly, ids must match the path.
