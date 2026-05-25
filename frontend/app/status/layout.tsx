export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 antialiased">
        {children}
      </body>
    </html>
  );
}
