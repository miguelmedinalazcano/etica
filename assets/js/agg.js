// Agregación de respuestas. La presentación la calcula y la publica en agg/{qid}
// para que los móviles solo lean datos agregados, nunca respuestas individuales.

export const IDEO_BUCKETS = [
  { id: 'izq', label: 'Izquierda (0–3)', test: v => v <= 3 },
  { id: 'centro', label: 'Centro (4–6)', test: v => v >= 4 && v <= 6 },
  { id: 'der', label: 'Derecha (7–10)', test: v => v >= 7 },
];

function stats(nums) {
  const n = nums.length;
  if (!n) return { n: 0, mean: null, median: null };
  const sorted = [...nums].sort((a, b) => a - b);
  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { n, mean, median };
}

export function aggregate(q, responses, ctx = {}) {
  const entries = Object.entries(responses || {});
  const base = { type: q.type, n: 0, t: Date.now() };
  switch (q.type) {
    case 'choice': {
      const counts = q.options.map(() => 0);
      const byRole = {}, byLens = {};
      let n = 0;
      for (const [, r] of entries) {
        const i = Number(r.value);
        if (!Number.isInteger(i) || i < 0 || i >= q.options.length) continue;
        n++; counts[i]++;
        if (r.role) { (byRole[r.role] ||= q.options.map(() => 0))[i]++; }
        if (r.lens) { (byLens[r.lens] ||= q.options.map(() => 0))[i]++; }
      }
      return { ...base, n, counts, byRole, byLens };
    }
    case 'scale':
    case 'slider': {
      const vals = [];
      const byUid = {};
      for (const [uid, r] of entries) {
        const v = Number(r.value);
        if (Number.isNaN(v)) continue;
        vals.push(v); byUid[uid] = v;
      }
      const s = stats(vals);
      const hist = {};
      for (let v = q.min; v <= q.max; v++) hist[v] = 0;
      for (const v of vals) { const k = Math.round(v); if (k in hist) hist[k]++; }
      const out = { ...base, ...s, hist };
      // Desglose por autoubicación ideológica (solo para el experimento).
      if (ctx.ideology) {
        out.byIdeology = {};
        for (const b of IDEO_BUCKETS) {
          const sub = [];
          for (const [uid, v] of Object.entries(byUid)) {
            const ideo = ctx.ideology[uid] && Number(ctx.ideology[uid].value);
            if (ideo != null && !Number.isNaN(ideo) && b.test(ideo)) sub.push(v);
          }
          out.byIdeology[b.id] = stats(sub);
        }
      }
      return out;
    }
    case 'cases': {
      const steps = q.steps.length;
      const perCase = {};
      for (const c of q.cases) perCase[c.id] = { counts: Array(steps).fill(0), n: 0 };
      let n = 0, placements = 0, conflict = 0;
      for (const [, r] of entries) {
        const v = r.value || {};
        let any = false;
        for (const c of q.cases) {
          const i = Number(v[c.id]);
          if (!Number.isInteger(i) || i < 0 || i >= steps) continue;
          perCase[c.id].counts[i]++; perCase[c.id].n++; any = true; placements++;
          if (q.steps[i].zone === 'conflict') conflict++;
        }
        if (any) n++;
      }
      // "Exigencia de la clase": 0 = todo legítimo, 10 = todo conflicto.
      const rigor = placements ? Math.round((conflict / placements) * 100) / 10 : null;
      return { ...base, n, perCase, rigor, placements };
    }
    case 'rank': {
      const k = q.items.length;
      const sum = Array(k).fill(0), cnt = Array(k).fill(0);
      let n = 0;
      for (const [, r] of entries) {
        const order = Array.isArray(r.value) ? r.value : null;
        if (!order || order.length !== k) continue;
        n++;
        order.forEach((item, pos) => { if (Number.isInteger(item) && item >= 0 && item < k) { sum[item] += pos + 1; cnt[item]++; } });
      }
      const avgPos = sum.map((s, i) => (cnt[i] ? s / cnt[i] : null));
      const order = [...Array(k).keys()].sort((a, b) => (avgPos[a] ?? 99) - (avgPos[b] ?? 99));
      return { ...base, n, avgPos, order };
    }
    default:
      return { ...base, n: entries.length };
  }
}

export const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);
export const fmt1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
