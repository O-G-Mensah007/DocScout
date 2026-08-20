export function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined || v.startsWith("--")) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required argument --${name}`);
  }
  return v;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
