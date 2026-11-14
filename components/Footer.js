import Link from 'next/link';

const cols = [
  {
    title: 'Conference',
    links: [
      ['Committees', '/committees'],
      ['Register', '/register'],
      ['Logistics', '/logistics'],
      ['Position Paper', '/position-paper'],
    ],
  },
  {
    title: 'Resources',
    links: [
      ['Delegate Resources', '/resources'],
      ['FAQ', '/faq'],
      ['Contact Us', '/contact'],
    ],
  },
  {
    title: 'Contact',
    links: [
      ['Email the Secretariat', '/contact'],
      ['San Luis Obispo, CA', null],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="footer-brand">
          <Link href="/" className="brand brand-dark">
            <img src="/images/crest.png" alt="" width="64" height="55" />
            <span>
              <strong>SLOMUN</strong>
              <small>San Luis Obispo Model UN</small>
            </span>
          </Link>
          <p>The Second Session of San Luis Obispo Model United Nations, hosted at San Luis Obispo High School.</p>
        </div>
        <div className="footer-cols">
          {cols.map((c) => (
            <div key={c.title}>
              <h4>{c.title}</h4>
              <ul>
                {c.links.map(([label, href]) => (
                  <li key={label}>{href ? <Link href={href}>{label}</Link> : label}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 SLOMUN · San Luis Obispo Model United Nations</span>
        <a href="#top">Back to top ↑</a>
      </div>
    </footer>
  );
}
