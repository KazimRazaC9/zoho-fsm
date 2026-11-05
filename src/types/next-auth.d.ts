import type { DefaultSession } from "next-auth";
import type { AppRole } from "@/lib/roles";

type FieldServeClaims = {
  role: AppRole;
  companyId: string | null;
  companyName: string | null;
  timeZone: string | null;
  currency: string | null;
};

declare module "next-auth" {
  interface User extends FieldServeClaims {
    fullName?: string;
  }

  interface Session {
    user: { id: string } & FieldServeClaims & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends Partial<FieldServeClaims> {
    uid?: string;
  }
}
