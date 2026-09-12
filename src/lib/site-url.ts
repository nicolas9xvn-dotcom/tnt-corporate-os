// Public base URL this app is served from — needed wherever code has to
// hand a redirect/callback URL to a third party that can't infer it from
// the incoming request (OAuth `redirect_uri` for Facebook/TikTok must be
// pre-registered in each platform's Developer Console, so it has to be a
// fixed, known value, not derived from request headers).
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tnt-corporate-o.netlify.app";
