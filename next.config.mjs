/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      "playwright-core",
      "@sparticuz/chromium-min",
      "pdf-parse",
      "@prisma/client",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            // connect-src must include the third-party endpoints the client
            // calls directly:
            //   - photon.komoot.io  → reverse geocode + place search
            //   - nominatim.openstreetmap.org → reverse geocode fallback
            //   - api.postalpincode.in → numeric pincode → city lookup
            // Without these, every browser-side fetch silently fails and
            // the location flow can never resolve a city/pincode.
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
              "font-src 'self' https://fonts.gstatic.com; " +
              "img-src 'self' https: data:; " +
              "connect-src 'self' https://photon.komoot.io https://nominatim.openstreetmap.org https://api.postalpincode.in;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
