export function Footer() {
  return (
    <footer className="py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted sm:flex-row">
        <p>SkyPC — local dev: API + agent + live listings.</p>
        <p className="font-mono text-xs">localhost · api:4000 · web:3000</p>
      </div>
    </footer>
  );
}
