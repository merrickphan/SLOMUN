import { Page } from '@/components/ui';

export const metadata = { title: 'FAQ | SLOMUN' };

const faqs = [
  ['What is Model UN?', 'Model United Nations is a simulation of the United Nations where students represent countries or characters, debate global issues, and work together on solutions.'],
  ['When is SLOMUN?', 'The second session of SLOMUN will be held on April 3, 2027.'],
  ['Where is SLOMUN held?', 'San Luis Obispo High School in San Luis Obispo, CA.'],
  ['What committees are offered?', 'SOCHUM (Modern Slavery and Human Trafficking), CRISPR & Genetic Engineering Ethics, Early WWII, and the Modern AGI Emergency Summit.'],
  ['What is a crisis committee?', 'Crisis committees are fast-paced. Delegates represent individual characters and respond to developing events through directives and crisis notes.'],
  ['Do I need to write a position paper?', 'Position paper guidelines will be posted on the Position Paper page.'],
  ['How do I register?', 'Fill out the delegate registration form on the Register page.'],
  ['How can I contact the Secretariat?', 'Use the form on the Contact Us page.'],
];

export default function Faq() {
  return (
    <Page title="Frequently Asked Questions" image="/images/faq-banner.png">
      <div className="faq">
        {faqs.map(([q, a]) => (
          <details key={q}>
            <summary>
              <span>{q}</span>
              <span className="plus" aria-hidden="true">+</span>
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </Page>
  );
}
