\type FeedType = 'article' | 'blog' | 'event';

interface Article {
  id: number;
  title: string;
  excerpt: string;
  url: string;
  created_at: string;
}

interface BlogPost {
  id: number;
  title: string;
  excerpt: string;
  author: string;
  url: string;
  created_at: string;
}

interface EventItem {
  id: number;
  title: string;
  excerpt: string;
  location: string;
  url: string;
  starts_at: string;
}

interface FeedEntry {
  type: FeedType;
  title: string;
  excerpt: string;
  url: string;
  date: string;
  meta: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderEmptyView(container: HTMLElement, message: string): void {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'view-empty';
  const mark = document.createElement('span');
  mark.className = 'logo-mark';
  mark.style.display = 'inline-block';
  const text = document.createElement('p');
  text.textContent = message;
  wrap.appendChild(mark);
  wrap.appendChild(text);
  container.appendChild(wrap);
}

function renderArticles(articles: Article[]): void {
  const container = document.getElementById('articles-grid');
  if (!container) return;
  container.innerHTML = '';
  if (articles.length === 0) {
    renderEmptyView(container, 'No articles yet. Check back soon.');
    return;
  }
  articles.forEach((article) => {
    const card = document.createElement('div');
    card.className = 'card';

    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = 'Article';

    const title = document.createElement('h3');
    title.textContent = article.title;

    const excerpt = document.createElement('p');
    excerpt.textContent = article.excerpt;

    const link = document.createElement('a');
    link.className = 'card-link';
    link.href = article.url;
    link.textContent = 'Read more';

    card.appendChild(chip);
    card.appendChild(title);
    card.appendChild(excerpt);
    card.appendChild(link);
    container.appendChild(card);
  });
}

function renderBlogs(posts: BlogPost[]): void {
  const container = document.getElementById('blogs-list');
  if (!container) return;
  container.innerHTML = '';
  if (posts.length === 0) {
    renderEmptyView(container, 'No blog posts yet. Check back soon.');
    return;
  }
  posts.forEach((post) => {
    const card = document.createElement('div');
    card.className = 'blog-post-card';

    const thumb = document.createElement('div');
    thumb.className = 'blog-post-thumb';

    const body = document.createElement('div');

    const title = document.createElement('h3');
    title.textContent = post.title;

    const excerpt = document.createElement('p');
    excerpt.textContent = post.excerpt;

    const author = document.createElement('p');
    author.className = 'form-note';
    author.textContent = 'By ' + post.author;

    const link = document.createElement('a');
    link.className = 'card-link';
    link.href = post.url;
    link.textContent = 'Read post';

    body.appendChild(title);
    body.appendChild(excerpt);
    body.appendChild(author);
    body.appendChild(link);

    card.appendChild(thumb);
    card.appendChild(body);
    container.appendChild(card);
  });
}

function renderEvents(events: EventItem[]): void {
  const container = document.getElementById('events-list');
  if (!container) return;
  container.innerHTML = '';
  if (events.length === 0) {
    renderEmptyView(container, 'No upcoming events right now.');
    return;
  }
  events.forEach((event) => {
    const row = document.createElement('div');
    row.className = 'list-row';

    const info = document.createElement('div');
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = formatDate(event.starts_at) + ' · ' + event.location;

    const title = document.createElement('h3');
    title.textContent = event.title;

    info.appendChild(meta);
    info.appendChild(title);

    const link = document.createElement('a');
    link.className = 'btn btn-secondary';
    link.href = event.url;
    link.textContent = 'View event';

    row.appendChild(info);
    row.appendChild(link);
    container.appendChild(row);
  });
}

function renderFeed(entries: FeedEntry[]): void {
  const container = document.getElementById('feed-list');
  if (!container) return;
  container.innerHTML = '';
  if (entries.length === 0) {
    renderEmptyView(container, 'Nothing to show yet. New articles, posts, and events will land here.');
    return;
  }
  entries.forEach((entry, index) => {
    const item = document.createElement('div');
    item.className = 'feed-item type-' + entry.type;
    item.style.animationDelay = Math.min(index * 40, 400) + 'ms';

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = entry.meta;

    const title = document.createElement('h3');
    title.textContent = entry.title;

    const excerpt = document.createElement('p');
    excerpt.textContent = entry.excerpt;

    const link = document.createElement('a');
    link.className = 'card-link';
    link.href = entry.url;
    link.textContent = entry.type === 'event' ? 'View event' : 'Read more';

    item.appendChild(meta);
    item.appendChild(title);
    item.appendChild(excerpt);
    item.appendChild(link);
    container.appendChild(item);
  });
}

function buildFeed(articles: Article[], blogs: BlogPost[], events: EventItem[]): FeedEntry[] {
  const entries: FeedEntry[] = [];
  articles.forEach((article) => {
    entries.push({
      type: 'article',
      title: article.title,
      excerpt: article.excerpt,
      url: article.url,
      date: article.created_at,
      meta: 'Article · ' + formatDate(article.created_at),
    });
  });
  blogs.forEach((post) => {
    entries.push({
      type: 'blog',
      title: post.title,
      excerpt: post.excerpt,
      url: post.url,
      date: post.created_at,
      meta: 'Blog · ' + post.author + ' · ' + formatDate(post.created_at),
    });
  });
  events.forEach((event) => {
    entries.push({
      type: 'event',
      title: event.title,
      excerpt: event.excerpt,
      url: event.url,
      date: event.starts_at,
      meta: 'Event · ' + formatDate(event.starts_at) + ' · ' + event.location,
    });
  });
  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return entries;
}

function setupSidebarTabs(): void {
  const links = document.querySelectorAll<HTMLButtonElement>('.sidebar-link[data-view]');
  const views = document.querySelectorAll<HTMLElement>('.dashboard-view');
  if (links.length === 0) return;

  links.forEach((link) => {
    link.addEventListener('click', () => {
      const target = link.dataset.view;
      links.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      views.forEach((view) => {
        view.classList.toggle('active', view.id === 'view-' + target);
      });
    });
  });
}

function setupSidebarToggle(): void {
  const shell = document.getElementById('app-shell');
  const toggle = document.getElementById('sidebar-toggle');
  if (!shell || !toggle) return;

  let collapsed = false;
  try {
    collapsed = window.localStorage.getItem('vijana-sidebar-collapsed') === 'true';
  } catch (error) {
    collapsed = false;
  }
  if (collapsed) {
    shell.classList.add('collapsed');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '›';
  }

  toggle.addEventListener('click', () => {
    const isCollapsed = shell.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    toggle.textContent = isCollapsed ? '›' : '‹';
    try {
      window.localStorage.setItem('vijana-sidebar-collapsed', String(isCollapsed));
    } catch (error) {
      return;
    }
  });
}

interface SidebarUser {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

async function setupSidebarAvatar(): Promise<void> {
  const avatarEl = document.getElementById('sidebar-avatar');
  if (!avatarEl) return;
  const data = await fetchJson<{ user: SidebarUser | null }>('/api/me');
  const user = data ? data.user : null;
  if (!user) {
    avatarEl.textContent = '?';
    return;
  }
  if (user.avatarUrl) {
    avatarEl.textContent = '';
    avatarEl.style.backgroundImage = 'url(' + user.avatarUrl + ')';
    avatarEl.style.backgroundSize = 'cover';
    avatarEl.style.backgroundPosition = 'center';
    return;
  }
  const label = user.displayName && user.displayName.trim().length > 0 ? user.displayName : user.username;
  avatarEl.textContent = label ? label.charAt(0).toUpperCase() : '?';
}

async function loadDashboardUserContent(): Promise<void> {
  const feedContainer = document.getElementById('feed-list');
  const articlesContainer = document.getElementById('articles-grid');
  const blogsContainer = document.getElementById('blogs-list');
  const eventsContainer = document.getElementById('events-list');
  if (!feedContainer && !articlesContainer && !blogsContainer && !eventsContainer) return;

  const [articles, blogs, events] = await Promise.all([
    fetchJson<Article[]>('/api/articles'),
    fetchJson<BlogPost[]>('/api/blogs'),
    fetchJson<EventItem[]>('/api/events'),
  ]);

  const articlesList = articles ?? [];
  const blogsList = blogs ?? [];
  const eventsList = events ?? [];

  renderFeed(buildFeed(articlesList, blogsList, eventsList));
  renderArticles(articlesList);
  renderBlogs(blogsList);
  renderEvents(eventsList);
}

document.addEventListener('DOMContentLoaded', () => {
  setupSidebarTabs();
  setupSidebarToggle();
  setupSidebarAvatar();
  loadDashboardUserContent();
});