import { CommitteeTile, Page } from '@/components/ui';
import { committees } from '@/lib/site';

export const metadata = { title: 'Committees | SLOMUN' };

function Block({ title, desc, items, single }) {
  return (
    <>
      <hr />
      <div className="committee-block">
        <h2 className="caps-heading">{title}</h2>
        <p className="usg">Under-Secretary-General: TBD</p>
        <p className="serif">{desc}</p>
        <div className={`tiles${single ? ' tiles-single' : ' tiles-3'}`}>
          {items.map((c) => (
            <CommitteeTile key={c.name} committee={c} line={c.topic || 'Crisis Committee'} />
          ))}
        </div>
      </div>
    </>
  );
}

export default function Committees() {
  return (
    <Page title="Committee List" image="/images/committees-banner.png">
      <Block
        title="General Assembly"
        desc="General Assembly committees are resolution-based. Each delegate represents a member state, and delegates work together to draft and vote on resolutions."
        items={committees.filter((c) => c.type === 'General Assembly')}
        single
      />
      <Block
        title="Crisis"
        desc="Crisis committees are fast-paced. Delegates represent individual characters and respond to developing events through directives and crisis notes."
        items={committees.filter((c) => c.type === 'Crisis')}
      />
    </Page>
  );
}
