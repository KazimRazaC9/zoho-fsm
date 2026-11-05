import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { LoginForm } from "./login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reason?: string }>;
}) {
  const { callbackUrl, reason } = await searchParams;
  return (
    <main className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-lg">
            <Wrench className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">FieldServe</h1>
          <p className="text-muted-foreground text-sm">Sign in to manage jobs, dispatch and invoices.</p>
        </div>
        {reason === "inactive" && (
          <Alert>
            <AlertDescription>
              Your account or company has been deactivated. Contact your administrator.
            </AlertDescription>
          </Alert>
        )}
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
