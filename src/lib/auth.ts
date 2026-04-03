import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { nextauthSecret } from "@/lib/env";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string },
        });

        if (!user || user.disabled) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!passwordMatch) {
          return null;
        }

        return {
          id: user.id,
          name: user.username,
          role: user.role,
          tokenLimit: user.tokenLimit.toString(),
          tokenUsed: user.tokenUsed.toString(),
          searchCallCount: user.searchCallCount,
          searchMonthlyLimit: user.searchMonthlyLimit,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.tokenLimit = (user as any).tokenLimit;
        token.tokenUsed = (user as any).tokenUsed;
        token.searchCallCount = (user as any).searchCallCount;
        token.searchMonthlyLimit = (user as any).searchMonthlyLimit;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.tokenLimit = token.tokenLimit as string;
        session.user.tokenUsed = token.tokenUsed as string;
        session.user.searchCallCount = token.searchCallCount as number;
        session.user.searchMonthlyLimit = token.searchMonthlyLimit as number;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: nextauthSecret,
  trustHost: true,
});
