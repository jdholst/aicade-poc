const pages = [
  { slug: "overview", title: "Overview", file: "README.md" },
  { slug: "getting-started", title: "Getting started", file: "getting-started.md" },
  { slug: "how-to-campaign", title: "How to campaign", file: "how-to-campaign.md" },
  { slug: "campaign-loops", title: "Campaign loops", file: "campaign-loops.md" },
  { slug: "commands", title: "Command reference", file: "commands.md" },
];

const navigation = document.querySelector("#docs-navigation");
const content = document.querySelector("#documentation-content");
const rawLink = document.querySelector("#documentation-raw");

navigation.innerHTML = pages.map(({ slug, title }) =>
  `<a href="#${slug}" data-page="${slug}">${title}</a>`
).join("");

async function loadPage() {
  const requestedSlug = window.location.hash.slice(1);
  const page = pages.find(({ slug }) => slug === requestedSlug) ?? pages[0];
  const sourceUrl = `/documentation/${page.file}`;

  for (const link of navigation.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.page === page.slug);
  }
  document.title = `${page.title} · Campaign Documentation`;
  rawLink.href = sourceUrl;

  try {
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Documentation returned ${response.status}`);
    content.innerHTML = renderMarkdown(await response.text());
  } catch (error) {
    content.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

function renderMarkdown(source) {
  const output = [];
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  let paragraph = [];
  let listType = null;
  let codeLines = null;
  let codeLanguage = "";

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    const fence = line.match(/^```(.*)$/);
    if (codeLines) {
      if (fence) {
        output.push(`<pre><code class="language-${escapeHtml(codeLanguage)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
        codeLanguage = "";
      } else {
        codeLines.push(line);
      }
      continue;
    }
    if (fence) {
      flushParagraph();
      closeList();
      codeLines = [];
      codeLanguage = fence[1].trim();
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      const id = slugify(heading[2]);
      output.push(`<h${level} id="${id}">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const unorderedItem = line.match(/^[-*]\s+(.+)$/);
    const orderedItem = line.match(/^\d+\.\s+(.+)$/);
    const item = unorderedItem ?? orderedItem;
    if (item) {
      flushParagraph();
      const nextListType = orderedItem ? "ol" : "ul";
      if (listType !== nextListType) {
        closeList();
        output.push(`<${nextListType}>`);
        listType = nextListType;
      }
      output.push(`<li>${renderInline(item[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  if (codeLines) {
    output.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  return output.join("\n");
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+\.md)\)/g, (_, label, href) => {
      const filename = href.split("/").at(-1);
      const page = pages.find(({ file }) => file === filename);
      return page ? `<a href="#${page.slug}">${label}</a>` : label;
    });
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

window.addEventListener("hashchange", loadPage);
await loadPage();
