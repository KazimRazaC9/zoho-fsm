import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Shown for menu items whose screens arrive in a later phase. */
export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <Card>
        <CardHeader className="items-center text-center">
          <Construction className="text-muted-foreground mb-2 size-8" />
          <CardTitle>{title}</CardTitle>
          <CardDescription>This screen is delivered in a later phase of the project plan.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Badge variant="secondary">Phase {phase}</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
