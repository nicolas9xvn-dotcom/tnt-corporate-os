export const metadata = { title: "Privacy Policy — AME29 Content OS" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-slate-200">
      <h1 className="text-2xl font-bold text-white">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-400">Last updated: 2026-09-13</p>

      <div className="mt-6 flex flex-col gap-4 text-sm leading-relaxed">
        <p>
          AME29 Content OS (&quot;the App&quot;) is an internal business tool for AME29 Nail Osaka.
          It is used only by authorized AME29 staff and management, not by the general public.
        </p>

        <h2 className="mt-2 text-base font-semibold text-white">What data the App handles</h2>
        <ul className="list-disc pl-5">
          <li>
            Photos and videos of nail art, the salon, and its work — stored in AME29&apos;s own
            Google Drive, never copied elsewhere except a short-lived temporary copy created only
            while publishing to Instagram, deleted immediately after.
          </li>
          <li>
            Access tokens for connected social media accounts (Facebook, Instagram, TikTok) —
            stored securely, used only to publish content an AME29 staff member has chosen and
            to read that content&apos;s own engagement stats (likes/comments/views). These tokens
            are never shared with any other party.
          </li>
          <li>Login credentials for AME29 staff, used only to access this internal tool.</li>
        </ul>

        <h2 className="mt-2 text-base font-semibold text-white">What the App does not do</h2>
        <ul className="list-disc pl-5">
          <li>Does not sell or share data with third parties.</li>
          <li>Does not post anything without an AME29 staff member explicitly choosing to publish it.</li>
          <li>Does not access any social media data beyond what is needed to publish content and read its own stats.</li>
        </ul>

        <h2 className="mt-2 text-base font-semibold text-white">Removing access</h2>
        <p>
          An AME29 staff member can disconnect any social media account at any time from the
          App&apos;s &quot;Kênh MXH&quot; page, which deletes the stored access token immediately.
        </p>

        <p>
          Contact: <a className="text-cyan-300 underline" href="mailto:contact@ame29.example">contact@ame29.example</a>
        </p>
      </div>
    </main>
  );
}
