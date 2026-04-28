import { scrape as one } from "../lib/scrapers/onemg";
import { scrape as netmeds } from "../lib/scrapers/netmeds";
import { scrape as pharmeasy } from "../lib/scrapers/pharmeasy";
import { scrape as apollo } from "../lib/scrapers/apollo";
import { scrape as truemeds } from "../lib/scrapers/truemeds";
import { scrape as mrmed } from "../lib/scrapers/mrmed";

const QUERY = process.argv[2] ?? "paracetamol";

async function run() {
  const SCRAPERS = [
    { name: "1mg", fn: one },
    { name: "netmeds", fn: netmeds },
    { name: "pharmeasy", fn: pharmeasy },
    { name: "apollo", fn: apollo },
    { name: "truemeds", fn: truemeds },
    { name: "mrmed", fn: mrmed },
  ];

  for (const s of SCRAPERS) {
    process.stdout.write(`\n[${s.name}] `);
    const t0 = Date.now();
    try {
      const results = await s.fn(QUERY);
      console.log(`${results.length} results in ${Date.now() - t0}ms`);
      for (const r of results.slice(0, 3)) {
        console.log(
          `  • ${r.productName.slice(0, 60).padEnd(60)} | MRP ₹${r.mrp ?? "—"} | sell ₹${r.sellingPrice ?? "—"} | ${r.packSize ?? "—"}`
        );
      }
    } catch (e: any) {
      console.log(`FAIL: ${e.message}`);
    }
  }
}

run();
