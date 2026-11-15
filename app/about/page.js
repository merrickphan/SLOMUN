import { Page } from '@/components/ui';

export const metadata = { title: 'What is SLOMUN? | SLOMUN' };

export default function About() {
  return (
    <Page title="What is SLOMUN?" image="/images/about-banner.png">
      <div className="prose">
        <p>
          San Luis Obispo Model United Nations (SLOMUN) is a Model UN conference hosted at San Luis Obispo High School.
          At SLOMUN, delegates take on the roles of world leaders and decision-makers, debating pressing global issues
          and drafting solutions together.
        </p>
        <p>
          In Model UN, students research an assigned country or character, write a position paper, and represent that
          perspective in committee through speeches, negotiation, and resolutions or directives.
        </p>
        <p>
          The second session of SLOMUN features four committees: the Social, Humanitarian &amp; Cultural Committee
          (SOCHUM), CRISPR &amp; Genetic Engineering Ethics, Early WWII, and the Modern AGI Emergency Summit.
        </p>
      </div>
      <hr />
    </Page>
  );
}
