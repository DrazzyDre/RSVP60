import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * GatherArc logo, rendered with next/image from /public/brand.
 *
 *   variant="full"  → full horizontal logo for LIGHT surfaces (login card,
 *                     white/ivory headers).
 *   variant="light" → full horizontal logo for DARK surfaces (navy nav bands).
 *   variant="mark"  → square icon mark for compact/mobile/icon-only placements.
 *
 * Pass a height utility class (e.g. `className="h-8"`); width scales via
 * `w-auto`. Intrinsic dimensions come from the source PNGs so there is no
 * layout shift. Alt text is always the plain brand name.
 */

type Variant = "full" | "light" | "mark";

const SRC: Record<Variant, string> = {
  full: "/brand/gatherarc-logo.png",
  light: "/brand/gatherarc-logo-light.png",
  mark: "/brand/gatherarc-mark.png",
};

// Intrinsic pixel sizes of the source assets (full/light are 3:1, mark is 1:1).
const DIMS: Record<Variant, { width: number; height: number }> = {
  full: { width: 2172, height: 724 },
  light: { width: 2172, height: 724 },
  mark: { width: 1254, height: 1254 },
};

export function BrandLogo({
  variant = "full",
  className,
  priority,
}: {
  variant?: Variant;
  className?: string;
  priority?: boolean;
}) {
  const { width, height } = DIMS[variant];
  return (
    <Image
      src={SRC[variant]}
      alt="GatherArc"
      width={width}
      height={height}
      priority={priority}
      className={cn("w-auto", className)}
    />
  );
}
