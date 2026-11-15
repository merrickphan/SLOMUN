import { cookies } from 'next/headers';
import { COOKIE, verify } from './auth';

export async function getSession() {
  const jar = await cookies();
  return verify(jar.get(COOKIE)?.value);
}
