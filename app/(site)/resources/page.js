import { Page } from '@/components/ui';

export const metadata = { title: 'Delegate Resources | SLOMUN' };

const guides = [
  ['SOCHUM', 'Modern Slavery and Human Trafficking'],
  ['CRISPR & Genetic Engineering Ethics', 'Crisis Committee'],
  ['Early WWII', 'Crisis Committee'],
  ['Modern AGI Emergency Summit', 'Crisis Committee', '/guides/modern-agi-emergency-summit.pdf'],
];

export default function Resources() {
  return (
    <Page title="Delegate Resources" image="/images/resources-banner.jpg">
      <div className="prose">
        <p>Background guides for each committee will be posted here once they are released.</p>
      </div>
      <h2 className="heading">Background Guides</h2>
      <div className="cards">
        {guides.map(([t, d, href]) => (
          <div className="card" key={t}>
            <h3>{t}</h3>
            <p>{d}</p>
            {href ? (
              <a className="card-link card-link-active" href={href} target="_blank" rel="noopener">
                Download guide (PDF) →
              </a>
            ) : (
              <span className="card-link">Coming soon</span>
            )}
          </div>
        ))}
      </div>
    </Page>
  );
}
