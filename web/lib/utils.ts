import { cx } from "@/components/ui/tooltip-utils/cx";

export function cn(...inputs: Array<string | false | null | undefined>): string {
  return cx(...inputs);
}
