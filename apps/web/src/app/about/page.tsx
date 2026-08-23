export const metadata = { title: "Doc-Scout — How this works" };

export default function AboutPage() {
  return (
    <>
      <h1>How Doc-Scout works</h1>

      <h2>What you see</h2>
      <p>
        Every listing shows whether the practice says it is accepting new patients, the exact
        sentence we found, a link to the page we found it on, and the date we checked. When we
        do not know, the listing says &ldquo;Not yet verified&rdquo; — we never guess.
      </p>

      <h2>Where the data comes from</h2>
      <p>
        We read the pages practices already publish — their own websites. A bot called{" "}
        <code>DocScoutBot</code> visits each site, extracts the text, and an AI model reads it
        to find the sentence about accepting patients. A second check confirms the quoted
        sentence actually appears on the page. If the model cannot find a clear statement, the
        practice is listed as &ldquo;Not yet verified.&rdquo;
      </p>

      <h2>How fresh is it</h2>
      <p>
        Every listing shows its age in plain language: &ldquo;Verified today,&rdquo;
        &ldquo;Verified 3 days ago,&rdquo; &ldquo;Verified 4 weeks ago.&rdquo; Practices that
        change status frequently are rechecked more often. A practice that has said the same
        thing for months is rechecked less often.
      </p>

      <h2>What Doc-Scout never does</h2>
      <ul>
        <li>We never contact a practice on your behalf — you reach them through their own published intake channel.</li>
        <li>We never charge patients. Not now, not with a premium tier, not ever.</li>
        <li>We never store your health information. We keep your email and postal code for alerts, nothing else.</li>
      </ul>

      <h2>Health Care Connect</h2>
      <p>
        Doc-Scout is not a government service. Ontario&rsquo;s official patient-matching service
        is{" "}
        <a href="https://www.ontario.ca/page/health-care-connect">Health Care Connect</a>.
        Register there too — it is free and may match you to a provider who does not have a
        public website.
      </p>

      <h2>Corrections</h2>
      <p>
        If a listing is wrong, tell us and we will fix it. If you are a practice and would
        rather not be listed, we will remove you within 24 hours — no questions asked.
        See the <a href="/bot">information for clinics</a> page.
      </p>
    </>
  );
}
