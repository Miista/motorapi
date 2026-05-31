import { chromium, Browser, Page } from "playwright";

const MOTORREGISTER_URL =
  "https://motorregister.skat.dk/dmr-kerne/koeretoejdetaljer/visKoeretoej";

export interface VehicleData {
  plate: string;
  tabs: Record<string, Record<string, string>>;
}

async function scrapeCurrentTab(page: Page): Promise<Record<string, string>> {
  // Labels and values alternate as .colLabel / .colValue siblings
  const pairs = await page.$$eval(
    ".h-tab-content .colLabel, .h-tab-content .colValue",
    (els) => {
      const result: Array<{ cls: string; text: string }> = [];
      for (const el of els) {
        result.push({
          cls: el.className,
          text: (el as HTMLElement).innerText.trim(),
        });
      }
      return result;
    }
  );

  const data: Record<string, string> = {};
  for (let i = 0; i < pairs.length - 1; i++) {
    const cur = pairs[i];
    const next = pairs[i + 1];
    if (cur.cls.includes("colLabel") && next.cls.includes("colValue")) {
      const label = cur.text.replace(/:$/, "").trim();
      const value = next.text === "-" ? "" : next.text;
      if (label && label !== "Angiv eventuelt dato for historisk visning") {
        data[label] = value;
      }
      i++; // skip the value we just consumed
    }
  }

  return data;
}

export async function lookupPlate(plate: string): Promise<VehicleData> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    await page.goto(MOTORREGISTER_URL, { waitUntil: "networkidle" });

    await page.fill("#soegeord", plate.toUpperCase().replace(/\s/g, ""));

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click("#fremsoegKtBtn"),
    ]);

    // Detect no-results
    const bodyText = await page.textContent("body");
    if (
      bodyText &&
      (bodyText.includes("Ingen køretøjer fundet") ||
        bodyText.includes("ikke fundet"))
    ) {
      throw new Error(`No vehicle found for plate: ${plate}`);
    }

    const tabs: Record<string, Record<string, string>> = {};

    // Scrape the first tab (already loaded, marked as selected)
    const firstTabTitle = await page
      .locator(".h-tab-btn.selected .title")
      .first()
      .textContent();
    const cleanTitle = (firstTabTitle ?? "Køretøj").replace(/\s+/g, " ").trim();
    tabs[cleanTitle] = await scrapeCurrentTab(page);

    // Get remaining tab links
    const tabLinks = await page.$$eval(".h-tab-btn a", (els) =>
      els.map((e) => ({
        text: (e as HTMLAnchorElement).innerText.trim(),
        href: (e as HTMLAnchorElement).href,
      }))
    );

    for (const tab of tabLinks) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle" }),
        page.goto(tab.href),
      ]);
      tabs[tab.text] = await scrapeCurrentTab(page);
    }

    return { plate: plate.toUpperCase(), tabs };
  } finally {
    if (browser) await browser.close();
  }
}
