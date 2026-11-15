import PlaceholderForm from '@/components/PlaceholderForm';
import { Page } from '@/components/ui';

export const metadata = { title: 'Register | SLOMUN' };

export default function Register() {
  return (
    <Page title="Register" image="/images/register-banner.png">
      <div className="prose">
        <p>Registration for the second session of SLOMUN will open soon. Fees and deadlines will be posted on this page.</p>
      </div>
      <hr />
      <h2 className="heading">Registration Form</h2>
      <PlaceholderForm
        rows={[
          [['School name', 'School name'], ['Faculty advisor', 'Full name']],
          [['Advisor email', 'Email address', 'email'], ['Number of delegates', 'Enter a number', 'number']],
        ]}
        textarea={['Committee preferences', 'List committees in order of preference']}
        submit="Submit Registration"
        notice="Registration is not open yet. Check back soon."
      />
    </Page>
  );
}
