/**
 * Mission Control Layout
 * Standalone — no sidebar, no header, full dark screen
 */
export default function MissionControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 antialiased">
        {children}
      </body>
    </html>
  );
}
