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
import { CheckPolicies } from '../../casl/decorators/check-policies.decorator';
import { PoliciesGuard } from '../../casl/guards/policies.guard';
import { AppAbility } from '../../casl/casl-ability.factory';
import { Action } from '../../casl/action.enum';
import { AdminCalculationAuditService } from '../services/admin-calculation-audit.service';

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

    if (startDate > endDate) {
      throw new BadRequestException('startDate must not be after endDate');
    }

    const users = await this.auditService.getUsersWithLinkedAccounts();
    const audit = userId
      ? await this.auditService.getAudit(userId, startDate, endDate)
      : null;

    response.type('html').send(
      this.renderPage({ users, audit, userId, startText, endText, view }),
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
<form method="get"><label>User with linked account<select name="userId" required><option value="">Select a user</option>${options}</select></label><label>Start date<input type="date" name="startDate" value="${e(input.startText)}" required></label><label>End date<input type="date" name="endDate" value="${e(input.endText)}" required></label><label>Transactions to show<select name="view">${this.renderViewOptions(input.view)}</select></label><button type="submit">Run audit</button></form>
${input.audit ? this.renderAudit(input.audit, input.startText, input.endText, input.view) : '<section class="empty">Select a user and date range to inspect the calculations.</section>'}
</main></body></html>`;
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
        return `<tr><td>${e(String(tx.date).slice(0, 10))}</td><td><strong>${e(tx.name || tx.description || 'Transaction')}</strong><small>${e(tx.description || '')}</small></td><td>${e(tx.direction)}<small>${e(tx.category || 'UNCATEGORISED')} · ${e(tx.subCategory || '—')}</small></td><td class="number">${money(tx.amount)}</td><td><span class="pill ${pnlIncluded ? 'yes' : 'no'}">${pnlIncluded ? e(tx.treatment.pnl) : 'Excluded'}</span><small>${e(tx.treatment.pnlReason)}</small></td><td><span class="pill ${cashIncluded ? 'yes' : 'no'}">${cashIncluded ? e(tx.treatment.cashFlow) : 'Excluded'}</span><small>${e(tx.treatment.cashFlowReason)}</small></td><td><span class="pill ${tx.treatment.burnRate ? 'yes' : 'no'}">${tx.treatment.burnRate ? 'Included' : 'Excluded'}</span><small>${e(tx.treatment.burnRateReason)}</small></td></tr>`;
      })
      .join('');

    return `<section class="identity"><div><h2>${e(audit.business.name)}</h2><p>${e(audit.user.email)} · ${e(startText)} to ${e(endText)}</p></div><div><b>${audit.counts.total}</b> transactions</div></section>
<section><h2>Linked account balances</h2><ul class="accounts">${accounts}</ul></section>
<section class="cards">${cards}</section>
<section><h2>Formulas used</h2><div class="formulas">
<code>Revenue = Σ categorized INCOME credits</code><code>COGS = Σ categorized COGS debits</code><code>Gross profit = Revenue − COGS</code><code>Total expenses = Σ categorized EXPENSE debits</code><code>Net profit = Gross profit − Total expenses</code><code>Net profit margin = Net profit ÷ Revenue × 100</code><code>Cash in = Σ non-transfer credits</code><code>Cash out = Σ non-transfer debits</code><code>Net cash flow = Cash in − Cash out</code><code>Monthly burn rate = Cash out ÷ inclusive calendar months</code><code>Cash balance = Σ current linked bank-account balances</code><code>Runway = Cash balance ÷ Monthly burn rate</code>
</div><p class="note">The selected period spans <b>${this.inclusiveMonths(startText, endText)}</b> inclusive calendar month(s). Runway: <b>${audit.cashFlow.monthsOfRunway ?? 'N/A'}</b> months; low-runway alert: <b>${audit.cashFlow.lowRunwayAlert ? 'Yes' : 'No'}</b>.</p></section>
<section><div class="table-heading"><div><h2>Transaction evidence</h2><p>Showing ${visibleTransactions.length} of ${audit.counts.total}. P&amp;L included: ${audit.counts.pnlIncluded}; cash flow included: ${audit.counts.cashFlowIncluded}; burn rate included: ${audit.counts.burnRateIncluded}.</p></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Transaction</th><th>Direction / category</th><th>Amount</th><th>P&amp;L</th><th>Cash flow</th><th>Burn rate</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No transactions match this view.</td></tr>'}</tbody></table></div></section>`;
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
    return `:root{font-family:Inter,ui-sans-serif,system-ui;color:#17211b;background:#f3f6f3}*{box-sizing:border-box}body{margin:0}main{max-width:1500px;margin:auto;padding:32px}header{margin-bottom:24px}h1{font-size:34px;margin:3px 0}h2{margin:0 0 10px}.eyebrow{color:#287a4b;font-weight:800;text-transform:uppercase;letter-spacing:.12em;font-size:12px}form,section{background:white;border:1px solid #dfe7e1;border-radius:14px;padding:20px;margin-bottom:18px}form{display:grid;grid-template-columns:2fr 1fr 1fr 1.3fr auto;gap:14px;align-items:end}label{font-size:13px;font-weight:700}input,select,button{display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #bdcbbf;border-radius:8px;background:white}button{background:#216b42;color:white;border:0;font-weight:800;cursor:pointer}.identity{display:flex;justify-content:space-between;align-items:center}.identity p,.table-heading p{margin:3px 0;color:#637269}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;background:transparent;border:0;padding:0}.cards article{background:white;border:1px solid #dfe7e1;border-radius:12px;padding:16px}.cards span,.cards strong{display:block}.cards span{font-size:12px;color:#637269}.cards strong{font-size:20px;margin-top:6px}.accounts{list-style:none;padding:0;margin:0}.accounts li{padding:8px 0;border-top:1px solid #edf1ee}.accounts strong{margin-left:10px}.accounts small{margin-left:8px}.formulas{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:8px}.formulas code{padding:10px;background:#f2f7f3;border-radius:7px;color:#194e32}.note{background:#fff9e8;padding:12px;border-radius:8px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:11px;border-bottom:1px solid #e5ebe6;vertical-align:top}th{background:#f6f8f6;white-space:nowrap}.number{text-align:right;white-space:nowrap}td small{display:block;color:#68766d;margin-top:5px;max-width:280px}.pill{display:inline-block;padding:3px 7px;border-radius:999px;font-size:11px;font-weight:800}.pill.yes{background:#dff5e7;color:#176136}.pill.no{background:#f6e4e1;color:#8a3025}.empty{text-align:center;color:#637269;padding:50px}@media(max-width:900px){main{padding:16px}form{grid-template-columns:1fr}.identity{align-items:flex-start;gap:15px}}`;
  }
}
