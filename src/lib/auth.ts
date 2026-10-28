import { getServerSession, type NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { db } from './db';
import { credentialsSchema } from './validation';
import { rateLimit } from './security';
import { ensure } from './errors';
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  pages: { signIn: '/signin' },
  providers: [
    Credentials({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(input) {
        const parsed = credentialsSchema.safeParse(input);
        if (!parsed.success) return null;
        await rateLimit(`login:${parsed.data.email}`, 10, 900000);
        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        const valid = await compare(
          parsed.data.password,
          user?.passwordHash ?? '$2b$12$0WZ4A1XkF7z6fzHPTggJeO9jG5zCCO9RrN3h4GrSKf6nGfhmJPucW',
        );
        if (!user || !valid) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.sv = (user as unknown as { sessionVersion: number }).sessionVersion;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid);
        session.user.sessionVersion = Number(token.sv);
      }
      return session;
    },
  },
};
export async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      sessionVersion: true,
      zapierConsent: true,
      elasticConsent: true,
    },
  });
  return user && user.sessionVersion === session.user.sessionVersion ? user : null;
}
export async function requireUser() {
  const user = await currentUser();
  ensure(user, 401, 'Please sign in to continue.');
  return user;
}
