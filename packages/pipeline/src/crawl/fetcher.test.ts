import { describe, expect, it } from "vitest";
import { extractReadableText, candidateUrls } from "./fetcher";

describe("extractReadableText", () => {
  it("strips script and style tags", () => {
    const html = `<html><body>
      <script>var x = 1;</script>
      <style>.foo { color: red; }</style>
      <p>Hello world</p>
    </body></html>`;
    const text = extractReadableText(html);
    expect(text).toContain("Hello world");
    expect(text).not.toContain("var x");
    expect(text).not.toContain("color: red");
  });

  it("strips nav and footer", () => {
    const html = `<html><body>
      <nav>Menu Item 1</nav>
      <main><p>Main content here</p></main>
      <footer>Copyright 2026</footer>
    </body></html>`;
    const text = extractReadableText(html);
    expect(text).toContain("Main content");
    expect(text).not.toContain("Menu Item");
    expect(text).not.toContain("Copyright");
  });

  it("collapses whitespace", () => {
    const html = `<html><body>
      <p>Lots    of    spaces</p>
      <p></p>
      <p></p>
      <p></p>
      <p>After gaps</p>
    </body></html>`;
    const text = extractReadableText(html);
    expect(text).not.toMatch(/   /);
  });

  it("truncates to 40000 characters", () => {
    const html = `<html><body><p>${"x".repeat(50000)}</p></body></html>`;
    const text = extractReadableText(html);
    expect(text.length).toBeLessThanOrEqual(40000);
  });

  it("preserves meaningful text from a realistic page", () => {
    const html = `<html><body>
      <h1>New Patients</h1>
      <p>We are currently accepting new patients. Please call 416-555-0100.</p>
      <iframe src="booking.example.com"></iframe>
      <svg><circle/></svg>
    </body></html>`;
    const text = extractReadableText(html);
    expect(text).toContain("We are currently accepting new patients");
    expect(text).toContain("416-555-0100");
  });
});

describe("candidateUrls", () => {
  it("generates candidate paths from a website URL", () => {
    const urls = candidateUrls("https://example-fht.ca/");
    expect(urls).toContain("https://example-fht.ca/new-patients");
    expect(urls).toContain("https://example-fht.ca/become-a-patient");
    expect(urls).toContain("https://example-fht.ca/registration");
    expect(urls).toContain("https://example-fht.ca/contact");
    expect(urls).toContain("https://example-fht.ca/");
  });

  it("deduplicates URLs", () => {
    const urls = candidateUrls("https://example.ca/");
    const unique = new Set(urls);
    expect(urls.length).toBe(unique.size);
  });

  it("returns empty array for invalid URL", () => {
    expect(candidateUrls("not a url")).toEqual([]);
  });

  it("strips paths from the base URL", () => {
    const urls = candidateUrls("https://example.ca/some/deep/path");
    expect(urls[0]).toMatch(/^https:\/\/example\.ca\//);
  });
});
