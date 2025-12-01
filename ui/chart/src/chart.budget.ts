import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend, ChartDataLabels);

interface BudgetItem {
  name: string;
  cost: number;
}

interface BudgetCategory {
  category: string;
  color: string;
  items: BudgetItem[];
}

const budgetData: BudgetCategory[] = [
  {
    category: 'Sysadmin & Hosting',
    color: 'rgba(255, 99, 132, 1)',
    items: [
      { name: 'Servers', cost: 64824.0 },
      { name: 'Sysadmin (part time)', cost: 18060.0 },
      { name: 'Misc OVH fees', cost: 888.0 },
      { name: 'AWS Admin Fee', cost: 175.0 },
      { name: 'Domain names', cost: 120.0 },
      { name: 'Apple store', cost: 114.0 },
      { name: 'Google Cloud', cost: 24.0 },
    ],
  },
  {
    category: 'Other Expenses',
    color: 'rgba(109, 109, 109, 1)',
    items: [
      { name: 'Social security / pension', cost: 62316.0 },
      { name: 'Payment Processor Fees', cost: 37824.0 },
    ],
  },
  {
    category: 'Moderation',
    color: 'rgba(130, 75, 192, 1)',
    items: [
      { name: 'Mod Stipends 1-12', cost: 79200.0 },
      { name: 'Mod Coordinator', cost: 19800.0 },
      { name: 'R&D', cost: 12000.0 },
    ],
  },
  {
    category: 'Operations',
    color: 'rgba(86, 180, 102, 1)',
    items: [
      { name: 'Director of Ops', cost: 71424.0 },
      { name: 'Governance Consultancy', cost: 20000.0 },
      { name: 'Admin Coordinator', cost: 19800.0 },
      { name: 'Admin/Event Stipends', cost: 19800.0 },
      { name: 'Accountant', cost: 10260.0 },
      { name: 'Auditing', cost: 6192.0 },
      { name: 'Merchandise', cost: 3000.0 },
      { name: 'CPD fund', cost: 500.0 },
      { name: 'Bank Account', cost: 84.0 },
    ],
  },
  {
    category: 'Development',
    color: 'rgba(255, 139, 86, 1)',
    items: [
      { name: 'Lead Developer', cost: 72648.0 },
      { name: 'Mobile Developer', cost: 49476.0 },
      { name: 'Dev Stipend 1-4', cost: 43200.0 },
    ],
  },
  {
    category: 'Content & Community',
    color: 'rgba(54, 162, 235, 1)',
    items: [
      { name: 'SME Annual Budget', cost: 35200.0 },
      { name: 'Titled Arenas', cost: 26000.0 },
      { name: 'Misc. Prize Events', cost: 24000.0 },
      { name: 'IRL Workshops', cost: 20000.0 },
      { name: 'Content Coordinator', cost: 19800.0 },
      { name: 'Community Coordinator', cost: 19800.0 },
      { name: 'Fieldwork Expenses', cost: 10000.0 },
      { name: 'Content Stipend 1-3', cost: 19800.0 },
      { name: 'Streamer Arenas', cost: 2760.0 },
      { name: 'Restreaming Software', cost: 300.0 },
    ],
  },
];

export function initModule(): void {
  const canvas = document.getElementById('budgetChart') as HTMLCanvasElement;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const catLabels: string[] = [];
  const catData: number[] = [];
  const catColors: string[] = [];

  const itemLabels: string[] = [];
  const itemData: number[] = [];
  const itemColors: string[] = [];

  let grandTotal = 0;

  budgetData.forEach(cat => {
    const catTotal = cat.items.reduce((sum, item) => sum + item.cost, 0);
    grandTotal += catTotal;

    catLabels.push(cat.category);
    catData.push(catTotal);
    catColors.push(cat.color);

    const sortedItems = [...cat.items].sort((a, b) => b.cost - a.cost);

    sortedItems.forEach(item => {
      itemLabels.push(item.name);
      itemData.push(item.cost);
      itemColors.push(cat.color);
    });
  });

  const $totalDisplay = document.getElementById('totalDisplay');
  if ($totalDisplay) {
    $totalDisplay.innerText =
      'Total: ' +
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(grandTotal);
  }

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: itemLabels,
      datasets: [
        {
          // Outer Ring (Items)
          data: itemData,
          backgroundColor: itemColors,
          borderWidth: 1,
          borderColor: '#ffffff',
          label: 'Items',
          datalabels: {
            display: (context: any) => {
              return context.dataset.data[context.dataIndex] / grandTotal > 0.05;
            },
            anchor: 'center',
            align: 'center',
            font: { size: 10, weight: 'bold' },
            color: '#333',
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            borderRadius: 4,
            padding: 4,
            formatter: (_value: any, context: any) => {
              return context.chart.data.labels[context.dataIndex];
            },
          },
        },
        {
          // Inner Ring (Categories)
          data: catData,
          backgroundColor: catColors,
          borderWidth: 2,
          borderColor: '#ffffff',
          label: 'Categories',
          datalabels: {
            display: (context: any) => {
              return context.dataset.data[context.dataIndex] / grandTotal > 0.05;
            },
            color: '#fff',
            font: { weight: 'bold', size: 14 },
            formatter: (_value: any, context: any) => {
              return catLabels[context.dataIndex];
            },
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '25%',
      layout: { padding: 20 },
      plugins: {
        tooltip: {
          callbacks: {
            // Disable default title because it uses main labels (itemLabels)
            // which are incorrect for the inner ring (categories).
            title: () => '',
            label: (context: any) => {
              let label = '';
              if (context.datasetIndex === 1) {
                label = catLabels[context.dataIndex];
              } else {
                label = context.label;
              }
              const value = context.raw;
              const formattedValue = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0,
              }).format(value);
              return label + ': ' + formattedValue;
            },
          },
        },
        legend: {
          display: false,
        },
      },
    },
  });
}
