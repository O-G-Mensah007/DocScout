export const metadata = { title: "Doc-Scout — information for clinics" };

/**
 * The page our crawler's User-Agent points at. Invariants 5 and 6 in public
 * form: say who we are, what we read, and how to be removed within 24 hours
 * with no argument and no retention attempt.
 */
export default function BotPage() {
  const contact = process.env.CRAWLER_CONTACT_EMAIL ?? "hello@example.com";
  return (
    <>
      <h1>Information for clinics and practice administrators</h1>

      <h2>What Doc-Scout does</h2>
      <p>
        We read the pages your practice already publishes and record whether they say you are
        accepting new patients. We show that sentence, a link to your page, and the date we
        checked. Patients who find you contact you through your own intake channel.
      </p>

      <h2>What Doc-Scout never does</h2>
      <ul>
        <li>We never send your office messages on a patient&rsquo;s behalf.</li>
        <li>We never book appointments or submit forms.</li>
        <li>We never charge patients, and we never charge you for placement or ranking.</li>
        <li>We never crawl anything behind a login.</li>
      </ul>

      <h2>Our crawler</h2>
      <p>
        It identifies itself as <code>DocScoutBot</code>, honours <code>robots.txt</code>, and
        waits at least two seconds between requests to the same site. To block it, disallow{" "}
        <code>DocScoutBot</code> in your <code>robots.txt</code> — we check before every fetch.
      </p>

      <h2>Corrections and removal</h2>
      <p>
        If your listing is wrong, tell us and we will fix it. If you would rather not be listed
        at all, say so and we will remove you within 24 hours. We will not ask why and we will
        not try to talk you out of it.
      </p>
      <p>
        Email <a href={`mailto:${contact}`}>{contact}</a>.
      </p>
    </>
  );
}
