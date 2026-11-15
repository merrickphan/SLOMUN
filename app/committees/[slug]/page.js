import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page } from '@/components/ui';
import { committees } from '@/lib/site';

const TBA = 'To be announced';

export function generateStaticParams() {
  return committees.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const c = committees.find((x) => x.slug === slug);
  return { title: c ? `${c.name} | SLOMUN` : 'Committee | SLOMUN' };
}

export default async function CommitteePage({ params }) {
  const { slug } = await params;
  const c = committees.find((x) => x.slug === slug);
  if (!c) notFound();

  const facts = [
    ['Head Chair', c.chair || TBA],
    ['Topic', c.topic || TBA],
    ['Procedure', c.procedure || TBA],
    ['Technology', c.technology || TBA],
  ];

  return (
    <Page title={c.name} image={c.image}>
      <dl className="facts">
        {facts.map(([label, value]) => (
          <div className="fact" key={label}>
            <dt>{label}</dt>
            <dd className={value === TBA ? 'tba' : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="briefing">
        {c.guide ? (
          <a className="btn btn-gold" href={c.guide} target="_blank" rel="noopener">
            Topic Briefing
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ) : (
          <span className="btn btn-disabled" aria-disabled="true">Topic Briefing coming soon</span>
        )}
      </div>
      <hr />
      <Link className="back-link" href="/committees">← All committees</Link>
    </Page>
  );
}
