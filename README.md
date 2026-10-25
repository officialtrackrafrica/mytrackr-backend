<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## Mono transaction refresh

`GET /finance/transactions` requests updated bank transactions before applying
display filters. Successful imports are reused for five minutes, matching Mono's
real-time session interval. This is a refresh on request, not a scheduled background sync.

When Mono returns `x-job-status: processing`, the API returns saved transactions
with `sync.status: processing`. The client should keep the saved history visible
and retry after a short delay. Processing responses do not advance the sync cursor.
The `mono.accounts.jobs.update` event with a finished statement job imports the
completed result with `x-realtime: false`, then copies it into finance transactions.
Account-updated webhooks also import available transactions.

Configure the public `POST /mono/webhook` URL (including any deployment API prefix)
in the Mono dashboard and set the matching `MONO_WEBHOOK_SECRET` in the application.
Check webhook delivery logs when a refresh remains in processing. A failed job may
require user reauthorization: call authenticated `POST /mono/reauth` with
`{"accountId":"MONO_ACCOUNT_ID"}`, open the returned Mono link for the user,
and refresh transactions after authorization completes. Bank-side failures can
also cause failed jobs; a failed job alone does not prove authorization expired.

To verify a deployment, use an account with a transaction posted after its previous
import. Request transactions, inspect Mono's job headers/webhook delivery, and
confirm the new transaction appears after completion. Repeat after five minutes
on the same day. Also verify the reconnect flow with an account that requires it.

Reference: [Mono real-time data documentation](https://docs.mono.co/docs/financial-data/realtime-data).

### Admin staging test

The server-rendered `/admin/calculation-audit` page includes a **Test bank sync**
panel. Select a user, click **Sync selected user**, then use **Check saved results**
after any processing job completes. The table shows each account's result,
before/after transaction counts, latest transaction date, and last import time.
Run the audit again to refresh its report after importing transactions.

Under **Admin - Mono Integration** in Swagger, authenticate as an admin and call
`POST /admin/mono/users/{userId}/sync` using the application's user UUID. No body
is required. This performs a real bank refresh and writes transactions, returning
`before` and `after` account snapshots and a `results` array with each account's
`completed`, `processing`, or `failed` outcome. The snapshot includes
`transactionCount`, `latestTransactionDate`, and `lastSyncedAt`.

If processing, allow the webhook to arrive and call
`GET /admin/mono/users/{userId}/sync` to compare the saved counts and timestamps.
This GET only reads local data. The POST bypasses the application's cache but
cannot bypass Mono's five-minute interval. A completed result with no count
increase can be valid if the bank has no new transactions. Verify a known new
transaction in the finance list before declaring the integration successful.
Use a staging-connected account and point that Mono app's webhook at staging.

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
