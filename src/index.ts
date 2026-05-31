import Fastify from "fastify";
import { lookupPlate } from "./scraper";
import { saveLookup, getLookups, getCachedLookup, setName } from "./db";

const fastify = Fastify({ logger: true });

fastify.get<{ Params: { plate: string } }>(
  "/lookup/:plate",
  async (request, reply) => {
    const { plate } = request.params;

    if (!plate || plate.trim().length === 0) {
      return reply.status(400).send({ error: "License plate is required" });
    }

    try {
      const cached = getCachedLookup(plate.trim());
      if (cached) {
        return reply.send(JSON.parse(cached.data));
      }

      const data = await lookupPlate(plate.trim());
      saveLookup(data.plate, data);
      return reply.send(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      if (message.includes("No vehicle found")) {
        return reply.status(404).send({ error: message });
      }

      fastify.log.error(err);
      return reply.status(500).send({ error: "Failed to look up vehicle", details: message });
    }
  }
);

fastify.post<{ Params: { plate: string }; Body: { name: string } }>(
  "/lookup/:plate/name",
  async (request, reply) => {
    const plate = request.params.plate.toUpperCase();
    const { name } = request.body ?? {};

    if (typeof name !== "string") {
      return reply.status(400).send({ error: "name skal være en streng" });
    }

    setName(plate, name.trim());
    return reply.send({ plate, name: name.trim() });
  }
);

fastify.get("/admin", async (_request, reply) => {
  const rows = getLookups();

  const tableRows = rows
    .map((row) => {
      const data = JSON.parse(row.data);
      const kt = data.tabs?.["1. Køretøj"] ?? {};
      const tech = data.tabs?.["2. Tekniske oplysninger"] ?? {};

      const make = kt["Fabrikant"] ?? "";
      const color = kt["Farve"] ?? "";
      const year = kt["Model-år"] ?? "";
      const km = kt["Kilometerstand (.000 km)"] ? `${kt["Kilometerstand (.000 km)"]} t.km` : "";
      const fuel = tech["Drivkraft"] ?? "";
      const status = kt["Status"] ?? "";
      const nextInspection = data.tabs?.["3. Syn"]?.["Beregnet dato for næste indkaldelse til periodisk syn"] ?? "";

      return `
        <tr>
          <td>${row.id}</td>
          <td><strong>${row.plate}</strong></td>
          <td>
            <span class="name-display" data-plate="${row.plate}">${row.name || '<em style="color:#bbb">Intet navn</em>'}</span>
            <button class="edit-btn" onclick="startEdit('${row.plate}', this)" title="Rediger navn">✏️</button>
          </td>
          <td>${new Date(row.searched_at).toLocaleString("da-DK")}</td>
          <td>${make}</td>
          <td>${color}</td>
          <td>${year}</td>
          <td>${km}</td>
          <td>${fuel}</td>
          <td>${nextInspection}</td>
          <td class="status">${status ? status.split(" ")[0] : ""}</td>
          <td><a href="/admin/lookup/${row.id}">Detaljer</a></td>
        </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MotorAPI – Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #222; }
    header { background: #1a1a2e; color: #fff; padding: 1.25rem 2rem; display: flex; align-items: center; gap: 1rem; }
    header h1 { font-size: 1.25rem; font-weight: 600; }
    header span { font-size: 0.85rem; opacity: 0.6; }
    main { padding: 2rem; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.08); overflow: hidden; }
    .card-header { padding: 1rem 1.5rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
    .card-header h2 { font-size: 1rem; font-weight: 600; }
    .badge { background: #e8f4fd; color: #1565c0; font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 99px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 0.75rem 1rem; background: #fafafa; color: #666; font-weight: 500; border-bottom: 1px solid #eee; white-space: nowrap; }
    td { padding: 0.75rem 1rem; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fafafa; }
    td.status { color: #2e7d32; font-weight: 500; }
    a { color: #1565c0; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
    .empty { padding: 3rem; text-align: center; color: #999; }
    .search-form { display: flex; gap: 0.5rem; margin-left: auto; }
    .search-form input { padding: 0.45rem 0.75rem; border: 1px solid #555; border-radius: 6px; font-size: 0.875rem; background: #2a2a40; color: #fff; }
    .search-form input::placeholder { color: #aaa; }
    .search-form button { padding: 0.45rem 1rem; background: #3a3a60; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; }
    .search-form button:hover { background: #4a4a80; }
    .edit-btn { background: none; border: none; cursor: pointer; margin-left: 0.25rem; opacity: 0.4; font-size: 0.8rem; vertical-align: middle; }
    .edit-btn:hover { opacity: 1; }
    .name-input { padding: 0.25rem 0.5rem; border: 1px solid #1565c0; border-radius: 4px; font-size: 0.875rem; width: 140px; }
    .save-btn { padding: 0.25rem 0.6rem; background: #1565c0; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem; margin-left: 0.25rem; }
    .save-btn:hover { background: #0d47a1; }
  </style>
</head>
<body>
  <header>
    <h1>MotorAPI Admin</h1>
    <span>${rows.length} opslag i alt</span>
    <form class="search-form" action="/lookup-redirect" method="get">
      <input name="plate" placeholder="Søg nummerplade…" required>
      <button type="submit">Søg</button>
    </form>
  </header>
  <main>
    <div class="card">
      <div class="card-header">
        <h2>Køretøjer</h2>
        <span class="badge">${rows.length} køretøjer</span>
      </div>
      ${
        rows.length === 0
          ? '<div class="empty">Ingen opslag endnu. Brug <code>GET /lookup/:plate</code> for at søge.</div>'
          : `<table>
        <thead>
          <tr>
            <th>#</th>
            <th>Plade</th>
            <th>Navn</th>
            <th>Tidspunkt</th>
            <th>Fabrikant</th>
            <th>Farve</th>
            <th>Årgang</th>
            <th>Km</th>
            <th>Drivmiddel</th>
            <th>Næste syn</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`
      }
    </div>
  </main>
  <script>
    function startEdit(plate, btn) {
      const cell = btn.parentElement;
      const display = cell.querySelector('.name-display');
      const currentName = display.dataset.name || '';

      cell.innerHTML =
        '<input class="name-input" id="ni-' + plate + '" value="' + currentName + '" placeholder="Skriv navn…">' +
        '<button class="save-btn" onclick="saveName(\\'' + plate + '\\')">Gem</button>';

      const input = document.getElementById('ni-' + plate);
      input.focus();
      input.addEventListener('keydown', e => { if (e.key === 'Enter') saveName(plate); });
    }

    async function saveName(plate) {
      const input = document.getElementById('ni-' + plate);
      const name = input.value.trim();

      await fetch('/lookup/' + plate + '/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      location.reload();
    }
  </script>
</body>
</html>`;

  return reply.type("text/html").send(html);
});

fastify.get<{ Params: { id: string } }>(
  "/admin/lookup/:id",
  async (request, reply) => {
    const rows = getLookups();
    const row = rows.find((r) => r.id === Number(request.params.id));

    if (!row) return reply.status(404).send("Not found");

    const data = JSON.parse(row.data);

    const tabSections = Object.entries(data.tabs as Record<string, Record<string, string>>)
      .map(([tabName, fields]) => {
        const fieldRows = Object.entries(fields)
          .filter(([, v]) => v !== "")
          .map(([k, v]) => `<tr><td class="label">${k}</td><td>${v}</td></tr>`)
          .join("");

        return `
          <div class="tab-section">
            <h3>${tabName}</h3>
            ${fieldRows ? `<table><tbody>${fieldRows}</tbody></table>` : "<p class='empty-tab'>Ingen data</p>"}
          </div>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <title>${row.plate} – MotorAPI Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #222; }
    header { background: #1a1a2e; color: #fff; padding: 1.25rem 2rem; display: flex; align-items: center; gap: 1rem; }
    header h1 { font-size: 1.25rem; font-weight: 600; }
    header a { color: #aac4f0; text-decoration: none; font-size: 0.875rem; }
    header a:hover { text-decoration: underline; }
    .header-name { font-size: 0.9rem; opacity: 0.7; }
    main { padding: 2rem; display: flex; flex-direction: column; gap: 1.5rem; }
    .tab-section { background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.08); overflow: hidden; }
    .tab-section h3 { padding: 0.875rem 1.25rem; font-size: 0.95rem; font-weight: 600; background: #fafafa; border-bottom: 1px solid #eee; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    td { padding: 0.6rem 1.25rem; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    td.label { color: #666; width: 40%; font-weight: 500; }
    .empty-tab { padding: 1rem 1.25rem; color: #999; font-size: 0.875rem; }
  </style>
</head>
<body>
  <header>
    <a href="/admin">← Tilbage</a>
    <h1>${row.plate}</h1>
    ${row.name ? `<span class="header-name">${row.name}</span>` : ""}
    <span style="opacity:.6;font-size:.85rem;margin-left:auto">Søgt ${new Date(row.searched_at).toLocaleString("da-DK")}</span>
  </header>
  <main>${tabSections}</main>
</body>
</html>`;

    return reply.type("text/html").send(html);
  }
);

fastify.get<{ Querystring: { plate: string } }>(
  "/lookup-redirect",
  async (request, reply) => {
    const { plate } = request.query;
    try {
      const cached = getCachedLookup(plate.trim());
      if (cached) {
        return reply.redirect(`/admin/lookup/${cached.id}`);
      }

      const data = await lookupPlate(plate.trim());
      saveLookup(data.plate, data);
      const rows = getLookups();
      const row = rows.find((r) => r.plate === data.plate);
      return reply.redirect(`/admin/lookup/${row?.id ?? ""}`);
    } catch {
      return reply.redirect("/admin");
    }
  }
);

const start = async () => {
  try {
    const port = parseInt(process.env.PORT ?? "3000", 10);
    await fastify.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
