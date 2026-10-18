interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // QR links are short, stable entry points. The app resolves the code
    // against Supabase after the visitor signs in, then selects its campaign.
    const match = url.pathname.match(/^\/q\/([a-zA-Z0-9]{8}|[a-fA-F0-9]{32})\/?$/);
    if (match && request.method === "GET") {
      const target = new URL("/", url.origin);
      target.searchParams.set("qr", match[1].toUpperCase());
      return Response.redirect(target.toString(), 302);
    }

    return env.ASSETS.fetch(request);
  },
};
