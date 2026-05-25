"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AnimatedCard({ className, ...props }: CardProps) {
  return (
    <div
      role="region"
      aria-labelledby="card-title"
      aria-describedby="card-description"
      className={cn(
        "group/animated-card relative w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: CardProps) {
  return (
    <div
      role="group"
      className={cn(
        "flex flex-col space-y-1.5 border-t border-border p-4",
        className
      )}
      {...props}
    />
  );
}

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}
export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn(
        "text-lg font-semibold leading-none tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  );
}

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}
export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export function CardVisual({ className, ...props }: CardProps) {
  return (
    <div className={cn("h-[180px] w-full overflow-hidden", className)} {...props} />
  );
}

interface Visual2Props {
  mainColor?: string;
  secondaryColor?: string;
  gridColor?: string;
}

export function Visual2({
  mainColor = "#14b8a6",
  secondaryColor = "#0d9488",
  gridColor = "#80808015",
}: Visual2Props) {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <div
        className="absolute inset-0 z-20"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ "--color": mainColor, "--secondary-color": secondaryColor } as React.CSSProperties}
      />
      <div className="relative h-[180px] w-full overflow-hidden rounded-t-xl">
        <Layer1 hovered={hovered} color={mainColor} secondaryColor={secondaryColor} />
        <Layer2 color={mainColor} />
        <Layer3 color={mainColor} />
        <Layer4 color={mainColor} secondaryColor={secondaryColor} hovered={hovered} />
        <EllipseGradient color={mainColor} />
        <GridLayer color={gridColor} />
      </div>
    </>
  );
}

interface LayerProps {
  color: string;
  secondaryColor?: string;
  hovered?: boolean;
}

const EllipseGradient: React.FC<{ color: string }> = ({ color }) => (
  <div className="absolute inset-0 z-[5] flex h-full w-full items-center justify-center">
    <svg
      width="100%"
      height="180"
      viewBox="0 0 356 180"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="356" height="180" fill="url(#paint0_radial_diag_1)" />
      <defs>
        <radialGradient
          id="paint0_radial_diag_1"
          cx="0" cy="0" r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(178 98) rotate(90) scale(98 178)"
        >
          <stop stopColor={color} stopOpacity="0.25" />
          <stop offset="0.34" stopColor={color} stopOpacity="0.15" />
          <stop offset="1" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  </div>
);

const GridLayer: React.FC<{ color: string }> = ({ color }) => (
  <div
    style={{ "--grid-color": color } as React.CSSProperties}
    className="pointer-events-none absolute inset-0 z-[4] h-full w-full bg-transparent bg-[linear-gradient(to_right,var(--grid-color)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-color)_1px,transparent_1px)] bg-[size:20px_20px] bg-center opacity-70 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]"
  />
);

const Layer1: React.FC<LayerProps> = ({ hovered, color, secondaryColor }) => {
  const [mainProgress, setMainProgress] = useState(12.5);
  const [secondaryProgress, setSecondaryProgress] = useState(0);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (hovered) {
      timeout = setTimeout(() => {
        setMainProgress(66);
        setSecondaryProgress(100);
      }, 200);
    } else {
      setMainProgress(12.5);
      setSecondaryProgress(0);
    }
    return () => clearTimeout(timeout);
  }, [hovered]);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const mainDashoffset = circumference - (mainProgress / 100) * circumference;
  const secondaryDashoffset = circumference - (secondaryProgress / 100) * circumference;

  return (
    <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute top-0 left-0 z-[7] flex h-[360px] w-full transform items-center justify-center transition-transform duration-500 group-hover/animated-card:-translate-y-[90px] group-hover/animated-card:scale-110">
      <div className="relative flex h-[120px] w-[120px] items-center justify-center text-foreground/20">
        <svg width="120" height="120" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="10" fill="transparent" opacity={0.2} />
          <circle
            cx="50" cy="50" r={radius}
            stroke={secondaryColor}
            strokeWidth="14" fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={secondaryDashoffset}
            transform="rotate(-90 50 50)"
            style={{ transition: "stroke-dashoffset 0.5s cubic-bezier(0.6,0.6,0,1)" }}
          />
          <circle
            cx="50" cy="50" r={radius}
            stroke={color}
            strokeWidth="14" fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={mainDashoffset}
            transform="rotate(-90 50 50)"
            style={{ transition: "stroke-dashoffset 0.5s cubic-bezier(0.6,0.6,0,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-foreground">
            {hovered ? (secondaryProgress > 66 ? secondaryProgress : mainProgress) : mainProgress}%
          </span>
        </div>
      </div>
    </div>
  );
};

const Layer2: React.FC<{ color: string }> = ({ color }) => (
  <div
    className="relative h-full w-full"
    style={{ "--color": color } as React.CSSProperties}
  >
    <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[6] flex w-full translate-y-0 items-start justify-center bg-transparent p-4 transition-transform duration-500 group-hover/animated-card:translate-y-full">
      <div className="ease-[cubic-bezier(0.6,0.6,0,1)] rounded-md border border-border bg-card/25 px-2 py-1.5 opacity-100 backdrop-blur-sm transition-opacity duration-500 group-hover/animated-card:opacity-0">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 shrink-0 rounded-full bg-[var(--color)]" />
          <p className="text-xs text-foreground">AI Qualification Score</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Hover to see your pipeline shift.</p>
      </div>
    </div>
  </div>
);

const Layer3: React.FC<{ color: string }> = ({ color }) => (
  <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[6] flex translate-y-full items-center justify-center opacity-0 transition-all duration-500 group-hover/animated-card:translate-y-0 group-hover/animated-card:opacity-100">
    <svg
      width="100%"
      height="180"
      viewBox="0 0 356 180"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="356" height="180" fill="url(#paint0_linear_diag_2)" />
      <defs>
        <linearGradient id="paint0_linear_diag_2" x1="178" y1="0" x2="178" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0.35" stopColor={color} stopOpacity="0" />
          <stop offset="1" stopColor={color} stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

const Layer4: React.FC<LayerProps> = ({ color, secondaryColor, hovered }) => {
  const items = [
    { id: 1, translateX: "100", translateY: "50",  text: "Budget fit" },
    { id: 2, translateX: "100", translateY: "-50", text: "Move-in date" },
    { id: 3, translateX: "125", translateY: "0",   text: "Neighborhood" },
    { id: 4, translateX: "-125", translateY: "0",  text: "Household size" },
    { id: 5, translateX: "-100", translateY: "50", text: "Pet policy" },
    { id: 6, translateX: "-100", translateY: "-50", text: "Credit score" },
  ];
  return (
    <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[7] flex items-center justify-center opacity-0 transition-opacity duration-500 group-hover/animated-card:opacity-100">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute flex items-center justify-center gap-1 rounded-full border border-border bg-card/70 px-1.5 py-0.5 backdrop-blur-sm transition-all duration-500"
          style={{
            transform: hovered
              ? `translate(${item.translateX}px, ${item.translateY}px)`
              : "translate(0px, 0px)",
          }}
        >
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: index < 3 ? color : secondaryColor }}
          />
          <span className="ml-1 text-[10px] text-foreground">{item.text}</span>
        </div>
      ))}
    </div>
  );
};
