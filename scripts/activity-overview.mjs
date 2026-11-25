// Gera o "Activity overview" do GitHub (a cruz de Commits, Pull requests,
// Issues e Code review) em SVG, nas versões clara e escura.
// Uso: GITHUB_TOKEN=... node scripts/activity-overview.mjs <usuario> <pasta-de-saida>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [user = process.env.GITHUB_REPOSITORY_OWNER, outDir = "dist"] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
if (!user || !token) {
  console.error("Informe o usuário e a variável GITHUB_TOKEN.");
  process.exit(1);
}

const byRepo = (field) => `${field}(maxRepositories: 100) { repository { nameWithOwner } contributions { totalCount } }`;
const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      ${byRepo("commitContributionsByRepository")}
      ${byRepo("pullRequestContributionsByRepository")}
      ${byRepo("issueContributionsByRepository")}
      ${byRepo("pullRequestReviewContributionsByRepository")}
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "activity-overview" },
  body: JSON.stringify({ query, variables: { login: user } }),
});
const json = await res.json();
if (!res.ok || json.errors) {
  console.error(JSON.stringify(json.errors ?? json, null, 2));
  process.exit(1);
}
const c = json.data.user.contributionsCollection;

// Percentuais, como no perfil do GitHub
const totals = {
  commits: c.totalCommitContributions,
  prs: c.totalPullRequestContributions,
  issues: c.totalIssueContributions,
  reviews: c.totalPullRequestReviewContributions,
};
const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
const pct = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round((v / sum) * 100)]));

// Repositórios com mais contribuições
const repos = new Map();
for (const field of ["commitContributionsByRepository", "pullRequestContributionsByRepository", "issueContributionsByRepository", "pullRequestReviewContributionsByRepository"]) {
  for (const r of c[field]) {
    const name = r.repository.nameWithOwner;
    repos.set(name, (repos.get(name) ?? 0) + r.contributions.totalCount);
  }
}
const top = [...repos.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
const shown = top.slice(0, 3);
const others = top.length - shown.length;

const themes = {
  dark: { border: "#30363d", title: "#e6edf3", text: "#e6edf3", muted: "#8b949e", link: "#4493f8", axis: "#26a641", fill: "#26a641", dot: "#ffffff" },
  light: { border: "#d0d7de", title: "#1f2328", text: "#1f2328", muted: "#59636e", link: "#0969da", axis: "#40c463", fill: "#40c463", dot: "#ffffff" },
};

const W = 840, H = 360;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const short = (s, max = 30) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

function render(t) {
  const font = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif"`;
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${font}>`);
  o.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="none" stroke="${t.border}"/>`);
  o.push(`<line x1="440" y1="24" x2="440" y2="${H - 24}" stroke="${t.border}"/>`);

  // Lado esquerdo: título e repositórios
  o.push(`<text x="24" y="44" font-size="16" fill="${t.title}">Activity overview</text>`);
  if (top.length) {
    o.push(`<g transform="translate(24,72)" fill="${t.muted}"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></g>`);
    const lines = [];
    shown.forEach((r, i) => {
      const last = i === shown.length - 1;
      const sep = last ? (others > 0 ? "" : "") : ",";
      lines.push({ prefix: i === 0 ? "Contributed to " : "", repo: short(r), sep });
    });
    let y = 85;
    lines.forEach((l) => {
      o.push(`<text x="52" y="${y}" font-size="15">` +
        (l.prefix ? `<tspan fill="${t.text}">${l.prefix}</tspan>` : "") +
        `<tspan fill="${t.link}" font-weight="600">${esc(l.repo)}</tspan><tspan fill="${t.text}">${l.sep}</tspan></text>`);
      y += 26;
    });
    if (others > 0) {
      o.push(`<text x="52" y="${y}" font-size="15" fill="${t.text}">and ${others} other ${others === 1 ? "repository" : "repositories"}</text>`);
    }
  }

  // Lado direito: a cruz
  const cx = 640, cy = 190, L = 118;
  o.push(`<g stroke="${t.axis}" stroke-width="2" stroke-linecap="round">`);
  o.push(`<line x1="${cx - L}" y1="${cy}" x2="${cx + L}" y2="${cy}"/>`);
  o.push(`<line x1="${cx}" y1="${cy - L}" x2="${cx}" y2="${cy + L}"/>`);
  o.push(`</g>`);

  const p = {
    commits: [cx - (L * pct.commits) / 100, cy],
    issues: [cx + (L * pct.issues) / 100, cy],
    reviews: [cx, cy - (L * pct.reviews) / 100],
    prs: [cx, cy + (L * pct.prs) / 100],
  };
  const poly = [p.reviews, p.issues, p.prs, p.commits].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  o.push(`<polygon points="${poly}" fill="${t.fill}" fill-opacity="0.6" stroke="${t.axis}" stroke-width="4" stroke-linejoin="round"/>`);
  Object.values(p).forEach(([x, y]) =>
    o.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${t.dot}" stroke="${t.axis}" stroke-width="1.5"/>`));

  const label = (x, y, value, name, anchor = "middle") => {
    o.push(`<text x="${x}" y="${y}" font-size="14" text-anchor="${anchor}" fill="${t.muted}">${value}%</text>`);
    o.push(`<text x="${x}" y="${y + 18}" font-size="14" text-anchor="${anchor}" fill="${t.muted}">${name}</text>`);
  };
  label(cx, cy - L - 30, pct.reviews, "Code review");
  label(cx, cy + L + 22, pct.prs, "Pull requests");
  label(cx - L - 14, cy - 4, pct.commits, "Commits", "end");
  label(cx + L + 14, cy - 4, pct.issues, "Issues", "start");

  o.push("</svg>");
  return o.join("\n");
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "activity-overview.svg"), render(themes.light));
writeFileSync(join(outDir, "activity-overview-dark.svg"), render(themes.dark));
console.log(`OK: commits ${pct.commits}%, PRs ${pct.prs}%, issues ${pct.issues}%, code review ${pct.reviews}% em ${top.length} repositórios.`);
