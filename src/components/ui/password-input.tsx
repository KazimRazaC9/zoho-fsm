"use client";

import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password field with a show/hide (eye) button. Works with react-hook-form's `register`
 * (ref is forwarded) and with plain controlled inputs.
 */
export function PasswordInput({
  className,
  visible: visibleProp,
  onVisibleChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** Optional controlled visibility (e.g. show a freshly generated password). */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}) {
  const [own, setOwn] = React.useState(false);
  const visible = visibleProp ?? own;
  const toggle = () => {
    if (onVisibleChange) onVisibleChange(!visible);
    else setOwn((v) => !v);
  };

  return (
    <div className="relative w-full">
      <Input type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={toggle}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md outline-none focus-visible:ring-[3px]"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={0}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
