import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";
import { landingMetadata } from "@/features/landing/metadata";

export const metadata: Metadata = landingMetadata("fa");

export default function HomePage() {
  return <LandingPage lang="fa" />;
}
