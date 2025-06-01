// scripts/fetch-rss-to-json.js
// Run this (manually or via GitHub Actions) to populate six JSON files in members/data/

const fetch = require('node-fetch');    // version 2.x
const xml2js = require('xml2js');        // xml2js library
const fs = require('fs');
const path = require('path');

// 1. Map each category to its RSS (or Atom) URL and the desired output filename:
const FEEDS = {
  'golf-science.json':  'https://bjsm.bmj.com/rss/current.xml',
  'strength.json':      'https://www.nsca.com/journal/rss/',
  'nutrition.json':     'https://jissn.biomedcentral.com/articles.atom',
  'psychology.json':    'https://journals.humankinetics.com/feed/journal/jsep',
  'news.json':          'http://www.espn.com/espn/rss/golf/news',
  'industry.json':      'https://www.golfcourseindustry.com/feed/rss2'
};

// 2. Helper: Given RSS/Atom URL, fetch it, parse XML, return an array of items:
async function parseRssToJson(rssUrl) {
  const response = await fetch(rssUrl);
  if (!response.ok) throw new Error(`Failed to fetch ${rssUrl} (status ${response.status})`);
  const xmlText = await response.text();

  // Parse XML into JS object
  const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: true });
  const result = await parser.parseStringPromise(xmlText);

  const items = [];

  // CASE A: RSS 2.0 style → result.rss.channel[0].item[]
  if (result.rss && result.rss.channel && result.rss.channel[0].item) {
    const channelItems = result.rss.channel[0].item;
    for (const item of channelItems) {
      // title
      const title = item.title && item.title[0] ? item.title[0] : 'No title';
      // link
      let link = '';
      if (item.link && item.link[0]) {
        link = (typeof item.link[0] === 'string') ? item.link[0] : item.link[0]._;
      }
      // pubDate → to ISO
      const date = item.pubDate && item.pubDate[0]
        ? new Date(item.pubDate[0]).toISOString()
        : new Date().toISOString();
      // author (optional)
      const author = item.author && item.author[0] ? item.author[0] : '';
      // description/snippet
      let snippet = '';
      if (item.description && item.description[0]) {
        // strip HTML tags and trim to ~160 chars
        snippet = item.description[0].replace(/<[^>]*>/g, '').slice(0, 160);
      }

      items.push({ title, link, date, author, snippet });
    }
  }
  // CASE B: Atom style → result.feed.entry[]
  else if (result.feed && result.feed.entry) {
    const feedEntries = result.feed.entry;
    for (const entry of feedEntries) {
      // title
      const title = (entry.title && entry.title[0] && (entry.title[0]._ || entry.title[0]))
        ? (entry.title[0]._ || entry.title[0])
        : 'No title';

      // link (usually in entry.link[0].$.href)
      let link = '';
      if (entry.link && entry.link[0] && entry.link[0].$.href) {
        link = entry.link[0].$.href;
      }

      // updated or published
      const date = entry.updated && entry.updated[0]
        ? new Date(entry.updated[0]).toISOString()
        : (entry.published && entry.published[0]
          ? new Date(entry.published[0]).toISOString()
          : new Date().toISOString());

      // author name
      let author = '';
      if (entry.author && entry.author[0] && entry.author[0].name && entry.author[0].name[0]) {
        author = entry.author[0].name[0];
      }

      // snippet: prefer summary, fallback to content (strip HTML)
      let snippet = '';
      if (entry.summary && entry.summary[0]) {
        snippet = (entry.summary[0]._ || entry.summary[0]).toString().slice(0, 160);
      } else if (entry.content && entry.content[0]) {
        snippet = (entry.content[0]._ || entry.content[0]).toString().slice(0, 160);
      }

      items.push({ title, link, date, author, snippet });
    }
  }

  // 3. Sort items by date descending, then limit to 10 most recent
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  return items.slice(0, 10);
}

// 4. Drive: Iterate over each feed mapping, parse, and write to disk
(async () => {
  try {
    // Ensure `members/data/` exists (create if missing)
    const outDir = path.join(__dirname, '../members/data');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    for (const [filename, rssUrl] of Object.entries(FEEDS)) {
      try {
        const items = await parseRssToJson(rssUrl);
        // Write JSON to members/data/<filename>
        const outPath = path.join(outDir, filename);
        fs.writeFileSync(outPath, JSON.stringify(items, null, 2), 'utf-8');
        console.log(`✅ Wrote ${outPath} with ${items.length} items`);
      } catch (err) {
        console.error(`⚠️  Error processing ${rssUrl}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  }
})();

