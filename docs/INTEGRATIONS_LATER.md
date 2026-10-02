# Integrations still to activate

| Capability      | Current behavior                                         | Work before activation                                                                                                                                     |
| --------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Card payments   | Disabled; no money transferred by simulator              | Provider selection, private credentials, intent/payment lifecycle, signed webhook inbox, event deduplication, reconciliation, refunds and end-to-end tests |
| Offline payment | Explicitly gated; staff records receipt through approval | Merchant process, approved instructions, reconciliation and operational ownership                                                                          |
| Courier         | Manual shipment/tracking recording                       | Credentials, actual serviceable zones/rates, labels, tracking callbacks and failure handling                                                               |
| Email           | Private development mailbox; Resend adapter for recovery | Verified sender, provider credential, delivery test, order notification templates, webhook handling and privacy/retention policy                           |
| Storage         | Private local development uploads; S3 adapter            | Production bucket, private credentials, access policy, backup/restore and persistence test                                                                 |
| AI              | OpenAI/Anthropic adapters and five curated tools         | Provider/model choice, credentials, live evaluations, spend controls and monitoring                                                                        |
| Tax/legal       | Demo unregistered zero-tax setting and draft pages       | Verified legal identity, tax registration decision, accountant-approved rules and consumer terms                                                           |
| Business data   | 50 labelled demo products and sample rates               | Supplier-verified specs, prices, stock, warranties, licensed media and actual shipping commitments                                                         |
| Analytics       | Internal operational counts excluding demo sales         | Approved analytics/consent approach, events and data-retention rules                                                                                       |

Credentials must be supplied through private runtime configuration. Missing integrations have explicit disabled or blocked behavior. No provider subscription, outbound message, paid resource or deployment was created during development.
