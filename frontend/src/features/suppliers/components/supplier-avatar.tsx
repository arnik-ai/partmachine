import { cn } from "@/lib/utils";
import { portfolioImageSrc } from "../api";
import { initialOf, toneOf } from "../avatar";

const TONES = [
  "from-violet-500 to-violet-800",
  "from-amber-400 to-amber-700",
  "from-slate-500 to-slate-800",
  "from-purple-400 to-purple-700",
  "from-indigo-400 to-indigo-800",
];

const SIZES = {
  sm: "h-9 w-9 text-sm",
  md: "h-12 w-12 text-lg",
  lg: "h-20 w-20 text-3xl",
};

/** عکس پروفایل شرکت؛ اگر شرکت عکسی نگذاشته باشد، حرف اول نامش روی رنگ ثابت همان شرکت */
export function SupplierAvatar({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const box = cn("shrink-0 rounded-full ring-2 ring-background", SIZES[size], className);
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={portfolioImageSrc(logoUrl)} alt={`عکس پروفایل ${name}`} className={cn(box, "bg-muted object-cover")} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(box, "grid place-items-center bg-gradient-to-br font-bold text-white", TONES[toneOf(name, TONES.length)])}
    >
      {initialOf(name)}
    </span>
  );
}
