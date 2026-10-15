import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";
import { landingMetadata } from "@/features/landing/metadata";

export const metadata: Metadata = landingMetadata("en");

export default function EnglishHomePage() {
  return <LandingPage lang="en" />;
}
