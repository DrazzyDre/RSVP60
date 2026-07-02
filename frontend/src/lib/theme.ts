import type { BackgroundPreset, ThemePreset } from "./types";

/**
 * Lightweight invite theming.
 *
 * Each preset maps to a small, cohesive palette. The public invite page reads
 * an {@link InviteTheme} and applies it via inline styles, so themes never
 * depend on Tailwind config. `elegant` deliberately reproduces the original
 * royal-and-gold look, so existing invites are visually unchanged.
 */

interface Palette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  secondary: string;
  secondaryDark: string;
  secondaryLight: string;
  tintFrom: string;
  tintTo: string;
}

const PALETTES: Record<ThemePreset, Palette> = {
  elegant: {
    primary: "#1E2A6B",
    primaryLight: "#38499E",
    primaryDark: "#141C4A",
    secondary: "#C8A24B",
    secondaryDark: "#9A7A2E",
    secondaryLight: "#E4C778",
    tintFrom: "#f7f4ec",
    tintTo: "#f2eee2",
  },
  classic: {
    primary: "#243B53",
    primaryLight: "#3E5C7E",
    primaryDark: "#15263A",
    secondary: "#9AA5B1",
    secondaryDark: "#616E7C",
    secondaryLight: "#CBD2D9",
    tintFrom: "#f6f7f9",
    tintTo: "#eef1f5",
  },
  joyful: {
    primary: "#C0392B",
    primaryLight: "#E67E22",
    primaryDark: "#922B21",
    secondary: "#F1C40F",
    secondaryDark: "#B7950B",
    secondaryLight: "#F9E79F",
    tintFrom: "#fff7ef",
    tintTo: "#ffeede",
  },
  minimal: {
    primary: "#1A1A1A",
    primaryLight: "#4A4A4A",
    primaryDark: "#000000",
    secondary: "#8A8A8A",
    secondaryDark: "#5A5A5A",
    secondaryLight: "#CFCFCF",
    tintFrom: "#ffffff",
    tintTo: "#f6f6f6",
  },
  formal: {
    primary: "#4A1D2E",
    primaryLight: "#6D3A4B",
    primaryDark: "#2E1019",
    secondary: "#B08D57",
    secondaryDark: "#8A6D3B",
    secondaryLight: "#D9C3A3",
    tintFrom: "#f6f1f0",
    tintTo: "#efe7e6",
  },
};

export interface InviteTheme {
  preset: ThemePreset;
  pageBackground: string;
  heroGradient: string;
  heroEyebrow: string; // eyebrow colour on the dark hero
  accent: string; // primary heading colour
  accentStrong: string;
  eyebrow: string; // eyebrow / label colour on light background
  divider: string; // CSS background for the thin divider
  iconBg: string;
  iconColor: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function pageBackground(p: Palette, bg: BackgroundPreset): string {
  const soft = `radial-gradient(1200px 600px at 50% -10%, ${hexToRgba(
    p.secondary,
    0.18
  )}, transparent 60%), linear-gradient(180deg, ${p.tintFrom} 0%, ${p.tintTo} 100%)`;
  switch (bg) {
    case "plain":
      return `linear-gradient(180deg, ${p.tintFrom} 0%, ${p.tintFrom} 100%)`;
    case "festive":
      return `radial-gradient(900px 500px at 18% -10%, ${hexToRgba(
        p.secondary,
        0.28
      )}, transparent 55%), radial-gradient(900px 500px at 82% 0%, ${hexToRgba(
        p.primary,
        0.18
      )}, transparent 55%), linear-gradient(180deg, ${p.tintFrom} 0%, ${p.tintTo} 100%)`;
    case "soft":
    case "":
    default:
      return soft;
  }
}

export function getInviteTheme(
  preset: ThemePreset | undefined,
  accentColor: string | undefined,
  background: BackgroundPreset | undefined
): InviteTheme {
  const p = PALETTES[preset ?? "elegant"] ?? PALETTES.elegant;
  const accent = accentColor || p.primary;
  const accentStrong = accentColor || p.primaryDark;

  return {
    preset: preset ?? "elegant",
    pageBackground: pageBackground(p, background ?? ""),
    heroGradient: `linear-gradient(135deg, ${p.primary} 0%, ${p.primaryLight} 55%, ${p.primaryDark} 100%)`,
    heroEyebrow: p.secondaryLight,
    accent,
    accentStrong,
    eyebrow: accentColor || p.secondaryDark,
    divider: `linear-gradient(90deg, transparent, ${
      accentColor || p.secondary
    }, transparent)`,
    iconBg: hexToRgba(accent, 0.1),
    iconColor: accent,
  };
}
