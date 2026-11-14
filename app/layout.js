import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'SLOMUN | San Luis Obispo Model United Nations',
  description:
    'The Second Session of San Luis Obispo Model United Nations, hosted at San Luis Obispo High School.',
  icons: { icon: '/images/crest.png' },
};

// Skip the intro (and show hero content immediately) if it already played this
// visit or the visitor prefers reduced motion. Runs before paint to avoid a flash.
const introScript = `
try {
  var seen = sessionStorage.getItem('slomun-intro') === '1';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (seen || reduce) document.documentElement.dataset.intro = 'done';
} catch (e) { document.documentElement.dataset.intro = 'done'; }
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: introScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=DM+Sans:wght@400;500;600&family=EB+Garamond&family=Oswald:wght@400&display=swap"
        />
        <noscript>
          <style>{`.roll{opacity:1!important;transform:none!important}.intro{display:none!important}`}</style>
        </noscript>
      </head>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
