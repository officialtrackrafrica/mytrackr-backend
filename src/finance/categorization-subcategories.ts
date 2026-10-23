const SUBCATEGORY_ALIASES: Record<string, string> = {
  'loan advanced or receivable': 'Loan Given Out',
  'loan received': 'Loan Borrowed',
  'loan principal repayment': 'Loan Repaid',
  'loan given out': 'Loan Given Out',
  'loan repayment received': 'Loan Repayment Received',
  'loan borrowed': 'Loan Borrowed',
  'loan repaid': 'Loan Repaid',
  'salary and wages': 'Salaries & Wages',
  'salaries & wages': 'Salaries & Wages',
  'wages & salaries': 'Salaries & Wages',
  'airtime/internet subscription': 'Airtime/Data Subscription',
  'airtime/data subscription': 'Airtime/Data Subscription',
  'utility bill (light, water, waste etc.)':
    'Utlity Bill (Light, Water, Waste etc.)',
  'utlity bill (light, water, waste etc.)':
    'Utlity Bill (Light, Water, Waste etc.)',
  subscriptions: 'Subscription - Capcut, Captions etc.',
  'software subscription': 'Subscription - Capcut, Captions etc.',
  'subscription - capcut, captions etc.':
    'Subscription - Capcut, Captions etc.',
  'personal use': 'Personal Use',
  'owner withdrawal (for personal use)': 'Personal Use',
};

export function normalizeCategorizationSubCategory(value: string): string {
  const trimmed = value.trim();
  return SUBCATEGORY_ALIASES[trimmed.toLowerCase()] || trimmed;
}
