import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doc-Scout — Ontario primary care capacity",
  description:
    "Which Ontario practices are accepting new patients, with the evidence and the date we checked. Free, always.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body>
        <header className="site-header">
          <a className="wordmark" href="/">Doc-Scout</a>
          <nav>
            <a href="/about">How this works</a>
            <a href="/bot">For clinics</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <p>
            Doc-Scout is not a government service and does not replace{" "}
            <a href="https://www.ontario.ca/page/health-care-connect">Health Care Connect</a>.
            Register there too — it is free and it is the province&rsquo;s official matching service.
          </p>
          <p>
            We never contact clinics on your behalf. We read what practices publish and show you
            when we last checked.
          </p>
        </footer>
      </body>
    </html>
  );
}
