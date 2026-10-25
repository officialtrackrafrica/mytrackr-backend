import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { Public } from '../../auth/decorators/public.decorator';
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminCalculationAuditService } from '../services/admin-calculation-audit.service';

@ApiTags('Admin - Calculation audit')
@Controller('admin/calculation-audit')
export class AdminCalculationAuditLoginController {
  @Get('login')
  @Public()
  @ApiOperation({ summary: 'Server-rendered admin login for calculation audit' })
  @ApiProduces('text/html')
  login(@Res() response: Response) {
    response.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin login · MyTrackr</title><style>
:root{font-family:Inter,ui-sans-serif,system-ui;color:#17211b;background:#f3f6f3}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px}.card{width:min(430px,100%);background:#fff;border:1px solid #dfe7e1;border-radius:18px;padding:32px;box-shadow:0 18px 60px rgba(27,62,42,.1)}.eyebrow{color:#287a4b;font-weight:800;text-transform:uppercase;letter-spacing:.12em;font-size:12px}h1{margin:4px 0 8px}p{color:#637269}label{display:block;font-size:13px;font-weight:700;margin-top:18px}input,button{display:block;width:100%;padding:12px;margin-top:7px;border-radius:9px;border:1px solid #bdcbbf;font:inherit}button{margin-top:24px;border:0;background:#216b42;color:#fff;font-weight:800;cursor:pointer}button:disabled{opacity:.65;cursor:wait}.error{display:none;background:#fbe9e6;color:#8a3025;padding:11px;border-radius:8px;margin-top:16px;font-size:13px}.error.show{display:block}</style></head>
<body><main class="card"><p class="eyebrow">MyTrackr Admin</p><h1>Calculation audit</h1><p>Sign in with an administrator account to inspect report calculations.</p>
<form id="login-form"><label>Email<input name="email" type="email" autocomplete="username" required autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><div id="error" class="error" role="alert"></div><button id="submit" type="submit">Sign in</button></form></main>
<script>
const form=document.getElementById('login-form');const button=document.getElementById('submit');const errorBox=document.getElementById('error');
form.addEventListener('submit',async(event)=>{event.preventDefault();button.disabled=true;button.textContent='Signing in…';errorBox.classList.remove('show');try{const data=new FormData(form);const response=await fetch('/auth/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),password:data.get('password')})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||'Unable to sign in');window.location.assign('/admin/calculation-audit');}catch(error){errorBox.textContent=error instanceof Error?error.message:'Unable to sign in';errorBox.classList.add('show');button.disabled=false;button.textContent='Sign in';}});
</script></body></html>`);
  }
}

@ApiTags('Admin - Calculation audit')
@ApiCookieAuth('accessToken')
@Controller('admin/calculation-audit')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class AdminCalculationAuditController {
  constructor(private readonly auditService: AdminCalculationAuditService) {}

  @Get()
  @CheckPolicies((ability: AppAbility) => ability.can(Action.Manage, 'all'))
  @ApiOperation({ summary: 'Server-rendered P&L, cash-flow and burn-rate audit' })
  @ApiProduces('text/html')
  async page(
    @Query('userId') userId: string | undefined,
    @Query('startDate') startDateText: string | undefined,
    @Query('endDate') endDateText: string | undefined,
    @Query('view') requestedView: string | undefined,
    @Query('transactionScope') requestedTransactionScope: string | undefined,
    @Res() response: Response,
  ) {
    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStart = `${today.getUTCFullYear()}-01-01`;
    const startText = startDateText || defaultStart;
    const endText = endDateText || defaultEnd;
    const startDate = this.parseDate(startText, false);
    const endDate = this.parseDate(endText, true);
    const view = this.validView(requestedView);
    const transactionScope =
      requestedTransactionScope === 'all-stored' ? 'all-stored' : 'period';

    if (startDate > endDate) {
      throw new BadRequestException('startDate must not be after endDate');
    }

    const users = await this.auditService.getUsersWithLinkedAccounts();
    const audit = userId
      ? await this.auditService.getAudit(
          userId,
          startDate,
          endDate,
          transactionScope === 'all-stored',
        )
      : null;

    response.type('html').send(
      this.renderPage({
        users,
        audit,
        userId,
        startText,
        endText,
        view,
        transactionScope,
      }),
    );
  }

  private parseDate(value: string, endOfDay: boolean): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Dates must use YYYY-MM-DD format');
    }
    const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date');
    }
    return date;
  }

  private renderPage(input: {
    users: any[];
    audit: any | null;
    userId?: string;
    startText: string;
    endText: string;
    view: string;
    transactionScope: string;
  }): string {
    const e = this.escapeHtml;
    const options = input.users
      .map((user) => {
        const label =
          `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
        return `<option value="${e(user.id)}" ${user.id === input.userId ? 'selected' : ''}>${e(label)} — ${e(user.business?.name || 'Unnamed business')}</option>`;
      })
      .join('');

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Calculation audit · MyTrackr Admin</title><style>${this.styles()}</style></head>
<body><main><header><div><p class="eyebrow">MyTrackr Admin</p><h1>Calculation audit</h1><p>Trace every transaction used—or excluded—from P&amp;L, cash flow, and burn rate.</p></div></header>
<form method="get"><label>User with linked account<select name="userId" required><option value="">Select a user</option>${options}</select></label><label>Start date<input type="date" name="startDate" value="${e(input.startText)}" required></label><label>End date<input type="date" name="endDate" value="${e(input.endText)}" required></label><label>Transaction period<select name="transactionScope"><option value="period" ${input.transactionScope === 'period' ? 'selected' : ''}>Selected date range</option><option value="all-stored" ${input.transactionScope === 'all-stored' ? 'selected' : ''}>All stored transactions</option></select></label><label>Transactions to show<select name="view">${this.renderViewOptions(input.view)}</select></label><button type="submit">Run audit</button></form>
${this.renderSyncControls()}
${input.audit ? this.renderAudit(input.audit, input.startText, input.endText, input.view) : '<section class="empty">Select a user and date range to inspect the calculations.</section>'}
</main></body></html>`;
  }

  private renderSyncControls(): string {
    return `<section class="sync-test" aria-labelledby="sync-title">
<h2 id="sync-title">Test bank sync</h2>
<p>Use the user selected above to fetch new bank transactions. This saves transactions and updates finance records. Mono may charge for the refresh and allows a new session every five minutes.</p>
<div style="display:flex;gap:12px;flex-wrap:wrap"><button type="button" id="sync-run" style="width:auto">Sync selected user</button><button type="button" id="sync-check" style="width:auto">Check sync status</button></div>
<p id="sync-message" role="status" aria-live="polite">Select a user to test their linked accounts.</p>
<div id="sync-results" style="overflow:auto"></div>
<p>Check sync status asks Mono about the tracked job without starting another bank refresh. Bank completion and local import are separate: if Mono has completed but the last import is unchanged, check webhook delivery. Confirm a known new transaction appears and run the audit again to update the report below.</p>
</section>
<script>
(() => {
  const userSelect = document.querySelector('select[name="userId"]');
  const run = document.getElementById('sync-run');
  const check = document.getElementById('sync-check');
  const message = document.getElementById('sync-message');
  const output = document.getElementById('sync-results');
  let busy = false;
  let baseline = null;
  const restoreBaseline = () => {
    baseline = null;
    try { baseline = JSON.parse(sessionStorage.getItem('mono-sync-before:' + userSelect.value) || 'null'); } catch (_) {}
  };
  restoreBaseline();
  const updateButtons = () => { run.disabled = check.disabled = busy || !userSelect.value; };
  userSelect.addEventListener('change', () => {
    restoreBaseline();
    output.replaceChildren();
    message.textContent = 'Ready to check the selected user.';
    updateButtons();
  });
  const show = (snapshot, results) => {
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    ['Bank / account', 'Result', 'Mono job status', 'Job ID', 'Status checked', 'Transactions before', 'Transactions now', 'Latest transaction', 'Last imported'].forEach(label => {
      const cell = document.createElement('th'); cell.textContent = label; head.appendChild(cell);
    });
    const body = table.createTBody();
    (snapshot.accounts || []).forEach(account => {
      const prior = baseline && baseline.accounts.find(item => item.accountId === account.accountId);
      const result = (results || []).find(item => item.accountId === account.accountId);
      const row = body.insertRow();
      [
        (account.institutionName || 'Bank') + ' / ' + account.accountId,
        result ? result.status + (result.message ? ': ' + result.message : '') : 'Saved snapshot',
        account.jobCheckError ? account.jobCheckError + ' Last known: ' + (account.jobStatus || 'unknown') : account.jobStatus === 'finished' ? 'Completed at bank (check local import time)' : account.jobStatus === 'failed' ? 'Failed at bank; reauthorization may be needed' : account.jobStatus === 'processing' ? 'Processing at bank' : 'No tracked job; run Sync selected user to capture one',
        account.jobId || 'Not captured', account.jobCheckedAt || 'Not checked',
        prior ? prior.transactionCount : '—', account.transactionCount,
        account.latestTransactionDate || 'None', account.lastSyncedAt || 'Never'
      ].forEach(value => { const cell = row.insertCell(); cell.textContent = String(value); });
    });
    output.replaceChildren(table);
  };
  const request = async (method) => {
    if (busy || !userSelect.value) return;
    const selectedUser = userSelect.value;
    busy = true; updateButtons(); userSelect.disabled = true;
    message.textContent = method === 'POST' ? 'Requesting bank refresh…' : 'Loading saved results…';
    try {
      const prefix = window.location.pathname.split('/admin/')[0];
      const response = await fetch(prefix + '/admin/mono/users/' + encodeURIComponent(selectedUser) + '/sync', {
        method, credentials: 'same-origin', headers: { Accept: 'application/json' }
      });
      const payload = await response.json();
      const data = payload.data || payload;
      if (!response.ok) throw new Error(payload.message || 'Unable to check bank sync');
      if (method === 'POST') {
        baseline = data.before;
        try { sessionStorage.setItem('mono-sync-before:' + selectedUser, JSON.stringify(baseline)); } catch (_) {}
        show(data.after, data.results);
        const pending = data.results.some(item => item.status === 'processing');
        const failed = data.results.some(item => item.status === 'failed');
        message.textContent = failed ? 'Some accounts failed. Review the results below.' : pending ? 'Bank refresh is processing. Wait, then check saved results.' : 'Import completed. Compare counts and verify your expected new transaction in the audit.';
      } else {
        show(data);
        const accounts = data.accounts || [];
        const unknown = accounts.some(item => item.jobCheckError || !item.jobId);
        const failed = accounts.some(item => item.jobStatus === 'failed');
        const pending = accounts.some(item => item.jobStatus === 'processing');
        message.textContent = unknown ? 'Some job statuses could not be confirmed. Review each account below.' : failed ? 'Mono reports a failed refresh. Review the account below.' : pending ? 'Mono is still processing. Check again shortly.' : 'Mono refresh completed. Compare the local import time and counts below; completion at the bank does not confirm local import.';
      }
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Unable to check bank sync';
    } finally { busy = false; userSelect.disabled = false; updateButtons(); }
  };
  run.addEventListener('click', () => request('POST'));
  check.addEventListener('click', () => request('GET'));
  updateButtons();
})();
</script>`;
  }

  private renderAudit(
    audit: any,
    startText: string,
    endText: string,
    view: string,
  ): string {
    const e = this.escapeHtml;
    const money = (value: unknown) =>
      new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: audit.business.currency || 'NGN',
      }).format(Number(value || 0));
    const cards = [
      ['Revenue', audit.pnl.revenue.total],
      ['COGS', audit.pnl.cogs.total],
      ['Gross profit', audit.pnl.grossProfit],
      ['Total expenses', audit.pnl.expenses.total],
      ['Net profit', audit.pnl.netProfit],
      ['Cash in', audit.cashFlow.cashIn],
      ['Cash out', audit.cashFlow.cashOut],
      ['Net cash flow', audit.cashFlow.netCashFlow],
      ['Monthly burn rate', audit.cashFlow.monthlyBurnRate],
      ['Cash balance', audit.cashFlow.cashBalance],
      [
        'Months of runway',
        audit.cashFlow.monthsOfRunway === null
          ? 'N/A'
          : audit.cashFlow.monthsOfRunway,
      ],
    ]
      .map(
        ([label, value]) =>
          `<article><span>${e(label)}</span><strong>${label === 'Months of runway' ? e(value) : money(value)}</strong></article>`,
      )
      .join('');
    const balanceSheetCards = [
      ['Total assets', audit.balanceSheet.summary.totalAssets],
      ['Total liabilities', audit.balanceSheet.summary.totalLiabilities],
      ["Owner's equity", audit.balanceSheet.summary.ownersEquity],
      ['Owner investments', audit.balanceSheet.summary.ownerInvestments],
      ['Retained profit', audit.balanceSheet.summary.retainedProfits],
      ['Owner withdrawals', audit.balanceSheet.summary.ownerWithdrawals],
      [
        'Opening / unresolved reconciliation',
        audit.balanceSheet.equity.equityReconciliation,
      ],
    ]
      .map(
        ([label, value]) =>
          `<article><span>${e(label)}</span><strong>${money(value)}</strong></article>`,
      )
      .join('');
    const accounts = audit.accounts
      .map(
        (account: any) =>
          `<li>${e(account.bankName || 'Bank')} · ••••${e(String(account.accountNumber || '').slice(-4))} <strong>${money(account.currentBalance)}</strong> <small>${e(account.syncStatus)}</small></li>`,
      )
      .join('');
    const visibleTransactions = audit.transactions.filter((tx: any) =>
      this.matchesView(tx, view),
    );
    const rows = visibleTransactions
      .map((tx: any) => {
        const pnlIncluded = tx.treatment.pnl !== null;
        const cashIncluded = tx.treatment.cashFlow !== null;
        return `<tr><td>${e(String(tx.date).slice(0, 10))}</td><td><strong>${e(tx.name || tx.description || 'Transaction')}</strong><small>${e(tx.description || '')}</small><small>Transaction: ${e(tx.id)}${tx.externalId ? ` · External: ${e(tx.externalId)}` : ''}${tx.bankAccountId ? ` · Account: ${e(tx.bankAccountId)}` : ''}</small></td><td>${e(tx.direction)}<small>${e(tx.category || 'UNCATEGORISED')} · ${e(tx.subCategory || '—')}</small><small>Categorised: ${tx.isCategorised ? 'Yes' : 'No'} · Source: ${e(tx.categorySource || '—')}</small></td><td class="number">${money(tx.amount)}</td><td><span class="pill ${pnlIncluded ? 'yes' : 'no'}">${pnlIncluded ? e(tx.treatment.pnl) : 'Excluded'}</span><small>${e(tx.treatment.pnlReason)}</small></td><td><span class="pill ${cashIncluded ? 'yes' : 'no'}">${cashIncluded ? e(tx.treatment.cashFlow) : 'Excluded'}</span><small>${e(tx.treatment.cashFlowReason)}</small></td><td><span class="pill ${tx.treatment.burnRate ? 'yes' : 'no'}">${tx.treatment.burnRate ? 'Included' : 'Excluded'}</span><small>${e(tx.treatment.burnRateReason)}</small></td></tr>`;
      })
      .join('');

    return `<section class="identity"><div><h2>${e(audit.business.name)}</h2><p>${e(audit.user.email)} · report period ${e(startText)} to ${e(endText)}</p></div><div class="identity-actions"><div><b>${audit.counts.total}</b> ${audit.includesAllStoredTransactions ? 'stored' : 'period'} transactions</div><button type="button" class="print-button" onclick="window.print()">Print full audit</button></div></section>
<section><h2>Linked account balances</h2><ul class="accounts">${accounts}</ul></section>
<section><h2>P&amp;L and cash-flow totals</h2><div class="cards nested-cards">${cards}</div></section>
<section><h2>Balance-sheet totals</h2><p class="section-intro">Balance sheet is calculated from all stored records through today, independently of the report-period dates above.</p><div class="cards nested-cards">${balanceSheetCards}</div></section>
<section><h2>Formulas used</h2><div class="formulas">
<code>Revenue = Σ categorized INCOME credits</code><code>COGS = Σ categorized COGS debits</code><code>Gross profit = Revenue − COGS</code><code>Total expenses = Expense debits − matched refund/reversal credits</code><code>Net profit = Gross profit − Total expenses</code><code>Net profit margin = Net profit ÷ Revenue × 100</code><code>Cash in/out = all non-internal cash movements</code><code>Internal transfer = movement between business-owned accounts</code><code>Net cash flow = Cash in − Cash out</code><code>Monthly burn = confirmed operating outflow ÷ inclusive calendar months</code><code>Owner's money = Total assets − Total liabilities</code><code>Reconciliation = Owner's money − recorded equity</code><code>Cash balance = Σ current linked bank-account balances</code><code>Runway = Cash balance ÷ Monthly burn rate</code>
</div><p class="note">The selected period spans <b>${this.inclusiveMonths(startText, endText)}</b> inclusive calendar month(s). Runway: <b>${audit.cashFlow.monthsOfRunway ?? 'N/A'}</b> months; low-runway alert: <b>${audit.cashFlow.lowRunwayAlert ? 'Yes' : 'No'}</b>.</p></section>
<section><div class="table-heading"><div><h2>Transaction evidence</h2><p>Showing ${visibleTransactions.length} of ${audit.counts.total} ${audit.includesAllStoredTransactions ? 'transactions stored for this business' : 'transactions in the selected period'}. P&amp;L treatment, cash-flow treatment, categorisation, IDs, and linked-account IDs are included.</p>${audit.includesAllStoredTransactions ? `<p class="note">P&amp;L and cash-flow cards use only ${e(startText)} to ${e(endText)}. The ledger below contains every stored transaction so entries outside that range are not part of those period totals.</p>` : ''}</div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Transaction / identifiers</th><th>Direction / category</th><th>Amount</th><th>P&amp;L</th><th>Cash flow</th><th>Burn rate</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No transactions match this view.</td></tr>'}</tbody></table></div></section>`;
  }

  private validView(view?: string): string {
    const allowed = new Set([
      'all',
      'pnl-included',
      'pnl-excluded',
      'cash-flow-included',
      'cash-flow-excluded',
      'burn-rate-included',
      'burn-rate-excluded',
    ]);
    return view && allowed.has(view) ? view : 'all';
  }

  private renderViewOptions(selected: string): string {
    const options: Record<string, string> = {
      all: 'All transactions',
      'pnl-included': 'P&L — included',
      'pnl-excluded': 'P&L — excluded',
      'cash-flow-included': 'Cash flow — included',
      'cash-flow-excluded': 'Cash flow — excluded',
      'burn-rate-included': 'Burn rate — included',
      'burn-rate-excluded': 'Burn rate — excluded',
    };
    return Object.entries(options)
      .map(
        ([value, label]) =>
          `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`,
      )
      .join('');
  }

  private matchesView(tx: any, view: string): boolean {
    if (view === 'pnl-included') return tx.treatment.pnl !== null;
    if (view === 'pnl-excluded') return tx.treatment.pnl === null;
    if (view === 'cash-flow-included') return tx.treatment.cashFlow !== null;
    if (view === 'cash-flow-excluded') return tx.treatment.cashFlow === null;
    if (view === 'burn-rate-included') return tx.treatment.burnRate;
    if (view === 'burn-rate-excluded') return !tx.treatment.burnRate;
    return true;
  }

  private inclusiveMonths(start: string, end: string): number {
    const from = new Date(`${start}T00:00:00Z`);
    const to = new Date(`${end}T00:00:00Z`);
    return Math.max(1, (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1);
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private styles(): string {
    return `:root{font-family:Inter,ui-sans-serif,system-ui;color:#17211b;background:#f3f6f3}*{box-sizing:border-box}body{margin:0}main{max-width:1500px;margin:auto;padding:32px}header{margin-bottom:24px}h1{font-size:34px;margin:3px 0}h2{margin:0 0 10px}.eyebrow{color:#287a4b;font-weight:800;text-transform:uppercase;letter-spacing:.12em;font-size:12px}form,section{background:white;border:1px solid #dfe7e1;border-radius:14px;padding:20px;margin-bottom:18px}form{display:grid;grid-template-columns:2fr 1fr 1fr 1.3fr 1.3fr auto;gap:14px;align-items:end}label{font-size:13px;font-weight:700}input,select,button{display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #bdcbbf;border-radius:8px;background:white}button{background:#216b42;color:white;border:0;font-weight:800;cursor:pointer}.identity{display:flex;justify-content:space-between;align-items:center}.identity-actions{display:flex;align-items:center;gap:14px}.print-button{width:auto;margin:0}.identity p,.table-heading p,.section-intro{margin:3px 0;color:#637269}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;background:transparent;border:0;padding:0}.nested-cards{margin:14px 0 0}.cards article{background:white;border:1px solid #dfe7e1;border-radius:12px;padding:16px}.cards span,.cards strong{display:block}.cards span{font-size:12px;color:#637269}.cards strong{font-size:20px;margin-top:6px}.accounts{list-style:none;padding:0;margin:0}.accounts li{padding:8px 0;border-top:1px solid #edf1ee}.accounts strong{margin-left:10px}.accounts small{margin-left:8px}.formulas{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:8px}.formulas code{padding:10px;background:#f2f7f3;border-radius:7px;color:#194e32}.note{background:#fff9e8;padding:12px;border-radius:8px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:11px;border-bottom:1px solid #e5ebe6;vertical-align:top}th{background:#f6f8f6;white-space:nowrap}.number{text-align:right;white-space:nowrap}td small{display:block;color:#68766d;margin-top:5px;max-width:320px;overflow-wrap:anywhere}.pill{display:inline-block;padding:3px 7px;border-radius:999px;font-size:11px;font-weight:800}.pill.yes{background:#dff5e7;color:#176136}.pill.no{background:#f6e4e1;color:#8a3025}.empty{text-align:center;color:#637269;padding:50px}@media(max-width:900px){main{padding:16px}form{grid-template-columns:1fr}.identity{align-items:flex-start;gap:15px}.identity-actions{align-items:flex-end;flex-direction:column}}@media print{@page{size:landscape;margin:8mm}:root{font-size:10px;background:white}body{background:white}main{max-width:none;padding:0}header,form,.print-button{display:none}section{border:0;border-radius:0;padding:8px 0;margin:0 0 10px;break-inside:avoid}.table-wrap{overflow:visible}table{font-size:8px}thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:4px}.pill{padding:1px 4px}td small{max-width:190px}.cards{grid-template-columns:repeat(4,1fr)}.cards article{padding:7px}.cards strong{font-size:12px}.note{padding:6px}.identity-actions{display:block}}`;
  }
}
