# Client-header wire verification

**Last verified:** never. Fill this in when you run it — the date, the n8n and `@n8n/node-cli`
versions you ran against, and the value each of the three paths received. This file is the only
record of the header reaching a socket, and a PR description is not somewhere the next release can
read it.

`X-Xmemory-Client` is declared in `credentials/XmemoryApi.credentials.ts`'s
`authenticate.properties.headers`. n8n applies that block to outgoing requests from its own credentials
helper, which lives in the n8n runtime packages — **not in this repo**, which depends only on
`n8n-workflow`. So nothing here can establish that the header reaches the wire: `npm run build`'s
header check reads the constructed credential object, one layer above the socket, and this package
declares no test that issues a request. This runbook is the only thing that observes the header
arriving, which is why it is short rather than absent.

Nothing on the n8n or axios side claims `X-Xmemory-Client`, so unlike a `User-Agent` there is no
contention to grade — the header either arrives intact or it does not. That is the whole criterion.

**Blast radius**: `npm run dev` downloads and starts a local n8n (`http://localhost:5678`), so it needs
network access. It creates `~/.n8n-node-cli` — a complete n8n user folder holding an installed n8n and a
SQLite database — and symlinks this node into the custom-nodes directory inside it. All of that stays on
disk afterwards.

**Use a dummy API key, never a real one.** Two reasons, and the second is the one that outlives the run:
the echo server reflects the `Authorization` header it receives, and the credential you create is
persisted in that SQLite database in your home directory, API key included.

## Setup

Start any header-echoing server, point a saved Xmemory credential's base URL at it, and run
`npm run dev`.

## The three request paths

Each is reached from a different n8n context, so one arriving says nothing about the others.

1. **Credential Test button** — open the saved credential and click **Test**. Sends
   `GET <base URL>/runtime`.
2. **Node execution** — one Xmemory node, operation **Read**, wired to that credential. Fill in
   **Instance ID** and **Query**; n8n refuses to execute while either is empty, so a blank field sends
   no request at all. Run the workflow once manually. Sends `POST <base URL>/instances/<id>/read`.
3. **Cluster search** — set the operation to **Create Instance** (the **Cluster** field appears only
   there) and open its **From List** dropdown. Sends `GET <base URL>/clusters`.

## Outcome

**Passes when** all three requests arrive carrying
`X-Xmemory-Client: n8n-nodes-xmemory/<version> (n8n)`.

A step whose request never reached the server is **NOT VERIFIED** — neither a pass nor a fail. It says
nothing about the header, and recording it as a pass is the failure this file exists to prevent.

Record the value each target received in the **Last verified** line at the top of this file, so the
next release — or the next dependency bump — can see when it was last true.

## Cleanup

In reverse order of setup, because each step depends on the one before it:

1. Stop `npm run dev` and the echo server.
2. Delete the saved credential from the n8n UI. It holds the API key you entered, in a database that
   outlives this run.
3. Remove the custom-node symlink `n8n-node dev` created:
   `rm ~/.n8n-node-cli/.n8n/custom/n8n-nodes-xmemory`.
4. `rm -rf ~/.n8n-node-cli` **only if this run created it** — it is a full n8n install, and keeping it
   makes the next verification much faster. Keeping it means keeping the credential from step 2, so do
   step 2 either way.
