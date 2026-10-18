import type { SVGProps } from "react";

/** Schlichte Linien-Icons (24×24, 1.8 px Strich) für Navigation und Leisten. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9v10.5h13V9" />
    <path d="M10 19.5v-5h4v5" />
  </Icon>
);

export const ChecklistIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m4 6.5 1.5 1.5 3-3" />
    <path d="m4 13.5 1.5 1.5 3-3" />
    <path d="M12 7h8M12 14h8M4.5 19.5h15.5" />
  </Icon>
);

export const TrophyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0Z" />
    <path d="M7.5 6H4.5a3 3 0 0 0 3 4M16.5 6h3a3 3 0 0 1-3 4" />
    <path d="M12 13.5V17M8.5 20h7M9.5 17h5" />
  </Icon>
);

export const PersonIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Icon>
);

export const GearIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
  </Icon>
);

export const BellIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icon>
);

export const StarIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z" />
  </Icon>
);
