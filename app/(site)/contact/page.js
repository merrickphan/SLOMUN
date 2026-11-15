import PlaceholderForm from '@/components/PlaceholderForm';
import { Page } from '@/components/ui';

export const metadata = { title: 'Contact Us | SLOMUN' };

export default function Contact() {
  return (
    <Page title="Contact Us" image="/images/hero-slohs.png">
      <div className="prose">
        <p>Questions about SLOMUN? Send the Secretariat a message.</p>
      </div>
      <PlaceholderForm
        rows={[[['Name', 'Full name'], ['Email', 'Email address', 'email']], [['School', 'School name']]]}
        textarea={['Message', 'How can we help?']}
        submit="Send Message"
        notice="The contact form is not connected yet. Check back soon."
      />
    </Page>
  );
}
