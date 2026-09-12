export const metadata = { title: "Terms of Service — AME29 Content OS" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-slate-200">
      <h1 className="text-2xl font-bold text-white">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-400">Last updated: 2026-09-13</p>

      <div className="mt-6 flex flex-col gap-4 text-sm leading-relaxed">
        <p>
          AME29 Content OS (&quot;the App&quot;) is an internal tool built for AME29 Nail Osaka to
          organize photo/video content and publish it to the salon&apos;s own social media
          accounts (Facebook, Instagram, TikTok). It is used only by AME29 staff and management —
          it is not offered as a public product or service to third parties.
        </p>
        <p>
          By connecting a social media account to the App, you authorize it to publish content to
          that account on your behalf, using only the actions you initiate (there is no automatic
          or scheduled posting without a human choosing the content and pressing publish).
        </p>
        <p>
          The App is provided as-is, for AME29&apos;s internal business use. Access is restricted to
          authorized AME29 staff via login credentials.
        </p>
        <p>
          Contact: <a className="text-cyan-300 underline" href="mailto:contact@ame29.example">contact@ame29.example</a>
        </p>
      </div>
    </main>
  );
}
