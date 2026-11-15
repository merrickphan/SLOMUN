import { Page } from '@/components/ui';

export const metadata = { title: 'Position Paper | SLOMUN' };

export default function PositionPaper() {
  return (
    <Page title="Position Paper" image="/images/position-paper-banner.png">
      <div className="prose">
        <p>
          A position paper explains your country’s or character’s stance on your committee’s topic and the solutions
          you plan to propose.
        </p>
        <h2 className="heading">What to Include</h2>
        <p>Background: a summary of the issue and past international action.</p>
        <p>Position: your country’s or character’s stance on the topic.</p>
        <p>Proposed Solutions: specific actions you would support in committee.</p>
        <h2 className="heading">Submission</h2>
        <p>Formatting guidelines and the submission deadline will be posted here.</p>
      </div>
      <hr />
    </Page>
  );
}
