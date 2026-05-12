import { Header } from "@/components/Header";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { JanAushadhiSpotlight } from "@/components/home/JanAushadhiSpotlight";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <JanAushadhiSpotlight />
        <footer className="px-4 py-8 border-t border-overlay-5 text-center text-text-muted text-xs">
          MedPrice · Open data. Prices change frequently — always confirm with
          the pharmacy before buying.
        </footer>
      </main>
    </>
  );
}
