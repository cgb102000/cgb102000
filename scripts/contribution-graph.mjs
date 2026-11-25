// Gera o mapa de contribuições no visual do GitHub (claro e escuro).
// Uso: GITHUB_TOKEN=... node scripts/contribution-graph.mjs <usuario> <pasta-de-saida>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [user = process.env.GITHUB_REPOSITORY_OWNER, outDir = "dist"] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
if (!user || !token) {
  console.error("Informe o usuário e a variável GITHUB_TOKEN.");
  process.exit(1);
}

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "contribution-graph" },
  body: JSON.stringify({ query, variables: { login: user } }),
});
const json = await res.json();
if (!res.ok || json.errors) {
  console.error(JSON.stringify(json.errors ?? json, null, 2));
  process.exit(1);
}
const calendar = json.data.user.contributionsCollection.contributionCalendar;

const themes = {
  light: { text: "#57606a", levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"], stroke: "rgba(27,31,36,0.06)" },
  dark: { text: "#8b949e", levels: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"], stroke: "rgba(240,246,252,0.05)" },
};
const levelIndex = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const cell = 11, gap = 3, step = cell + gap;
const left = 34, top = 44;
const weeks = calendar.weeks;
const width = left + weeks.length * step + 8;
const height = top + 7 * step + 34;

function render({ text, levels, stroke }) {
  const font = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" fill="${text}"`;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  out.push(`<text x="0" y="16" font-size="15" ${font}>${calendar.totalContributions.toLocaleString("en-US")} contributions in the last year</text>`);

  // Meses: rótulo na semana em que o mês começa; um mês com pouco espaço
  // (o que sobra no começo do gráfico) cede o lugar ao seguinte
  const starts = [];
  weeks.forEach((w, i) => {
    const m = new Date(w.contributionDays[0].date + "T00:00:00Z").getUTCMonth();
    if (!starts.length || starts[starts.length - 1].m !== m) starts.push({ m, i });
  });
  starts.forEach((s, k) => {
    const next = starts[k + 1];
    if (next && next.i - s.i < 3) return;
    out.push(`<text x="${left + s.i * step}" y="${top - 6}" font-size="11" ${font}>${months[s.m]}</text>`);
  });

  [["Mon", 1], ["Wed", 3], ["Fri", 5]].forEach(([d, r]) =>
    out.push(`<text x="0" y="${top + r * step + 9}" font-size="11" ${font}>${d}</text>`));

  weeks.forEach((w, i) => {
    w.contributionDays.forEach((day) => {
      const row = new Date(day.date + "T00:00:00Z").getUTCDay();
      const fill = levels[levelIndex[day.contributionLevel] ?? 0];
      const s = day.contributionCount === 1 ? "" : "s";
      out.push(`<rect x="${left + i * step}" y="${top + row * step}" width="${cell}" height="${cell}" rx="2" fill="${fill}" stroke="${stroke}"><title>${day.contributionCount} contribution${s} on ${day.date}</title></rect>`);
    });
  });

  // Legenda
  const legendY = top + 7 * step + 12;
  let lx = width - 8 - (5 * step + 70);
  out.push(`<text x="${lx}" y="${legendY + 9}" font-size="11" ${font}>Less</text>`);
  lx += 30;
  levels.forEach((c) => {
    out.push(`<rect x="${lx}" y="${legendY}" width="${cell}" height="${cell}" rx="2" fill="${c}" stroke="${stroke}"/>`);
    lx += step;
  });
  out.push(`<text x="${lx + 4}" y="${legendY + 9}" font-size="11" ${font}>More</text>`);

  out.push("</svg>");
  return out.join("\n");
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "contribution-graph.svg"), render(themes.light));
writeFileSync(join(outDir, "contribution-graph-dark.svg"), render(themes.dark));
console.log(`OK: ${calendar.totalContributions} contribuições, ${weeks.length} semanas.`);
