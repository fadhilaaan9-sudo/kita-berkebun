import "./globals.css";

export const metadata = {
  title: "Kebun Kita — Bertani & Beternak Bareng",
  description: "Game survival pertanian dan peternakan 3D multiplayer di browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
