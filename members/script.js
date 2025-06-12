const FEEDS = {
  golfIndustryFeed: 'https://rss.golfdigest.com/GolfDigest_full.rss',
  proTourFeed:       'https://www.pgatour.com/rss/news.rss',
  equipmentFeed:     'https://golficity.com/feed/',
  fitnessFeed:       'https://www.menshealth.com/rss/all.xml',
  nutritionFeed:     'https://www.eatright.org/rss/the-journal-of-nutrition',
  psychologyFeed:    'https://www.psychologytoday.com/us/feeds/hashtags/sports',
  medicineFeed:      'https://www.nejm.org/action/showFeed?type=topic&feed=rss&jc=medicine',
  youthFeed:         'https://www.ajga.org/junior-golfer/rss'
};

async function fetchAndRender(feedId, url) {
  try {
    const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const items = doc.querySelectorAll('item');
    const container = document.getElementById(feedId);

    items.forEach((item, i) => {
      if (i >= 5) return;  // Show 5 items max
      const title = item.querySelector('title')?.textContent || 'No Title';
      const link = item.querySelector('link')?.textContent;
      const desc = item.querySelector('description')?.textContent;
      const li = document.createElement('li');
      li.className = 'feed-item';
      li.innerHTML = `<a href="${link}" target="_blank">${title}</a><p>${desc}</p>`;
      container.appendChild(li);
    });
  } catch (e) {
    console.error('Error loading', feedId, e);
  }
}

Object.entries(FEEDS).forEach(([id, url]) => fetchAndRender(id, url));
