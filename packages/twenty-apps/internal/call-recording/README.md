# OpenPhone / Quo call recording

This app adds a **Call with OpenPhone** command to Person records and imports
completed call recordings into the Call recordings object.

## OpenPhone / Quo setup

1. Set `OPENPHONE_WEBHOOK_SIGNING_KEY` for the app runtime to the base64 signing
   key shown by OpenPhone / Quo when the webhook is created.
2. Deploy the app and copy the public URL for the `openphone-webhook` logic
   function (`/openphone/webhook`).
3. In OpenPhone / Quo, create a webhook for `call.recording.completed` and point
   it at that URL.
4. Set OpenPhone / Quo as the operating system's default handler for `tel:`
   links to enable CRM click-to-call.

Webhook requests are HMAC verified, rejected after five minutes, and processed
idempotently by provider call ID. Imported audio is copied into Twenty file
storage and linked to a Person when the external phone number matches the
Person's primary phone number.

This is a [Twenty](https://twenty.com) application project bootstrapped with [`create-twenty-app`](https://www.npmjs.com/package/create-twenty-app).

## Getting Started

First, authenticate to your workspace:

```bash
yarn twenty remote add --api-url http://localhost:2020 --as local
```

Then, start development mode to sync your app and watch for changes:

```bash
yarn twenty dev
```

Open your Twenty instance and go to `/settings/applications` section to see the result.

## Available Commands

Run `yarn twenty help` to list all available commands. Common commands:

```bash
# Remotes & Authentication
yarn twenty remote add --api-url http://localhost:2020 --as local     # Authenticate with Twenty
yarn twenty remote status         # Check auth status
yarn twenty remote switch         # Switch default remote
yarn twenty remote list           # List all configured remotes
yarn twenty remote remove <name>  # Remove a remote

# Application
yarn twenty dev        # Start dev mode (watch, build, sync, and auto-generate typed client)
yarn twenty add     # Add a new entity (object, field, function, front-component, role, view, navigation-menu-item)
yarn twenty logs  # Stream function logs
yarn twenty exec  # Execute a function with JSON payload
yarn twenty uninstall  # Uninstall app from workspace
```

## LLMs instructions

Main docs and pitfalls are available in LLMS.md file.

## Learn More

To learn more about Twenty applications, take a look at the following resources:

- [twenty-sdk](https://www.npmjs.com/package/twenty-sdk) - learn about `twenty-sdk` tool.
- [Twenty doc](https://docs.twenty.com/) - Twenty's documentation.
- Join our [Discord](https://discord.gg/cx5n4Jzs57)

You can check out [the Twenty GitHub repository](https://github.com/twentyhq/twenty) - your feedback and contributions are welcome!
