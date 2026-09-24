(function () {
  type SessionType = 'virtual' | 'physical';
  type PayStatus = 'paid' | 'pending';
  type ChartRange = '30' | '12';

  interface Slot {
    id: number;
    start_time: string;
    end_time: string;
    status: 'open' | 'booked';
    booked_by: string | null;
    session_type: SessionType;
  }

  interface PaymentRow {
    date: Date;
    client: string;
    type: SessionType;
    status: PayStatus;
    gross: number;
    fee: number;
    net: number;
  }

  interface Bucket {
    start: Date;
    end: Date;
    label: string;
    title: string;
  }

  const SESSION_RATES: Record<SessionType, number> = { virtual: 2000, physical: 3000 };
  const FEE_RATE = 0.1;
  const CURRENCY = 'KES';

  let rows: PaymentRow[] = [];
  let range: ChartRange = '30';
  let loaded = false;

  const byId = <T extends HTMLElement = HTMLElement>(id: string): T =>
    document.getElementById(id) as T;
  const money = (n: number): string => CURRENCY + ' ' + Math.round(n).toLocaleString();
  const sum = (list: PaymentRow[], key: 'gross' | 'fee' | 'net'): number =>
    list.reduce((total, item) => total + item[key], 0);
  const typeLabel = (t: SessionType): string => (t === 'physical' ? 'Physical' : 'Virtual');
  const statusLabel = (s: PayStatus): string => (s === 'paid' ? 'Paid' : 'Pending');

  async function loadPaymentData(): Promise<PaymentRow[]> {
    const response = await fetch('/api/my-slots', { credentials: 'include' });
    const data = (await response.json()) as { slots?: Slot[] };
    const now = Date.now();
    return (data.slots || [])
      .filter((slot) => slot.status === 'booked')
      .map((slot): PaymentRow => {
        const gross = SESSION_RATES[slot.session_type] || SESSION_RATES.virtual;
        const fee = gross * FEE_RATE;
        return {
          date: new Date(slot.start_time),
          client: slot.booked_by || 'Client',
          type: slot.session_type,
          status: new Date(slot.end_time).getTime() <= now ? 'paid' : 'pending',
          gross,
          fee,
          net: gross - fee,
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  function renderSummary(): void {
    const paid = rows.filter((r) => r.status === 'paid');
    const pending = rows.filter((r) => r.status === 'pending');
    byId('pay-paid').textContent = money(sum(paid, 'net'));
    byId('pay-paid-note').textContent = 'From ' + paid.length + ' completed sessions';
    byId('pay-pending').textContent = money(sum(pending, 'net'));
    byId('pay-pending-note').textContent = pending.length + ' upcoming booked sessions';
    byId('pay-sessions').textContent = String(paid.length);
    byId('pay-sessions-note').textContent = rows.length + ' booked in total';
    byId('pay-average').textContent = money(paid.length ? sum(paid, 'net') / paid.length : 0);
  }

  function buildBuckets(): Bucket[] {
    const list: Bucket[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (range === '30') {
      for (let i = 29; i >= 0; i--) {
        const start = new Date(today);
        start.setDate(start.getDate() - i);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        list.push({
          start,
          end,
          label: i % 5 === 0 || i === 29 ? String(start.getDate()) : '',
          title: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
        list.push({
          start,
          end,
          label: start.toLocaleDateString(undefined, { month: 'short' }),
          title: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        });
      }
    }
    return list;
  }

  function renderChart(): void {
    const chart = byId('pay-chart');
    const axis = byId('pay-axis');
    chart.innerHTML = '';
    axis.innerHTML = '';
    const paid = rows.filter((r) => r.status === 'paid');
    const buckets = buildBuckets().map((bucket) => ({
      ...bucket,
      total: sum(paid.filter((r) => r.date >= bucket.start && r.date < bucket.end), 'net'),
    }));
    const max = Math.max(...buckets.map((b) => b.total), 1);
    buckets.forEach((bucket) => {
      const col = document.createElement('div');
      col.className = 'pay-bar-col';
      col.title = bucket.title + ': ' + money(bucket.total);
      const bar = document.createElement('div');
      bar.className = 'pay-bar' + (bucket.total === 0 ? ' zero' : '');
      bar.style.height = (bucket.total / max) * 100 + '%';
      col.appendChild(bar);
      chart.appendChild(col);
      const label = document.createElement('span');
      label.textContent = bucket.label;
      axis.appendChild(label);
    });
  }

  function filteredRows(): PaymentRow[] {
    const status = byId<HTMLSelectElement>('pay-filter').value;
    const term = byId<HTMLInputElement>('pay-search').value.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (term && r.client.toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
  }

  function cell(text: string, className?: string): HTMLTableCellElement {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  function renderTable(): void {
    const body = byId('pay-rows');
    const empty = byId('pay-empty');
    const list = filteredRows();
    body.innerHTML = '';
    empty.hidden = list.length > 0;
    empty.textContent =
      rows.length === 0
        ? 'No booked sessions yet. Earnings appear here once clients book your slots.'
        : 'No payments match your filters.';
    list.forEach((r) => {
      const tr = document.createElement('tr');
      tr.appendChild(
        cell(r.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), 'date')
      );
      tr.appendChild(cell(r.client));
      tr.appendChild(cell(typeLabel(r.type)));
      const statusCell = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'pay-badge ' + r.status;
      badge.textContent = statusLabel(r.status);
      statusCell.appendChild(badge);
      tr.appendChild(statusCell);
      tr.appendChild(cell(money(r.gross), 'num'));
      tr.appendChild(cell('-' + money(r.fee), 'num fee'));
      tr.appendChild(cell(money(r.net), 'num'));
      body.appendChild(tr);
    });
  }

  function exportCsv(): void {
    const lines: (string | number)[][] = [['Date', 'Client', 'Type', 'Status', 'Charge', 'Fee', 'Net']];
    filteredRows().forEach((r) => {
      lines.push([
        r.date.toISOString().slice(0, 10),
        r.client,
        typeLabel(r.type),
        statusLabel(r.status),
        r.gross,
        r.fee,
        r.net,
      ]);
    });
    const csv = lines
      .map((line) => line.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'payments.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function init(): Promise<void> {
    if (loaded) return;
    loaded = true;
    let failed = false;
    try {
      rows = await loadPaymentData();
    } catch {
      rows = [];
      failed = true;
    }
    renderSummary();
    renderChart();
    renderTable();
    if (failed) {
      const empty = byId('pay-empty');
      empty.hidden = false;
      empty.textContent = 'Could not load your payments right now.';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const trigger = document.querySelector<HTMLButtonElement>('.sidebar-link[data-view="payments"]');
    if (!trigger || !document.getElementById('view-payments')) return;
    trigger.addEventListener('click', () => {
      void init();
    });
    byId('pay-filter').addEventListener('change', renderTable);
    byId('pay-search').addEventListener('input', renderTable);
    byId('pay-export').addEventListener('click', exportCsv);
    const rangeButtons = document.querySelectorAll<HTMLButtonElement>('.pay-range button');
    rangeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        range = button.dataset.range as ChartRange;
        rangeButtons.forEach((b) => b.classList.toggle('active', b === button));
        renderChart();
      });
    });
  });
})();