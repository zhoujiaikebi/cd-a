import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    role: string;
    tokenLimit: string;
    tokenUsed: string;
    searchCallCount: number;
    searchMonthlyLimit: number;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      role: string;
      tokenLimit: string;
      tokenUsed: string;
      searchCallCount: number;
      searchMonthlyLimit: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    tokenLimit: string;
    tokenUsed: string;
    searchCallCount: number;
    searchMonthlyLimit: number;
  }
}