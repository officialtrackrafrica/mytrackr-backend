# Bank selection before subscription

1. Fetch `GET /mono/institutions` before displaying bank connection checkout. This public endpoint does not require a subscription or login. It returns a live array from Mono's financial-data institution directory.
2. Display the returned `name` and `accountType` combinations, with the supported `authMethods`. Keep the `institutionId` associated with each combination; do not combine the account types of different institution records.
3. Require the user to choose a combination before enabling subscription checkout for Solo, Duo, and Unlimited (or any plan configured with a positive bank account limit).
4. Submit the selection with `POST /subscriptions/subscribe` using the authenticated user's existing session:

```json
{
  "planSlug": "solo",
  "interval": "monthly",
  "institutionId": "<institutionId returned by the endpoint>",
  "accountType": "PERSONAL_BANKING"
}
```

Use the actual returned `accountType`; do not hardcode the example. Each response record also contains `authMethods`, plus `country`, `bankCode`, and `icon` when Mono provides them.

Checkout re-fetches coverage before creating a transaction or calling the payment gateway. Missing or unsupported combinations return HTTP 400. If coverage cannot be fetched, HTTP 503 prevents checkout; let users retry. The validated selection is saved as `metadata.selectedBank` on the payment transaction and sent in checkout metadata. Existing subscriptions and renewals are unaffected. Starter and Web have no bank connection allowance and do not require this selection.

`accountType` represents Mono's banking category (for example `PERSONAL_BANKING`), not individual savings/current/domiciliary products. Directory inclusion confirms advertised coverage, not successful authentication or availability of every account product. The frontend must display this distinction accurately. This backend repository does not contain the subscription screen; the frontend must add the selection controls using this contract.

Source: [Mono's institution API integration guide](https://docs.mono.co/docs/financial-data/partners-api-guide/integration-guide), `GET https://api.withmono.com/v3/institutions?scope=financial_data`. Uses the existing server-side `MONO_SECRET_KEY`; the secret and login form definitions are never returned to clients.
