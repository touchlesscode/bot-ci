/** a client-credentials access token for core-api, or why not */
export const coreApiTokenOf = async ({ fetch, authUrl, clientId, clientSecret, audience }: { fetch: typeof globalThis.fetch; authUrl: string; clientId: string; clientSecret: string; audience: string }) => {
  const response = await fetch(new URL("/oauth/token", authUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret, audience }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await response.json().catch(() => ({}))) as { access_token?: unknown }
  return response.ok && typeof body.access_token === "string" && body.access_token ? { token: body.access_token } : { error: `auth answered ${response.status} without a token` }
}
