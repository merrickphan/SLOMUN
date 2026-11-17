import './crisis.css';

export const metadata = {
  title: 'SLOMUN Crisis',
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: '/images/crest.png' },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#2E3137' };

export default function CrisisLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600;700&family=Playfair+Display:wght@700;900&family=Libre+Baskerville:ital@0;1&family=Caveat:wght@500;700&family=Special+Elite&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
