// scripts/fetch-rss-to-json.js
// ------------------------------------------------------------
// Run this script (manually or via GitHub Actions) to fetch six
// public RSS/Atom feeds and write them out as JSON under members/data/.
// ------------------------------------------------------------

const fetch = require('node-fetch');    // version 2.x
const xml2js = require('xml2js');        // xml2js parser
const fs = require('fs');
const path = require('path');

// ─── 1. MAP EACH CATEGORY TO A FREELY-AVAILABLE, WORKING RSS URL ─────
const FEEDS = {
  // CATEGORY NAME JSON_FILENAME: RSS_URL
  'golf-science.json':  'https://bjsm.bmj.com/rss/current.xml',
  'strength.json':      'https://pubmed.ncbi.nlm.nih.gov/rss/journals/nsca/',
  'nutrition.json':     'https://jissn.biomedcentral.com/articles.atom',
  'psychology.json':    'https://www.frontiersin.org/journals/sports-and-active-living/articles.rss',
  'news.json':          'http://www.espn.com/espn/rss/golf/news',
  'industry.json':      'https://rss.golfdigest.com/rss/golf/play'
};

// ─── 2. PARSE A SINGLE RSS/ATOM URL INTO AN ARRAY OF {title,link,date,author,snippet} ─────
async function parseRssToJson(rssUrl) {
  const response = await fetch(rssUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${rssUrl} (status ${response.status})`);
  }
  const xmlText = await response.text();

  const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: true });
  const result = await parser.parseStringPromise(xmlText);

  const items = [];

  // CASE A: RSS 2.0 (e.g. <rss><channel><item>…)
  if (result.rss && result.rss.channel && result.rss.channel[0].item) {
    const channelItems = result.rss.channel[0].item;
    for (const item of channelItems) {
      const title = item.title && item.title[0] ? item.title[0] : 'No title';
      let link = '';
      if (item.link && item.link[0]) {
        link = (typeof item.link[0] === 'string') ? item.link[0] : item.link[0]._;
      }
      const date = item.pubDate && item.pubDate[0]
        ? new Date(item.pubDate[0]).toISOString()
        : new Date().toISOString();
      const author = item.author && item.author[0] ? item.author[0] : '';
      let snippet = '';
      if (item.description && item.description[0]) {
        snippet = item.description[0].replace(/<[^>]*>/g, '').slice(0, 160);
      }

      items.push({ title, link, date, author, snippet });
    }
  }
  // CASE B: Atom (e.g. <feed><entry>…)
  else if (result.feed && result.feed.entry) {
    const feedEntries = result.feed.entry;
    for (const entry of feedEntries) {
      const title = (entry.title && entry.title[0] && (entry.title[0]._ || entry.title[0]))
        ? (entry.title[0]._ || entry.title[0])
        : 'No title';

      let link = '';
      if (entry.link && entry.link[0] && entry.link[0].$.href) {
        link = entry.link[0].$.href;
      }

      const date = entry.updated && entry.updated[0]
        ? new Date(entry.updated[0]).toISOString()
        : (entry.published && entry.published[0]
          ? new Date(entry.published[0]).toISOString()
          : new Date().toISOString());

      let author = '';
      if (entry.author && entry.author[0] && entry.author[0].name && entry.author[0].name[0]) {
        author = entry.author[0].name[0];
      }

      let snippet = '';
      if (entry.summary && entry.summary[0]) {
        snippet = (entry.summary[0]._ || entry.summary[0]).toString().slice(0, 160);
      } else if (entry.content && entry.content[0]) {
        snippet = (entry.content[0]._ || entry.content[0]).toString().slice(0, 160);
      }

      items.push({ title, link, date, author, snippet });
    }
  }

  // Sort newest → oldest, then keep top 10
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  return items.slice(0, 10);
}

// ─── 3. ITERATE OVER EACH FEED, PARSE IT, AND WRITE JSON FILES ─────
(async () => {
  try {
    // Ensure members/data/ exists
    const outDir = path.join(__dirname, '../members/data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    for (const [filename, rssUrl] of Object.entries(FEEDS)) {
      try {
        const items = await parseRssToJson(rssUrl);
        const outPath = path.join(outDir, filename);
        fs.writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf-8');
        console.log(`✅ Wrote ${outPath} (${items.length} items)`);
      } catch (err) {
        console.error(`⚠️  Error processing ${rssUrl}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  }
})();
