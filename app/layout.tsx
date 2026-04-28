import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MedPrice — Compare Medicine Prices in India | 1mg, Apollo, Netmeds, PharmEasy",
    template: "%s · MedPrice",
  },
  description:
    "Compare medicine prices instantly across 1mg, Apollo, Netmeds, PharmEasy, Truemeds and MrMed. Find the cheapest brand, check Jan Aushadhi generic alternatives, and verify delivery to your pincode — free and unbiased.",
  keywords: [
    "medicine price comparison India",
    "compare drug prices",
    "1mg vs Apollo vs Netmeds",
    "PharmEasy price",
    "Jan Aushadhi alternatives",
    "cheap medicines online India",
    "generic medicine finder",
    "pincode delivery medicine",
    "MedPrice",
  ],
  authors: [{ name: "MedPrice" }],
  category: "health",
  applicationName: "MedPrice",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: SITE_URL,
    siteName: "MedPrice",
    title: "MedPrice — Compare Medicine Prices in India",
    description:
      "Find the cheapest medicine across India's top online pharmacies and Jan Aushadhi government stores. Pincode-aware delivery, salt-level alternatives, price history.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MedPrice — Compare Medicine Prices in India",
    description:
      "Compare prices across 1mg, Apollo, Netmeds, PharmEasy, Truemeds, MrMed and Jan Aushadhi.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
    },
  },
  alternates: { canonical: SITE_URL },
};

export const viewport: Viewport = {
  themeColor: "#06040d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="relative min-h-screen overflow-x-hidden">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "MedPrice",
              url: SITE_URL,
              description:
                "Compare medicine prices across India's top online pharmacies and Jan Aushadhi government generic stores.",
              potentialAction: {
                "@type": "SearchAction",
                target: `${SITE_URL}/search?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "MedPrice",
              url: SITE_URL,
              logo: `${SITE_URL}/icon.png`,
              sameAs: [],
              description:
                "Free, unbiased medicine price comparison for India covering 1mg, Apollo, Netmeds, PharmEasy, Truemeds, MrMed and Jan Aushadhi.",
            }),
          }}
        />
        <div className="relative z-10">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
