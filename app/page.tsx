import { Header } from "@/components/Header";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { JanAushadhiSpotlight } from "@/components/home/JanAushadhiSpotlight";
import { RecentSearches } from "@/components/home/RecentSearches";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <JanAushadhiSpotlight />
        <RecentSearches />
        <footer className="px-4 py-8 border-t border-white/5 text-center text-text-muted text-xs">
          MedPrice · Open data, free forever. Prices change frequently — confirm
          before purchase.
        </footer>
      </main>
    </>
  );
}
